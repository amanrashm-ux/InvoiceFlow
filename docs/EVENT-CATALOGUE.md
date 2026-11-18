# Domain event catalogue

Exchange: `invoiceflow.domain` (durable topic exchange). All events also bind to `analytics.domain-events` and `read-model.events` using `#`.

| Routing key | Producer | Consumer |
|---|---|---|
| `invoice.created` | Invoice Service outbox | Analytics, read model |
| `invoice.accepted` | Invoice Service outbox | Risk, analytics, read model |
| `risk.completed` | Risk Service | Financing, analytics, read model |
| `financing.approved` | Financing Service | Payment, analytics, read model |
| `payment.disbursed` | Payment Service | Reconciliation, analytics, read model |
| `reconciliation.completed` | Reconciliation Service | Analytics, read model |

`risk.invoice-accepted`, `financing.risk-completed`, `payment.financing-approved`, `reconciliation.payment-disbursed`, `analytics.domain-events`, and `read-model.events` are durable queues. Event envelope lives in `contracts/events/event-envelope.schema.json`.


## Additional Buyer decision event

| Routing key | Producer | Consumers |
|---|---|---|
| `invoice.rejected` | Invoice Service outbox | Read Model, Analytics (via `#` bindings) |

A buyer rejection changes the invoice status to `REJECTED_BY_BUYER`. It is not bound to the Risk Service queue, so it does not start financing assessment.
