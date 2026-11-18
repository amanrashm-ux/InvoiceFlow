# Delivery notes — expanded InvoiceFlow POC

## What was added

- Four role-based workspaces: Supplier, Buyer, Finance Operator and Platform Admin.
- Supplier invoice creation and supplier-oriented invoice/financing views.
- Buyer invoice queue with accept and reject actions.
- Finance views for financing applications, risk decisions, payments, reconciliations and Read Model events.
- Admin party creation and a synthetic invoice generator (`POST /api/invoices/demo/generate`).
- Gateway routes for the operational service read endpoints and the Scala analytics API.
- A standalone Scala 2.12 analytics microservice that consumes the RabbitMQ analytics queue, lands events as JSON files and runs Spark Structured Streaming.
- A native Spark application UI on port 4040 and a React Spark monitor page.
- Start/stop/smoke-test scripts and updated technical documentation.

## Important demo boundaries

- Role selection is a demo workspace switch, not server-side authentication or RBAC.
- The risk rules are deterministic POC rules, not a lending-grade risk model.
- Payment records are simulated; no funds are transferred.
- Reconciliation is a POC event match, not bank-statement reconciliation.
- The Spark service runs in local mode (`local[2]`) to make Spark jobs, stages, SQL and streaming information visible on a laptop. It is not a multi-node cluster.
- Snowflake loading remains a separately configured batch job requiring the user's Snowflake account and credentials.

## Build verification status

The archive was checked for Compose YAML validity, shell-script syntax, source/configuration consistency and required project files. A full Docker image build, Maven/Scala compilation, npm build and end-to-end container run were not possible in the packaging environment. Run `./scripts/start-all.sh` on the target Mac with Docker Desktop available; resolve any first build/runtime error shown by the script's logs before presenting the demo.
