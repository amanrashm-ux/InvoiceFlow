# InvoiceFlow — Receivables Finance POC

InvoiceFlow is a local proof of concept for an event-driven invoice-discounting workflow. It includes role-specific workspaces, independent Spring Boot services, RabbitMQ messaging, H2 data stores, a Scala-owned analytics microservice using Spark Structured Streaming, and an optional Snowflake batch load.

## Demo roles

- **Supplier** — create invoices and see invoices associated with the demo supplier `SUP-001`, plus financing progress.
- **Buyer** — review invoices addressed to `BUY-001`, accept or reject submitted invoices.
- **Finance Operator** — view all invoices, parties, financing applications, risk decisions, simulated payments, reconciliation records and Read Model event analytics.
- **Platform Admin** — view the whole platform, create buyer/supplier parties and generate synthetic invoice scenarios.

The role selector is a demo workspace switch, not authentication. Server-side RBAC/JWT enforcement is not implemented in this POC.

## Business workflow

1. Supplier submits an invoice through the React portal.
2. Invoice Service stores it as `SUBMITTED` and writes `invoice.created` to its transactional outbox.
3. Buyer accepts the invoice. Invoice Service changes it to `ACCEPTED` and writes `invoice.accepted` to the outbox. Buyer can also reject a submitted invoice.
4. Invoice Service's outbox publisher sends domain events to RabbitMQ exchange `invoiceflow.domain`.
5. Risk Service consumes `invoice.accepted` and applies the POC rules: positive amount, currency INR, and amount no greater than ₹50 lakh. Eligible score=85; ineligible score=25.
6. Financing Service consumes `risk.completed`. Eligible invoices receive an approved amount equal to 90% of the invoice value. The 2% discount rate is stored but is not deducted by the current POC calculation.
7. Payment Service records a `SIMULATED_DISBURSED` payment. No real bank/payment rail is called.
8. Reconciliation Service records a POC `MATCHED` event based on the payment event; external bank-statement reconciliation is not implemented.
9. Read Model stores event records for the business dashboard. The Scala analytics service independently consumes the analytics queue and processes raw events with Spark Structured Streaming.

## Stack and service ports

| Component | Technology | Port |
|---|---|---:|
| React portal | React, TypeScript, Vite / Nginx | 3000 (Compose) |
| API Gateway | Spring Cloud Gateway | 8080 |
| Invoice | Java / Spring Boot + H2 | 8081 |
| Risk | Java / Spring Boot + H2 | 8082 |
| Financing | Java / Spring Boot + H2 | 8083 |
| Payment | Java / Spring Boot + H2 | 8084 |
| Reconciliation | Java / Spring Boot + H2 | 8085 |
| Party | Java / Spring Boot + H2 | 8086 |
| Identity | Java / Spring Boot + H2 | 8087 |
| Read Model | Java / Spring Boot + H2 | 8088 |
| Scala Analytics | Scala 2.12 + RabbitMQ client + Spark 3.5.3 | 8090 |
| RabbitMQ AMQP | RabbitMQ | 5672 |
| RabbitMQ management | RabbitMQ Management UI | 15672 |
| Spark application UI | Native Spark UI | 4040 |

Each Java business/read service owns a separate H2 file database. Read Model is an event projection, not a physical read replica. The Scala analytics service is file-backed and does not share service databases.

## Start the complete local stack (recommended)

Prerequisite: Docker Desktop / Docker Engine with Compose v2. The regular application is containerized; you do not need Homebrew or sudo. Docker will build the Scala analytics app and pull an Apache Spark image (large download, including an ARM64-compatible image for Apple Silicon).

```bash
./scripts/start-all.sh
```

