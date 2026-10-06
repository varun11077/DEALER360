/* =========================================================
   DEALER360 DASHBOARD SERVICE
   ---------------------------------------------------------
   Read-only aggregation service for the dashboard UI.

   One call (overview) returns everything the dashboard needs:
   KPI cards, chart series and the recent activity feed.
   The UI no longer has to issue many $count requests.
   ========================================================= */

@path: '/dashboard'
@title: 'DEALER360 Dashboard Service'
@description: 'Aggregated KPIs and chart data for the DEALER360 dashboard'

service DashboardService {

    type StatusCount {
        status : String(30);
        count  : Integer;
    }

    type MonthlyOrders {
        month       : String(7);          // YYYY-MM
        orderCount  : Integer;
        totalAmount : Decimal(18, 2);
    }

    type DealerValue {
        dealerId    : UUID;
        dealerCode  : String(20);
        dealerName  : String(200);
        orderCount  : Integer;
        totalAmount : Decimal(18, 2);
    }

    type CreditUtilization {
        dealerId        : UUID;
        dealerCode      : String(20);
        dealerName      : String(200);
        creditLimit     : Decimal(18, 2);
        usedCredit      : Decimal(18, 2);
        availableCredit : Decimal(18, 2);
        utilizationPct  : Decimal(5, 2);
        isBlocked       : Boolean;
    }

    type ActivityItem {
        occurredAt : Timestamp;
        category   : String(20);          // DEALER | ORDER
        reference  : String(100);         // dealer name / PO number
        fromStatus : String(30);
        toStatus   : String(30);
        changedBy  : String(255);
        reason     : String(1000);
    }

    type Kpis {
        totalDealers         : Integer;
        activeDealers        : Integer;
        pendingApprovals     : Integer;   // SUBMITTED + L1_APPROVED
        blockedDealers       : Integer;
        totalCreditLimit     : Decimal(18, 2);
        totalCreditUsed      : Decimal(18, 2);
        creditUtilizationPct : Decimal(5, 2);
        totalOrders          : Integer;   // in the selected range
        orderValue           : Decimal(18, 2);
        openOrders           : Integer;
        creditBlockedOrders  : Integer;
        openFulfillments     : Integer;
        pendingRequisitions  : Integer;
        currency             : String(3);
    }

    type Overview {
        kpis                : Kpis;
        dealersByStatus     : many StatusCount;
        ordersByStatus      : many StatusCount;
        fulfillmentsByStatus: many StatusCount;
        monthlyOrders       : many MonthlyOrders;
        topDealers          : many DealerValue;
        creditUtilization   : many CreditUtilization;
        recentActivity      : many ActivityItem;
        dateFrom            : Date;
        dateTo              : Date;
    }

    /*
     * dateFrom / dateTo : optional order date range (inclusive).
     *                     Default: last 12 months.
     */
    function overview(
        dateFrom : Date,
        dateTo   : Date
    ) returns Overview;
}
