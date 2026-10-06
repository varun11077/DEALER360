# DEALER360 — Enterprise B2B Dealer Operations Platform

DEALER360 is an enterprise-grade **B2B Dealer Operations Platform** built on **SAP Business Technology Platform (BTP)** using **SAP Cloud Application Programming Model (CAP)** with **Node.js**, **SAP HANA Cloud**, **XSUAA**, **SAP Fiori/UI5**, and **SAP Build Process Automation (BPA)**.

The platform manages the complete dealer business lifecycle, including:

* Dealer onboarding and approval
* Dealer master data
* Product and pricing management
* Credit management
* Purchase requisitions
* Purchase orders
* Approval workflows
* Credit validation
* Allocation and fulfillment
* Dispatch and delivery
* Billing lifecycle
* Audit/history tracking
* Enterprise integration
* Event/outbox processing
* Security and role-based access

---

## 1. Business Objective

DEALER360 provides a centralized platform for managing B2B dealer operations.

The high-level business flow is:

```text
Dealer
   │
   ▼
Dealer Onboarding
   │
   ▼
Validation
   │
   ▼
Approval
   │
   ▼
ACTIVE Dealer
   │
   ├──────────────► Master Data
   │
   ├──────────────► Pricing
   │
   └──────────────► Credit Management
                         │
                         ▼
                 Purchase Requisition
                         │
                         ▼
                   Validation
                         │
                         ▼
                 BPA Approval
                         │
                         ▼
                  Purchase Order
                         │
                         ▼
                   Credit Check
                         │
                         ▼
                    Allocation
                         │
                         ▼
                     Dispatch
                         │
                         ▼
                     Delivery
                         │
                         ▼
                     Billing
                         │
                         ▼
                      Closed
```

---

# 2. Technology Stack

| Area                  | Technology                                |
| --------------------- | ----------------------------------------- |
| Application Framework | SAP CAP                                   |
| Backend               | Node.js                                   |
| Programming Language  | JavaScript                                |
| Data Model            | CDS                                       |
| Database              | SAP HANA Cloud                            |
| Local Database        | SQLite                                    |
| API                   | OData V4                                  |
| Authentication        | SAP XSUAA                                 |
| Platform              | SAP BTP                                   |
| Runtime               | Cloud Foundry                             |
| Frontend              | SAPUI5 / Fiori                            |
| Enterprise Launchpad  | SAP Build Work Zone                       |
| Workflow              | SAP Build Process Automation              |
| Connectivity          | SAP Destination Service                   |
| Logging               | SAP Application Logging                   |
| Scheduling            | SAP Job Scheduler                         |
| Deployment            | MTA / Cloud Foundry                       |
| Development           | SAP Business Application Studio / VS Code |

---

# 3. High-Level Architecture

```text
                         SAP BTP
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                  SAP Build Work Zone                        │
│                         │                                   │
│                         ▼                                   │
│                  Fiori / UI5 Application                    │
│                         │                                   │
│                         ▼                                   │
│                    Application Router                       │
│                         │                                   │
│                         ▼                                   │
│                 Destination Service                         │
│                         │                                   │
│                         ▼                                   │
│              SAP CAP Node.js Backend                        │
│                         │                                   │
│          ┌──────────────┼──────────────┐                    │
│          │              │              │                    │
│          ▼              ▼              ▼                    │
│      Business       Security       Integration              │
│       Logic          XSUAA          Services                 │
│          │              │              │                    │
│          └──────────────┼──────────────┘                    │
│                         │                                   │
│                         ▼                                   │
│                   SAP HANA Cloud                            │
│                                                             │
│                         │                                   │
│                         ▼                                   │
│              SAP Build Process Automation                   │
│                    Approval Workflow                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

# 4. Project Structure

The backend is organized into database models, services, business logic, configuration and testing.

```text
DEALER360/
│
├── app/
│   └── ...
│
├── db/
│   ├── schema.cds
│   ├── dealer.cds
│   ├── master-data.cds
│   ├── pricing.cds
│   ├── credit.cds
│   ├── purchasing.cds
│   ├── approval.cds
│   └── integration.cds
│
├── srv/
│   ├── dealer-service.cds
│   ├── dealer-service.js
│   │
│   ├── credit-service.cds
│   ├── credit-service.js
│   │
│   ├── integration-service.cds
│   ├── integration-service.js
│   │
│   ├── purchase-requisition-service.cds
│   ├── purchase-requisition-service.js
│   │
│   ├── purchase-requisition-approval-service.cds
│   ├── purchase-requisition-approval-service.js
│   │
│   └── lib/
│       └── credit-manager.js
│
├── test/
│   └── backend-smoke.sh
│
├── package.json
├── mta.yaml
├── xs-security.json
├── README.md
└── ...
```

---

# 5. Core Business Modules

## 5.1 Dealer Management

Dealer Management handles the complete dealer onboarding lifecycle.

### Dealer lifecycle

```text
PENDING
   │
   ▼
