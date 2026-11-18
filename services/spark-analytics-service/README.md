# InvoiceFlow Scala + Spark Analytics Service

This is a separate microservice implemented entirely in Scala. It consumes `analytics.domain-events` from RabbitMQ,
writes immutable raw event files under `/data/events`, and uses Apache Spark Structured Streaming to aggregate event
counts. The same process exposes a small HTTP API for the React portal.

## Run with Docker Compose

From the project root:

```bash
docker compose --env-file .env -f infra/docker-compose.yml --profile analytics up --build -d
```

Endpoints:

- Analytics API: http://localhost:8090/health
- Event summary: http://localhost:8090/analytics/summary
- Recent events: http://localhost:8090/analytics/events
- Streaming query: http://localhost:8090/analytics/job
- Apache Spark UI: http://localhost:4040

The Spark UI is an actual Spark application UI (Jobs, Stages, SQL, Executors and Streaming query information), not a
mock dashboard. It is available while this Spark application is running. The service starts Spark in `local[2]` mode for
a small laptop-friendly POC.

## Event flow

RabbitMQ `invoiceflow.domain` → durable `analytics.domain-events` queue → Scala RabbitMQ consumer → immutable JSON
files → Spark Structured Streaming micro-batches → event metrics → `/analytics/summary` → React Spark Monitor.

Each event is stored under a filename derived from `eventId`, so a repeated delivery does not create another raw file.
The consumer acknowledges after the event has been safely written. Spark uses a checkpoint directory in the persistent
volume.

## Notes

- This service is separate from the Java Read Model Service. The Read Model continues to power the business dashboard;
  this Scala service is the analytics/Spark view.
- Snowflake loading remains a separately configured step using `data-platform/spark-pipeline` and the SQL scripts under
  `database/snowflake`.
- The Spark UI uses host port 4040. If that port is busy, change the host mapping and `SPARK_UI_PORT` in Compose
  together.
