package com.invoiceflow.analytics

import com.rabbitmq.client.{ConnectionFactory, DeliverCallback}
import com.fasterxml.jackson.databind.ObjectMapper
import org.apache.spark.sql.{DataFrame, SparkSession}
import org.apache.spark.sql.functions._
import org.apache.spark.sql.types._
import org.apache.spark.sql.streaming.Trigger

import com.sun.net.httpserver.{HttpExchange, HttpServer}
import java.net.InetSocketAddress
import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Path, Paths, StandardCopyOption, StandardOpenOption}
import java.time.Instant
import java.util.concurrent.{ConcurrentHashMap, ConcurrentLinkedDeque, CountDownLatch, Executors}
import java.util.concurrent.atomic.{AtomicLong, AtomicReference}
import scala.collection.JavaConverters._
import scala.util.control.NonFatal

/**
 * InvoiceFlow's Scala-owned analytics microservice.
 * It consumes the analytics RabbitMQ queue, lands each event as an immutable JSON file,
 * then processes the files with Spark Structured Streaming. The embedded Spark UI is exposed on :4040
 * and a small HTTP API for the React portal is exposed on :8090.
 */
object SparkAnalyticsService {
  private val mapper = new ObjectMapper()
  private val counters = new ConcurrentHashMap[String, AtomicLong]()
  private val totalEvents = new AtomicLong(0L)
  private val lastBatch = new AtomicLong(0L)
  private val recent = new ConcurrentLinkedDeque[String]()
  private val startedAt = Instant.now().toString
  private val queryId = new AtomicReference[String]("")
  private val queryActive = new AtomicReference[Boolean](false)
  private val rawDirectory = Paths.get(sys.env.getOrElse("RAW_EVENT_PATH", "/data/events"))

  def main(args: Array[String]): Unit = {
    Files.createDirectories(rawDirectory)
    restoreMetrics()
    startHttpServer()
    val consumer = new Thread(() => rabbitConsumerLoop(), "invoiceflow-rabbit-ingest")
    consumer.setDaemon(true)
    consumer.start()

    val master = sys.env.getOrElse("SPARK_MASTER", "local[2]")
    val uiPort = sys.env.getOrElse("SPARK_UI_PORT", "4040")
    val spark = SparkSession.builder()
      .appName("InvoiceFlow-Scala-Structured-Streaming")
      .master(master)
      .config("spark.ui.enabled", "true")
      .config("spark.ui.port", uiPort)
      .config("spark.ui.bindAddress", "0.0.0.0")
      .config("spark.sql.shuffle.partitions", "2")
      .config("spark.streaming.stopGracefullyOnShutdown", "true")
      .getOrCreate()
    spark.sparkContext.setLogLevel(sys.env.getOrElse("SPARK_LOG_LEVEL", "WARN"))

    val eventSchema = StructType(Seq(
      StructField("eventId", StringType, nullable = true),
      StructField("eventType", StringType, nullable = true),
      StructField("eventVersion", IntegerType, nullable = true),
      StructField("aggregateId", StringType, nullable = true),
      StructField("occurredAt", StringType, nullable = true),
      StructField("correlationId", StringType, nullable = true),
      StructField("producer", StringType, nullable = true)
    ))

    val stream = spark.readStream
      .schema(eventSchema)
      .option("maxFilesPerTrigger", 100)
      .option("pathGlobFilter", "*.json")
      .json(rawDirectory.toString)

    val query = stream.writeStream
      .queryName("invoiceflow-domain-event-stream")
      .option("checkpointLocation", "/data/spark-checkpoint")
      .trigger(Trigger.ProcessingTime("3 seconds"))
      .foreachBatch { (batch: DataFrame, batchId: Long) =>
        processBatch(batch, batchId)
      }
      .start()

    queryId.set(query.id.toString)
    queryActive.set(true)
    println(s"InvoiceFlow Scala Analytics Service started. Spark UI: http://localhost:$uiPort")
    println(s"RabbitMQ queue: ${sys.env.getOrElse("RABBITMQ_QUEUE", "analytics.domain-events")}")
    query.awaitTermination()
  }