SUBMITTED
   │
   ▼
L1_APPROVED
   │
   ▼
ACTIVE
```

Alternative paths:

```text
SUBMITTED ─────► REJECTED

ACTIVE ────────► BLOCKED
```

The dealer module handles:

* Dealer creation
* GST validation
* PAN validation
* Phone validation
* Email validation
* Duplicate checking
* Dealer code generation
* Dealer submission
* Approval
* Rejection
* Blocking
* Status history
* Approval history
* Dealer addresses
* Dealer contacts
* Dealer documents

---

# 6. Master Data

Master data provides the reference information required by the business processes.

Typical master data includes:

```text
Dealer
Product
Region
State
Customer
Plant
Material
Pricing Information
Credit Information
```

Master data is consumed by purchasing, pricing, credit and fulfillment processes.

---

# 7. Pricing Management

Pricing determines the applicable price for products purchased by dealers.

The pricing flow is:

```text
Dealer
   +
Product
   +
Quantity
   │
   ▼
Pricing Rules
   │
   ▼
Applicable Price
   │
   ▼
Purchase Requisition
```

Pricing information is used when calculating the total value of purchase requisitions and purchase orders.

---

# 8. Credit Management

Credit Management controls the financial exposure of a dealer.

The process is:

```text
Dealer
   │
   ▼
Credit Limit
   │
   ▼
Existing Exposure
   │
   ▼
Available Credit
   │
   ▼
New Order Value
   │
   ▼
Credit Check
```

The system can determine whether a dealer has sufficient available credit before fulfillment.

The backend contains dedicated credit business logic through:

```text
srv/credit-service.js
srv/lib/credit-manager.js
```

---

# 9. Purchase Requisition

The Purchase Requisition process starts when a dealer requests products.

```text
Dealer
   │
   ▼
Create Purchase Requisition
   │
   ▼
Add Items
   │
   ├── Product
   ├── Quantity
   ├── Price
   └── Total Value
   │
   ▼
Validation
   │
   ▼
Submit PR
```

The purchase requisition contains the business information required to create the downstream purchase order.

---

# 10. Purchase Requisition Approval

Approval is handled separately from the core purchase requisition processing.

The main files are:

```text
srv/purchase-requisition-approval-service.cds
srv/purchase-requisition-approval-service.js
db/approval.cds
```

This separation keeps the purchase requisition business logic independent from the approval integration.

---

# 11. SAP Build Process Automation

SAP Build Process Automation is used for the approval workflow.

The intended process is:

```text
Purchase Requisition
        │
        ▼
Calculate PR Value
        │
        ▼
Check Approval Requirement
        │
        ▼
PR requires approval?
        │
       YES
        │
        ▼
Create BPA Approval Request
        │
        ▼
SAP Build Process Automation
        │
        ▼
Approver
        │
        ├──────────────► Approve
        │
        └──────────────► Reject
        │
        ▼
CAP Callback
        │
        ▼
Update Approval Status
        │
        ▼
Continue PR → PO
```

The configured business process is:

```text
DEALER360_PR_APPROVAL
```

The intended BPA destination is:

```text
DEALER360_BPA
```

### Approval rule

The current business requirement is:

```text
PR Value > ₹20,00,000
        │
        ▼
BPA Approval Required
```

For PRs at or below the threshold, the approval path can be bypassed according to the configured business rules.

---

# 12. BPA Integration Design

The CAP application does not directly mix BPA communication with every purchasing operation.

Instead, the approval functionality is isolated in:

```text
purchase-requisition-approval-service.js
```

The service is responsible for:

1. Starting an approval request
2. Building the BPA payload
3. Maintaining approval request information
4. Recording approval history
5. Handling approval decisions
6. Maintaining correlation information
7. Updating the purchase requisition state

Conceptually:

```text
CAP
 │
 │ Start Approval
 ▼
Approval Service
 │
 │ BPA Payload
 ▼
Destination
 │
 ▼
SAP Build Process Automation
 │
 │ Approver Decision
 ▼
CAP Callback
 │
 ▼
