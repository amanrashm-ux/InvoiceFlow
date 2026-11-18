package com.invoiceflow

import org.apache.spark.sql.SparkSession
import org.apache.spark.sql.functions._

object SparkToSnowflake {
  def main(args: Array[String]): Unit = {
    // Point RAW_EVENT_PATH at the directory mounted by spark-analytics-service (/data/events).
    val path = sys.env.getOrElse("RAW_EVENT_PATH", "./data/events")
    val spark = SparkSession.builder().appName("InvoiceFlow-Spark-Snowflake").getOrCreate()
    val raw = spark.read.json(path)
    val curated = raw
      .filter(col("eventId").isNotNull && col("eventType").isNotNull)
      .select(
        col("eventId").as("EVENT_ID"),
        col("eventType").as("EVENT_TYPE"),
        col("eventVersion").as("EVENT_VERSION"),
        col("aggregateId").as("AGGREGATE_ID"),
        to_timestamp(col("occurredAt")).as("OCCURRED_AT"),
        col("correlationId").as("CORRELATION_ID"),
        col("producer").as("PRODUCER"),
        to_json(col("payload")).as("PAYLOAD"),
        current_timestamp().as("INGESTED_AT")
      ).dropDuplicates("EVENT_ID")

    val options = Map(
      "sfURL" -> sys.env("SNOWFLAKE_URL"),
      "sfUser" -> sys.env("SNOWFLAKE_USER"),
      "sfPassword" -> sys.env("SNOWFLAKE_PASSWORD"),
      "sfDatabase" -> sys.env.getOrElse("SNOWFLAKE_DATABASE", "INVOICEFLOW"),
      "sfSchema" -> sys.env.getOrElse("SNOWFLAKE_SCHEMA", "BRONZE"),
      "sfWarehouse" -> sys.env("SNOWFLAKE_WAREHOUSE"),
      "dbtable" -> "RAW_DOMAIN_EVENTS"
    )
    curated.write.format("net.snowflake.spark.snowflake").options(options).mode("append").save()
    spark.stop()
  }
}