  private def processBatch(batch: DataFrame, batchId: Long): Unit = {
    val events = batch.select("eventId", "eventType", "aggregateId", "occurredAt", "producer")
      .filter(col("eventId").isNotNull && col("eventType").isNotNull)
      .dropDuplicates("eventId")
      .collect()

    events.foreach { row =>
      val eventType = Option(row.getAs[String]("eventType")).getOrElse("unknown")
      val eventId = Option(row.getAs[String]("eventId")).getOrElse("")
      val aggregateId = Option(row.getAs[String]("aggregateId")).getOrElse("")
      val occurredAt = Option(row.getAs[String]("occurredAt")).getOrElse("")
      val producer = Option(row.getAs[String]("producer")).getOrElse("")
      counters.computeIfAbsent(eventType, _ => new AtomicLong(0L)).incrementAndGet()
      totalEvents.incrementAndGet()
      recent.addFirst(
        s"""{"eventId":"${escape(eventId)}","eventType":"${escape(eventType)}","aggregateId":"${escape(aggregateId)}","occurredAt":"${escape(occurredAt)}","producer":"${escape(producer)}"}"""
      )
    }
    while (recent.size() > 30) recent.pollLast()
    lastBatch.set(batchId)
    persistMetrics()
    println(s"Spark micro-batch $batchId processed ${events.length} new event(s); lifetime total=${totalEvents.get()}")
  }

