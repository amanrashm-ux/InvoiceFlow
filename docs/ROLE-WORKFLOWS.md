# InvoiceFlow role workflows and API map

## Supplier workspace

1. Opens Overview and sees invoices associated with `SUP-001`.
2. Creates an invoice from the Invoices page.
3. The browser calls `POST /api/invoices`; Gateway routes to Invoice Service.
4. Invoice Service validates fields, persists `SUBMITTED`, and writes `invoice.created` to its outbox.
5. Supplier watches invoice status and their financing application list. Financing appears only after buyer acceptance and risk processing.

Create payload:

```json
{
  "supplierId": "SUP-001",
  "buyerId": "BUY-001",
  "invoiceNumber": "INV-1001",
  "currency": "INR",
  "amount": 125000,
  "issueDate": "2026-11-01",
  "dueDate": "2026-12-01"
}
```

Expected HTTP 201 response: `invoiceId`, `status: SUBMITTED`, and a message indicating the event was queued in the outbox.

## Buyer workspace

1. Opens invoices addressed to `BUY-001`.
2. Reviews supplier, invoice number, amount and due date.
3. Accepts or rejects invoices in `SUBMITTED` status.
4. Accept: `POST /api/invoices/{id}/accept`; the invoice becomes `ACCEPTED` and `invoice.accepted` is written to the outbox.
5. Reject: `POST /api/invoices/{id}/reject`; the invoice becomes `REJECTED_BY_BUYER` and `invoice.rejected` is written to the outbox. Rejected invoices do not trigger the risk queue.

The UI role is a demo view only; the backend currently does not enforce the role-to-action relationship. The API endpoints can be called directly unless production auth/RBAC is added.

## Finance Operator workspace

The Finance Operator can view all invoices and parties, the risk decisions, financing applications, payment records and reconciliation records. These lists come from their owning service read endpoints routed through API Gateway:

- `GET /api/risk` → Risk Service
- `GET /api/financing` → Financing Service
- `GET /api/payments` → Payment Service
- `GET /api/reconciliations` → Reconciliation Service
- `GET /api/dashboard/summary` → Read Model Service

Financing approval rule in the POC: `approvedAmount = requestedAmount × 0.90` for eligible invoices. The 2% discount rate is currently stored as a field but is not deducted from approved amount.

## Platform Admin workspace

Admin can view all platform invoices, create supplier/buyer parties, start synthetic data generation, view domain-event analytics and open the Spark monitor.

Create party:

```http
POST /api/parties
Content-Type: application/json

{"partyType":"SUPPLIER","legalName":"Example Components Pvt Ltd","email":"accounts@example.test","countryCode":"IN"}
```

Generate demo batch:

```http
POST /api/invoices/demo/generate
Content-Type: application/json

{"count":8}
```

The simulator generates connected invoice rows using the existing demo buyer/supplier IDs. Three of every four created invoices are initially auto-accepted; every fourth pattern leaves an invoice submitted for Buyer review. Amounts include eligible and over-limit cases.

## Backend event lifecycle

| Producer | Routing key | Consumer queue | Consumer service |
|---|---|---|---|
| Invoice | `invoice.created` | Read Model / Analytics | Read Model, Scala Analytics |
| Invoice | `invoice.accepted` | `risk.invoice-accepted` | Risk |
| Risk | `risk.completed` | `financing.risk-completed` | Financing |
| Financing | `financing.approved` | `payment.financing-approved` | Payment |
| Payment | `payment.disbursed` | `reconciliation.payment-disbursed` | Reconciliation |
| Reconciliation | `reconciliation.completed` | Read Model / Analytics | Read Model, Scala Analytics |

Read Model and analytics queues also bind to `#` to capture all domain events. Buyer rejection publishes `invoice.rejected`, which is visible to Read Model/Analytics but has no downstream risk consumer.

## Demo walkthrough

1. Start full stack with `./scripts/start-all.sh`.
2. As Supplier, submit a ₹1,25,000 invoice.
3. Switch to Buyer, find the invoice and click Accept.
4. Watch RabbitMQ and service logs for `invoice.accepted`, `risk.completed`, `financing.approved`, `payment.disbursed` and `reconciliation.completed`.
5. Switch to Finance and inspect the risk/financing/payment/reconciliation rows.
6. Switch to Admin and generate a batch; inspect the mix of eligible, ineligible and still-submitted records.
7. Open Event Analytics for the Read Model projection.
8. Open Spark Monitor and then the native Spark UI at `http://localhost:4040`.
