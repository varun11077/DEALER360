const cds = require("@sap/cds");

const {
    Dealers,
    DealerCredits,
    PurchaseOrders,
    Fulfillments,
    PurchaseRequisitions,
    DealerStatusHistory,
    PurchaseOrderStatusHistory
} = cds.entities("dealer360");


/* =========================================================
   STATUS GROUPS
   ========================================================= */

/* Orders that count toward business value */

const VALUE_EXCLUDED = ["DRAFT", "CANCELLED", "REJECTED"];

/* Orders still moving through the process */

const ORDER_CLOSED = ["DRAFT", "CLOSED", "CANCELLED", "REJECTED"];

const FULFILLMENT_CLOSED = ["CLOSED", "CANCELLED"];

const REQUISITION_PENDING = ["SUBMITTED", "PENDING_APPROVAL"];


/* =========================================================
   HELPERS
   ========================================================= */

const round2 = (n) =>
    Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const toDay = (d) =>
    d.toISOString().slice(0, 10);

function defaultRange(from, to) {

    const end = to ? new Date(to) : new Date();

    const start = from
        ? new Date(from)
        : new Date(
            Date.UTC(
                end.getUTCFullYear(),
                end.getUTCMonth() - 11,
                1
            )
        );

    return {
        from: toDay(start),
        to: toDay(end)
    };
}

/* Every month between from and to, so charts have no gaps */

function monthsBetween(from, to) {

    const months = [];

    const cursor = new Date(from.slice(0, 7) + "-01T00:00:00Z");

    const last = new Date(to.slice(0, 7) + "-01T00:00:00Z");

    while (cursor <= last) {

        months.push(cursor.toISOString().slice(0, 7));

        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }

    return months;
}

async function countByStatus(tx, entity) {

    const rows =
        await tx.run(
            SELECT.from(entity)
                .columns("status", "count(*) as total")
                .groupBy("status")
        );

    return rows
        .map((r) => ({
            status: r.status,
            count: Number(r.total)
        }))
        .sort((a, b) => b.count - a.count);
}

const sumCounts = (rows, statuses) =>
    rows
        .filter((r) => statuses.includes(r.status))
        .reduce((total, r) => total + r.count, 0);


/* =========================================================
   SERVICE
   ========================================================= */