  private def persistMetrics(): Unit = {
    try {
      val byType = counters.asScala.toSeq
        .sortBy(_._1)
        .map { case (key, value) =>
          s""""${escape(key)}":${value.get()}"""
        }
        .mkString(",")

      val recentJson = recent.iterator().asScala.mkString(",")

      val state =
        s"""{"totalEvents":${totalEvents.get()},"byEventType":{$byType},"recentEvents":[$recentJson]}"""
      val temp = Paths.get(metricsStatePath.toString + ".tmp")
      Files.write(temp, state.getBytes(StandardCharsets.UTF_8), StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING)
      try Files.move(temp, metricsStatePath, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
      catch {
        case _: java.nio.file.AtomicMoveNotSupportedException => Files.move(temp, metricsStatePath, StandardCopyOption.REPLACE_EXISTING)
      }
    } catch {
      case NonFatal(error) => System.err.println(s"Could not persist analytics counters: ${error.getMessage}")
    }
  }

  private def metricsStatePath: Path = Paths.get("/data/analytics-summary-state.json")

  private def rabbitConsumerLoop(): Unit = {
    val host = sys.env.getOrElse("RABBITMQ_HOST", "localhost")
    val port = sys.env.getOrElse("RABBITMQ_PORT", "5672").toInt
    val user = sys.env.getOrElse("RABBITMQ_USER", "invoiceflow")
    val password = sys.env.getOrElse("RABBITMQ_PASSWORD", "change-this-rabbit-password")
    val queue = sys.env.getOrElse("RABBITMQ_QUEUE", "analytics.domain-events")
    val exchange = "invoiceflow.domain"

    while (true) {
      var connection: com.rabbitmq.client.Connection = null
      var channel: com.rabbitmq.client.Channel = null
      try {
        val factory = new ConnectionFactory()
        factory.setHost(host);
        factory.setPort(port);
        factory.setUsername(user);
        factory.setPassword(password)
        factory.setAutomaticRecoveryEnabled(true)
        factory.setNetworkRecoveryInterval(5000)
        connection = factory.newConnection("invoiceflow-scala-analytics")
        channel = connection.createChannel()
        channel.exchangeDeclare(exchange, "topic", true)
        val args = Map[String, Object]("x-dead-letter-exchange" -> "invoiceflow.dlx")
        channel.queueDeclare(queue, true, false, false, args.asJava)
        channel.queueBind(queue, exchange, "#")
        channel.basicQos(25)
        val activeChannel = channel
        val callback: DeliverCallback = (_, delivery) => {
          try {
            val body = delivery.getBody
            val root = mapper.readTree(body)
            val eventId = Option(root.path("eventId").asText("")).filter(_.nonEmpty).getOrElse(java.util.UUID.randomUUID().toString)
            val safeName = eventId.replaceAll("[^A-Za-z0-9_-]", "_")
            val target = rawDirectory.resolve(safeName + ".json")
            if (!Files.exists(target)) {
              val temp = rawDirectory.resolve(safeName + ".tmp")
              Files.write(temp, body, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING)
              try Files.move(temp, target, StandardCopyOption.ATOMIC_MOVE)
              catch {
                case _: java.nio.file.FileAlreadyExistsException => Files.deleteIfExists(temp)
              }
            }
            activeChannel.basicAck(delivery.getEnvelope.getDeliveryTag, false)
          } catch {
            case NonFatal(error) =>
              System.err.println(s"Raw event landing failed: ${error.getMessage}")
              activeChannel.basicNack(delivery.getEnvelope.getDeliveryTag, false, false)
          }
        }
        channel.basicConsume(queue, false, callback, _ => ())
        println(s"Connected to RabbitMQ at $host:$port; consuming $queue")
        new CountDownLatch(1).await()
      } catch {
        case NonFatal(error) =>
          System.err.println(s"RabbitMQ consumer connection failed: ${error.getMessage}; retrying in 5 seconds")
          Thread.sleep(5000)
      } finally {
        try if (channel != null && channel.isOpen) channel.close() catch {
          case _: Throwable => ()
        }
        try if (connection != null && connection.isOpen) connection.close() catch {
          case _: Throwable => ()
        }
      }
    }
  }

  private def startHttpServer(): Unit = {
    val port = sys.env.getOrElse("ANALYTICS_HTTP_PORT", "8090").toInt
    val server = HttpServer.create(new InetSocketAddress("0.0.0.0", port), 0)
    server.createContext("/health", ex => respond(ex, 200, "{\"status\":\"UP\",\"service\":\"spark-analytics-service\",\"language\":\"Scala\"}"))
    server.createContext("/analytics/summary", ex => respond(ex, 200, summaryJson()))
    server.createContext("/analytics/events", ex => respond(ex, 200, "[" + recent.iterator().asScala.mkString(",") + "]"))
    server.createContext("/analytics/job", ex => {
      val sparkUiPort = sys.env.getOrElse("SPARK_UI_PORT", "4040")

      val json =
        s"""{"active":${queryActive.get()},"queryId":"${escape(queryId.get())}","lastBatchId":${lastBatch.get()},"sparkUi":"http://localhost:$sparkUiPort"}"""

      respond(ex, 200, json)
    })
    server.setExecutor(Executors.newFixedThreadPool(4))
    server.start()
    println(s"Analytics HTTP API listening on http://0.0.0.0:$port")
  }

  private def summaryJson(): String = {
    val byType = counters.asScala.toSeq
      .sortBy(_._1)
      .map { case (key, value) =>
        s""""${escape(key)}":${value.get()}"""
      }
      .mkString(",")

    val sparkUiPort = sys.env.getOrElse("SPARK_UI_PORT", "4040")

    s"""{"service":"spark-analytics-service","language":"Scala","engine":"Apache Spark Structured Streaming","running":${queryActive.get()},"startedAt":"$startedAt","totalEvents":${totalEvents.get()},"lastBatchId":${lastBatch.get()},"byEventType":{$byType},"sparkUiUrl":"http://localhost:$sparkUiPort"}"""
  }

  private def escape(value: String): String = value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r")

  private def respond(exchange: HttpExchange, status: Int, body: String): Unit = {
    val bytes = body.getBytes(StandardCharsets.UTF_8)
    exchange.getResponseHeaders.add("Content-Type", "application/json; charset=utf-8")
    exchange.getResponseHeaders.add("Access-Control-Allow-Origin", "*")
    exchange.getResponseHeaders.add("Access-Control-Allow-Methods", "GET, OPTIONS")
    exchange.getResponseHeaders.add("Access-Control-Allow-Headers", "Content-Type")
    if (exchange.getRequestMethod == "OPTIONS") exchange.sendResponseHeaders(204, -1)
    else {
      exchange.sendResponseHeaders(status, bytes.length);
      val out = exchange.getResponseBody; out.write(bytes); out.close()
    }
  }

  private def restoreMetrics(): Unit = {
    try {
      if (Files.exists(metricsStatePath)) {
        val root = mapper.readTree(metricsStatePath.toFile)
        totalEvents.set(root.path("totalEvents").asLong(0L))
        val counts = root.path("byEventType")
        val iterator = counts.fields()
        while (iterator.hasNext) {
          val entry = iterator.next()
          counters.put(entry.getKey, new AtomicLong(entry.getValue.asLong(0L)))
        }
        val recentItems = root.path("recentEvents")
        if (recentItems.isArray) recentItems.elements().asScala.foreach(item => recent.addLast(item.asText()))
      }
    } catch {
      case NonFatal(error) => System.err.println(s"Could not restore analytics counters: ${error.getMessage}")
    }
  }
}
