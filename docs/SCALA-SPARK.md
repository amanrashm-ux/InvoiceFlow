# Scala analytics microservice and Spark UI

## Components

`services/spark-analytics-service` is a standalone Scala 2.12 service. It uses the RabbitMQ Java client, Apache Spark 3.5.3 / Scala 2.12, and the JDK HTTP server. It is deliberately separate from the Java Read Model Service: the Java service powers the business dashboard projection, while the Scala/Spark service demonstrates a streaming analytics path.

## Runtime flow

1. Connect to RabbitMQ and declare/bind durable queue `analytics.domain-events` to topic exchange `invoiceflow.domain` with binding key `#`.
2. Consume with manual acknowledgements.
3. Write each event payload as its own immutable JSON file, named from `eventId`, under `/data/events`.
4. Acknowledge the RabbitMQ delivery after the file has been safely created.
5. Spark Structured Streaming reads new JSON files in micro-batches every three seconds.
6. The Scala callback aggregates counts by `eventType`, records recent event metadata, and exposes metrics via HTTP.
7. Spark checkpoints to `/data/spark-checkpoint` so the file-stream offsets can be resumed when the persistent volume is retained.

## Screens

- React role workspace: Admin or Finance → Spark Monitor.
- Scala analytics API: `http://localhost:8090/analytics/summary`.
- Native Spark UI: `http://localhost:4040`.

The native Spark UI is the actual Spark application UI. While the app is running, it exposes Jobs, Stages, SQL, Executors and streaming query details. It is not a static screenshot or a simulated Spark page.

## Laptop configuration

Compose starts Spark in local mode `local[2]` and limits driver memory to 768 MB. This is suitable for a demonstration with a small event stream. It is not a multi-node Spark cluster. The UI's `4040` port is exposed on the host.

## Snowflake

The real-time POC service stops at raw event landing and Spark aggregation. Snowflake remains a separate, credentialed batch load. `data-platform/spark-pipeline/SparkToSnowflake` reads the raw JSON event directory and writes to the Bronze table once a valid Snowflake URL, user, password and warehouse are configured. Do not run the old RabbitMQ `RawEventConsumer` while the new Scala analytics service is consuming `analytics.domain-events`, because RabbitMQ consumers on one queue compete for messages.