module.exports = cds.service.impl(function () {

    this.on("overview", async (req) => {

        const tx = cds.tx(req);

        const range =
            defaultRange(req.data.dateFrom, req.data.dateTo);

        if (range.from > range.to) {
            return req.reject(400, "'dateFrom' must not be after 'dateTo'.");
        }

        /* ---------- parallel reads ---------- */

        const [
            dealersByStatus,
            ordersByStatusAll,
            fulfillmentsByStatus,
            requisitionsByStatus,
            credits,
            orders,
            dealerHistory,
            orderHistory
        ] = await Promise.all([

            countByStatus(tx, Dealers),

            countByStatus(tx, PurchaseOrders),

            countByStatus(tx, Fulfillments),

            countByStatus(tx, PurchaseRequisitions),

            tx.run(
                SELECT.from(DealerCredits)
                    .columns(
                        "dealer.ID as dealerId",
                        "dealer.dealerCode as dealerCode",
                        "dealer.legalName as dealerName",
                        "creditLimit",
                        "usedCredit",
                        "isBlocked",
                        "currency"
                    )
            ),

            tx.run(
                SELECT.from(PurchaseOrders)
                    .columns(
                        "status",
                        "orderDate",
                        "createdAt",
                        "totalAmount",
                        "currency",
                        "dealer.ID as dealerId",
                        "dealer.dealerCode as dealerCode",
                        "dealer.legalName as dealerName"
                    )
            ),

            tx.run(
                SELECT.from(DealerStatusHistory)
                    .columns(
                        "changedAt",
                        "previousStatus",
                        "newStatus",
                        "changedByName",
                        "reason",
                        "dealer.legalName as reference"
                    )
                    .orderBy("changedAt desc")
                    .limit(10)
            ),

            tx.run(
                SELECT.from(PurchaseOrderStatusHistory)
                    .columns(
                        "changedAt",
                        "previousStatus",
                        "newStatus",
                        "changedByName",
                        "reason",
                        "purchaseOrder.purchaseOrderNumber as reference"
                    )
                    .orderBy("changedAt desc")
                    .limit(10)
            )
        ]);


        /* ---------- orders inside the selected range ---------- */

        const orderDay = (o) =>
            String(o.orderDate || o.createdAt || "").slice(0, 10);

        const inRange = orders.filter((o) => {

            const day = orderDay(o);

            return day >= range.from && day <= range.to;
        });

        const valued =
            inRange.filter(
                (o) => !VALUE_EXCLUDED.includes(o.status)
            );

        const ordersByStatus = [];

        {
            const counts = {};

            for (const o of inRange) {
                counts[o.status] = (counts[o.status] || 0) + 1;
            }

            for (const [status, count] of Object.entries(counts)) {
                ordersByStatus.push({ status, count });
            }

            ordersByStatus.sort((a, b) => b.count - a.count);
        }


        /* ---------- monthly trend ---------- */

        const monthly = {};

        for (const m of monthsBetween(range.from, range.to)) {
            monthly[m] = { month: m, orderCount: 0, totalAmount: 0 };
        }

        for (const o of valued) {

            const m = orderDay(o).slice(0, 7);

            if (!monthly[m]) {
                continue;
            }

            monthly[m].orderCount += 1;

            monthly[m].totalAmount += Number(o.totalAmount || 0);
        }

        const monthlyOrders =
            Object.values(monthly).map((m) => ({
                ...m,
                totalAmount: round2(m.totalAmount)
            }));


        /* ---------- top dealers by order value ---------- */

        const byDealer = {};

        for (const o of valued) {

            const d =
                byDealer[o.dealerId] ||
                (byDealer[o.dealerId] = {
                    dealerId: o.dealerId,
                    dealerCode: o.dealerCode,
                    dealerName: o.dealerName,
                    orderCount: 0,
                    totalAmount: 0
                });

            d.orderCount += 1;

            d.totalAmount += Number(o.totalAmount || 0);
        }

        const topDealers =
            Object.values(byDealer)
                .sort((a, b) => b.totalAmount - a.totalAmount)
                .slice(0, 5)
                .map((d) => ({
                    ...d,
                    totalAmount: round2(d.totalAmount)
                }));


        /* ---------- credit utilisation ---------- */

        /*
         * available = limit - used (authoritative formula).
         * The stored availableCredit column is display data
         * and must not be trusted for reporting.
         */

        let totalLimit = 0;

        let totalUsed = 0;

        const creditUtilization =
            credits
                .map((c) => {

                    const limit = Number(c.creditLimit || 0);

                    const used = Number(c.usedCredit || 0);

                    totalLimit += limit;

                    totalUsed += used;

                    return {
                        dealerId: c.dealerId,
                        dealerCode: c.dealerCode,
                        dealerName: c.dealerName,
                        creditLimit: round2(limit),
                        usedCredit: round2(used),
                        availableCredit: round2(Math.max(limit - used, 0)),
                        utilizationPct:
                            limit > 0
                                ? round2((used / limit) * 100)
                                : 0,
                        isBlocked: !!c.isBlocked
                    };
                })
                .sort((a, b) => b.utilizationPct - a.utilizationPct)
                .slice(0, 8);


        /* ---------- activity feed ---------- */

        const recentActivity = [

            ...dealerHistory.map((h) => ({
                occurredAt: h.changedAt,
                category: "DEALER",
                reference: h.reference,
                fromStatus: h.previousStatus,
                toStatus: h.newStatus,
                changedBy: h.changedByName,
                reason: h.reason
            })),

            ...orderHistory.map((h) => ({
                occurredAt: h.changedAt,
                category: "ORDER",
                reference: h.reference,
                fromStatus: h.previousStatus,
                toStatus: h.newStatus,
                changedBy: h.changedByName,
                reason: h.reason
            }))
        ]
            .filter((a) => a.occurredAt)
            .sort((a, b) =>
                String(b.occurredAt).localeCompare(String(a.occurredAt))
            )
            .slice(0, 10);


        /* ---------- KPIs ---------- */

        const totalDealers =
            dealersByStatus.reduce((t, r) => t + r.count, 0);

        const openOrdersAll =
            ordersByStatusAll
                .filter((r) => !ORDER_CLOSED.includes(r.status))
                .reduce((t, r) => t + r.count, 0);

        const kpis = {
            totalDealers,
            activeDealers: sumCounts(dealersByStatus, ["ACTIVE"]),
            pendingApprovals:
                sumCounts(dealersByStatus, ["SUBMITTED", "L1_APPROVED"]),
            blockedDealers: sumCounts(dealersByStatus, ["BLOCKED"]),

            totalCreditLimit: round2(totalLimit),
            totalCreditUsed: round2(totalUsed),
            creditUtilizationPct:
                totalLimit > 0
                    ? round2((totalUsed / totalLimit) * 100)
                    : 0,

            totalOrders: inRange.length,
            orderValue:
                round2(
                    valued.reduce(
                        (t, o) => t + Number(o.totalAmount || 0),
                        0
                    )
                ),

            /* open / blocked are current-state numbers, not date-filtered */
            openOrders: openOrdersAll,
            creditBlockedOrders:
                sumCounts(ordersByStatusAll, ["CREDIT_BLOCKED"]),
            openFulfillments:
                fulfillmentsByStatus
                    .filter((r) => !FULFILLMENT_CLOSED.includes(r.status))
                    .reduce((t, r) => t + r.count, 0),
            pendingRequisitions:
                sumCounts(requisitionsByStatus, REQUISITION_PENDING),

            currency: orders[0]?.currency || credits[0]?.currency || "INR"
        };


        return {
            kpis,
            dealersByStatus,
            ordersByStatus,
            fulfillmentsByStatus,
            monthlyOrders,
            topDealers,
            creditUtilization,
            recentActivity,
            dateFrom: range.from,
            dateTo: range.to
        };
    });
});