This script creates `.env` from `.env.example` if needed, builds all services including the `analytics` profile, starts the stack, seeds sample invoices and runs HTTP smoke checks. The build uses plain `docker compose build` (Compose's `--parallel` option is boolean; do not pass a numeric service argument after it).

Open:

- Portal: http://localhost:3000
- API Gateway: http://localhost:8080
- RabbitMQ Management: http://localhost:15672
- Scala analytics API: http://localhost:8090/analytics/summary
- Spark native UI: http://localhost:4040

RabbitMQ defaults are in `.env`; change them for any environment beyond a local isolated demo.

## Start core stack without Spark

```bash
docker compose --env-file .env -f infra/docker-compose.yml up --build -d
```

To add the Scala/Spark analytics service to an already running core stack:

```bash
docker compose --env-file .env -f infra/docker-compose.yml --profile analytics up --build -d spark-analytics-service
```

## Admin demo data generation

The Admin workspace has a Data Simulator page. It calls:

```http
POST /api/invoices/demo/generate
Content-Type: application/json

{ "count": 8 }
```

`count` must be 1–50. It creates linked synthetic invoices across the seeded supplier/buyer IDs. Most are auto-accepted to exercise risk/financing; selected invoices remain `SUBMITTED` for the Buyer workspace. The amount pattern includes values above the ₹50 lakh risk limit.

The existing repeatable seed script is also available:

```bash
./scripts/seed-demo.sh
```

## API examples

Create invoice:

```bash
curl -X POST http://localhost:8080/api/invoices \
  -H 'Content-Type: application/json' \
  -d '{"supplierId":"SUP-001","buyerId":"BUY-001","invoiceNumber":"INV-DEMO-9001","currency":"INR","amount":125000,"issueDate":"2026-11-01","dueDate":"2026-12-01"}'
```

Buyer acceptance:

```bash
curl -X POST http://localhost:8080/api/invoices/INVOICE_ID/accept
```

Buyer rejection:

```bash
curl -X POST http://localhost:8080/api/invoices/INVOICE_ID/reject
```

Service reads through the Gateway:

```bash
curl http://localhost:8080/api/risk
curl http://localhost:8080/api/financing
curl http://localhost:8080/api/payments
curl http://localhost:8080/api/reconciliations
curl http://localhost:8080/api/dashboard/summary
curl http://localhost:8080/api/spark/analytics/summary
```

## Debug and observe

```bash
# Container health/status
docker compose --profile analytics --env-file .env -f infra/docker-compose.yml ps

# Follow business and analytics logs
docker compose --profile analytics --env-file .env -f infra/docker-compose.yml logs -f invoice-service risk-service financing-service payment-service reconciliation-service read-model-service spark-analytics-service

# Stop containers but keep H2/Rabbit/Spark volumes
./scripts/stop-all.sh

# Destructive reset: removes local persisted data volumes
docker compose --profile analytics --env-file .env -f infra/docker-compose.yml down -v
```

## Scala + Spark implementation

The service under `services/spark-analytics-service` is implemented entirely in Scala. It:

- consumes `analytics.domain-events` from RabbitMQ with manual acknowledgements;
- writes one raw JSON file per event ID to `/data/events` (duplicate deliveries do not create duplicate files);
- runs Spark Structured Streaming over the event directory with a persistent checkpoint under `/data/spark-checkpoint`;
- exposes `/health`, `/analytics/summary`, `/analytics/events` and `/analytics/job` on port 8090;
- exposes the native Spark application UI on port 4040 while the process is running.

Do not run the legacy `RawEventConsumer` from `data-platform/spark-pipeline` at the same time as the Scala analytics service: both would compete for the same RabbitMQ queue. `SparkToSnowflake` has been updated to read the raw JSON event directory produced by the new Scala service.

Snowflake remains external. Configure `data-platform/spark-pipeline/.env.example` with your account settings and run the batch Spark job after the raw event files have landed. No Snowflake account or credentials are included.

## Demo / production boundaries

- UI role selection is a convenience for demo walkthroughs, not authorization. The API must gain server-side identity validation and RBAC before exposure.
- Risk rules are deterministic POC rules, not a lending/credit decision model.
- Payment is simulated and does not transfer money.
- Reconciliation is an event-based POC match, not a bank-statement or partial-payment reconciliation system.
- H2 is local POC storage; no physical primary/read-replica topology is configured.
- Invoice Service uses a transactional outbox. Other service publishers should adopt equivalent outbox/inbox safeguards before production.
- Spark local mode with two workers is intended for a laptop demo, not a production Spark cluster.

See `docs/ROLE-WORKFLOWS.md`, `docs/SCALA-SPARK.md`, `docs/EVENT-CATALOGUE.md`, `docs/POC-RUNBOOK.md` and `docs/MAC-SETUP.md`.


## Delivery and verification notes

See [docs/DELIVERY-NOTES.md](docs/DELIVERY-NOTES.md) for scope boundaries and build verification status.