Approval Service
 │
 ▼
Purchase Requisition Status
```

---

# 13. Approval Persistence

Approval-related information is maintained separately from the main purchasing entities.

Important concepts include:

```text
PurchaseRequisitionApprovalRequests
PurchaseRequisitionApprovalHistory
OutboxEvents
```

This allows the system to maintain an audit trail of approval activity.

Example:

```text
PR
 │
 ├── Approval Request
 │       │
 │       ├── BPA Instance ID
 │       ├── BPA Task ID
 │       ├── Correlation ID
 │       └── Status
 │
 └── Approval History
         │
         ├── Submitted
         ├── Approved
         └── Rejected
```

---

# 14. Outbox Pattern

DEALER360 uses an outbox-based approach for reliable event handling.

Instead of relying only on an external API call, the application can persist an event representing the operation.

```text
Business Transaction
       │
       ├────────► Business Data
       │
       └────────► Outbox Event
                       │
                       ▼
                  Integration
```

This helps prevent a situation where the business transaction succeeds but the external integration request is lost.

---

# 15. Purchase Order Flow

Once the purchase requisition has completed its required approval:

```text
Purchase Requisition
        │
        ▼
Approval Completed
        │
        ▼
Purchase Order Creation
        │
        ▼
PO
```

The purchase order lifecycle is:

```text
DRAFT
  │
  ▼
SUBMITTED
  │
  ▼
PENDING_APPROVAL
  │
  ▼
APPROVED
  │
  ▼
CREDIT_BLOCKED / ALLOCATED
  │
  ▼
DISPATCHED
  │
  ▼
DELIVERED
  │
  ▼
INVOICED
  │
  ▼
CLOSED
```

A cancellation path is also supported:

```text
Any applicable state
        │
        ▼
CANCELLED
```

---

# 16. Credit Check Before Fulfillment

Before shipment/fulfillment, the system performs a credit validation.

```text
Approved PO
     │
     ▼
Credit Check
     │
     ├────────► Credit Available
     │                │
     │                ▼
     │            Allocation
     │
     └────────► Credit Insufficient
                      │
                      ▼
                CREDIT_BLOCKED
```

This ensures that fulfillment does not proceed when the dealer exceeds the allowed credit exposure.

---

# 17. Fulfillment Flow

After successful credit validation:

```text
Approved PO
    │
    ▼
Credit Check
    │
    ▼
Allocation
    │
    ▼
Dispatch
    │
    ▼
Delivery
    │
    ▼
Billing
```

The fulfillment process tracks the operational state of the order.

---

# 18. Security

DEALER360 uses **SAP XSUAA** for authentication and authorization.

The application supports role-based access.

Important roles include:

```text
TAFE_ADMIN
TAFE_SALES
DEALER_USER
L1_APPROVER
L2_APPROVER
FINANCE
OPERATIONS
```

Conceptually:

```text
User
 │
 ▼
XSUAA Authentication
 │
 ▼
JWT Token
 │
 ▼
Scopes / Roles
 │
 ▼
CAP Authorization
 │
 ▼
Business Operation
```

Unauthorized users should receive:

```text
401 Unauthorized
```

when authentication is missing/invalid, and:

```text
403 Forbidden
```

when authentication exists but the user does not have the required authorization.

---

# 19. CAP Architecture

The backend follows the SAP CAP architecture:

```text
CDS Data Model
      │
      ▼
Service Definition
      │
      ▼
Service Handler
      │
      ▼
Business Logic
      │
      ▼
