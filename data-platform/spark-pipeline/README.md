# InvoiceFlow Spark / Snowflake batch load

The main local POC now includes a Scala analytics microservice at `services/spark-analytics-service`. It consumes RabbitMQ `analytics.domain-events`, lands raw event JSON files under `/data/events`, and runs Spark Structured Streaming metrics. Its native Spark UI is available at http://localhost:4040 when running with the Compose `analytics` profile.

This module remains the separately configured Snowflake batch-load path. `SparkToSnowflake` reads the raw JSON event directory produced by the Scala analytics service and writes to `INVOICEFLOW.BRONZE.RAW_DOMAIN_EVENTS`.

## Configure Snowflake

Copy `.env.example` to `.env` and fill in your Snowflake account settings. Do not commit real credentials.

## Run the batch job

Use Spark 3.4.1 / Scala 2.12 as defined in `build.sbt`, and provide the Snowflake connector dependencies configured in that build. Set `RAW_EVENT_PATH` to the mounted raw event directory, then run `com.invoiceflow.SparkToSnowflake` using your sbt/Spark environment.

Do not run `RawEventConsumer` against `analytics.domain-events` at the same time as `spark-analytics-service`; they are competing RabbitMQ consumers. The main Scala service already consumes that queue.