Database / External Service
```

### Database layer

```text
db/*.cds
```

Defines:

* Entities
* Types
* Associations
* Compositions
* Constraints
* Persistence model

### Service layer

```text
srv/*.cds
```

Defines:

* OData services
* Entities exposed to consumers
* Actions
* Functions

### Implementation layer

```text
srv/*.js
```

Contains:

* Validation
* Business rules
* Transactions
* Custom actions
* External integration
* Error handling

---

# 20. Transaction Management

Business operations are executed using CAP transactions.

Conceptually:

```text
Request
  │
  ▼
CAP Transaction
  │
  ├── Validate
  │
  ├── Read
  │
  ├── Update
  │
  ├── Insert
  │
  └── Commit
        │
        ├── Success → COMMIT
        │
        └── Error   → ROLLBACK
```

This is particularly important for operations such as dealer submission, approval and purchasing.

---

# 21. OData API

The backend exposes OData V4 services.

Examples of business areas exposed through services include:

```text
Dealer Management
Credit Management
Purchase Requisition
Purchase Order
Fulfillment
Pricing
Approval
Integration
```

The frontend communicates with these services through OData.

---

# 22. Fiori / UI5 Integration

The frontend is designed as a separate UI5/Fiori application.

The architecture is:

```text
Fiori/UI5
   │
   ▼
App Router
   │
   ▼
Destination
   │
   ▼
DEALER360 CAP OData Service
```

The UI is responsible for:

* Dealer management screens
* Purchasing screens
* Approval screens
* Credit information
* Order tracking
* Operational monitoring

The backend remains responsible for business rules and persistence.

---

# 23. SAP Build Work Zone

Build Work Zone acts as the enterprise entry point.

```text
SAP Build Work Zone
        │
        ▼
DEALER360 Application
        │
        ▼
Fiori/UI5
        │
        ▼
CAP Backend
```

This provides a centralized enterprise launch experience for the application.

---

# 24. Destination Service

External connectivity is handled through SAP BTP Destination Service.

The architecture is:

```text
Application
    │
    ▼
Destination
    │
    ▼
External Service
```

The project uses the destination-based approach instead of hard-coding external URLs inside business logic.

The BPA destination is intended to be:

```text
DEALER360_BPA
```

---

# 25. HANA Cloud

For cloud deployment, SAP HANA Cloud is the target persistence layer.

```text
CAP CDS
   │
   ▼
HDI Container
   │
   ▼
SAP HANA Cloud
```

For local development, SQLite can be used.

```text
Local Development
       │
       ▼
SQLite

Cloud Deployment
       │
       ▼
SAP HANA Cloud
```

This allows the application to be developed and tested locally before cloud deployment.

---

# 26. Cloud Foundry Deployment

The application is designed for deployment on SAP BTP Cloud Foundry.

The major deployment components are:

```text
MTA
 │
 ├── CAP Application
 │
 ├── HANA / HDI
 │
 ├── XSUAA
 │
 ├── Destination
 │
 └── Other BTP Services
```

The main deployment descriptor is:

```text
mta.yaml
```

Security configuration is maintained through:

```text
xs-security.json
```

---

# 27. End-to-End Business Flow

The complete DEALER360 business process is:

```text
                         DEALER360
                             │
                             ▼
                    Dealer Registration
                             │
                             ▼
                       Validation
                             │
                             ▼
                     Dealer Approval
                             │
                             ▼
                       ACTIVE Dealer
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
          Master Data      Pricing       Credit
              │              │              │
              └──────────────┼──────────────┘
                             │
                             ▼
                  Purchase Requisition
                             │
                             ▼
                         Validation
                             │
                             ▼
                    Calculate PR Value
                             │
                             ▼
                    Approval Required?
                       /           \
                     YES            NO
                      │              │
                      ▼              │
               BPA Approval          │
                      │              │
                ┌─────┴─────┐        │
                ▼           ▼        │
             APPROVE      REJECT     │
                │           │        │
                │           └──► END │
                │                    │
                └──────────┬─────────┘
                           ▼
                    Purchase Order
                           │
                           ▼
                      Credit Check
                       /         \
                 PASS             FAIL
                  │                 │
                  ▼                 ▼
              Allocation      CREDIT_BLOCKED
                  │
                  ▼
               Dispatch
                  │
                  ▼
               Delivery
                  │
                  ▼
                Billing
                  │
                  ▼
                Closed
```

---

# 28. Error Handling

The backend validates business conditions before modifying data.

Examples include:

```text
Invalid GST
Invalid PAN
Duplicate Dealer
Invalid Email
Invalid Phone
Dealer Not Active
Insufficient Credit
Unauthorized Approval
Invalid Status Transition
Invalid Purchase Quantity
Invalid Product
Invalid Approval Decision
```

The application uses appropriate HTTP errors such as:

```text
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
500 Internal Server Error
```

---

# 29. Testing

Backend smoke testing is available through:

```text
test/backend-smoke.sh
```

The test suite validates the major OData endpoints and business services.

Typical checks include:

```text
GET Dealers
GET DealerCredits
GET PurchaseOrders
GET PurchaseRequisitions
GET Fulfillments
GET Pricing
```

The objective is to verify that the backend services remain functional after changes.

---

# 30. Local Development

Install dependencies:

```bash
npm install
```

Start the CAP application:

```bash
cds watch
```

or:

```bash
cds-serve
```

The local environment can use SQLite for development and testing.

---

# 31. Recommended Development Sequence

When extending the project, follow this sequence:

```text
1. CDS Data Model
       ↓
2. Service Definition
       ↓
3. Service Handler
       ↓
4. Business Logic
       ↓
5. Transaction Handling
       ↓
6. Integration
       ↓
7. Security
       ↓
8. Testing
       ↓
9. Deployment
```

For BPA specifically:

```text
Purchase Requisition
        ↓
Approval Rule
        ↓
Approval Service
        ↓
BPA Payload
        ↓
Destination
        ↓
Build Process Automation
        ↓
Approval Task
        ↓
Callback
        ↓
CAP Approval Update
        ↓
PO Creation
```

---

# 32. Project Design Principles

DEALER360 follows these principles:

### Separation of concerns

Business domains are separated into dedicated CDS models and services.

### Backend-first business validation

Critical business rules are implemented in the CAP backend rather than relying only on UI validation.

### Transactional consistency

Related database operations are executed within CAP transactions.

### Secure-by-default

Authentication and authorization are handled through XSUAA and role-based access.

### External integration isolation

External systems such as BPA are isolated behind dedicated integration/approval services.

### Auditability

Approval and status history are maintained for important business operations.

### Cloud-ready architecture

The project is designed for SAP BTP Cloud Foundry and SAP HANA Cloud.

---

# 33. Current Architecture Summary

```text
                    ┌──────────────────────┐
                    │   SAP Build WorkZone │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │    Fiori / UI5       │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │    App Router        │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Destination Service  │
                    └──────────┬───────────┘
                               │
                               ▼
        ┌─────────────────────────────────────────┐
        │          CAP Node.js Backend            │
        │                                         │
        │  Dealer        Credit       Pricing     │
        │     │            │            │         │
        │     └────────────┼────────────┘         │
        │                  │                      │
        │          Purchasing                     │
        │                  │                      │
        │          Approval Service               │
        │                  │                      │
        │          Integration                    │
        └──────────────────┬──────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
      ┌───────────────┐       ┌────────────────────┐
      │ SAP HANA Cloud│       │ Build Process      │
      │ / HDI         │       │ Automation         │
      └───────────────┘       └────────────────────┘
```

---

# 34. Project Status

The core DEALER360 backend is operational and supports the major business domains and backend APIs.

The architecture is prepared for the next enterprise integration steps, including:

* SAP Build Process Automation
* Destination-based BPA connectivity
* Cloud Foundry deployment
* SAP HANA Cloud deployment
* Application Logging
* Job Scheduler
* Build Work Zone
* Fiori/UI5 integration

---

# 35. Key Files

| File                                            | Responsibility                     |
| ----------------------------------------------- | ---------------------------------- |
| `db/schema.cds`                                 | Common database definitions        |
| `db/dealer.cds`                                 | Dealer domain                      |
| `db/master-data.cds`                            | Master/reference data              |
| `db/pricing.cds`                                | Pricing domain                     |
| `db/credit.cds`                                 | Credit domain                      |
| `db/purchasing.cds`                             | Purchasing domain                  |
| `db/approval.cds`                               | Approval persistence               |
| `db/integration.cds`                            | Integration/event model            |
| `srv/dealer-service.js`                         | Dealer business logic              |
| `srv/credit-service.js`                         | Credit business logic              |
| `srv/purchase-requisition-service.js`           | PR business logic                  |
| `srv/purchase-requisition-approval-service.js`  | BPA/approval integration           |
| `srv/purchase-requisition-approval-service.cds` | Approval APIs                      |
| `srv/lib/credit-manager.js`                     | Credit calculation/business helper |
| `mta.yaml`                                      | BTP deployment configuration       |
| `xs-security.json`                              | XSUAA security configuration       |
| `test/backend-smoke.sh`                         | Backend smoke tests                |

---

# 36. Summary

DEALER360 is designed as an enterprise B2B platform on SAP BTP.

The core business journey is:

```text
Dealer
  ↓
Dealer Onboarding
  ↓
Master Data / Pricing / Credit
  ↓
Purchase Requisition
  ↓
BPA Approval
  ↓
Purchase Order
  ↓
Credit Check
  ↓
Allocation
  ↓
Dispatch
  ↓
Delivery
  ↓
Billing
  ↓
Closed
```

The platform combines:

**SAP CAP + Node.js + CDS + OData V4 + SAP HANA Cloud + XSUAA + Destination Service + Fiori/UI5 + Build Work Zone + Build Process Automation + Cloud Foundry**

to provide a complete enterprise dealer management and order fulfillment solution.
