FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /workspace
COPY pom.xml .
COPY src ./src
RUN mvn -q -DskipTests package

FROM apache/spark:3.5.3-scala2.12-java17-python3-r-ubuntu
USER root
WORKDIR /opt
COPY --from=build /workspace/target/spark-analytics-service.jar /opt/spark-analytics-service.jar
RUN mkdir -p /data/events /data/spark-checkpoint && chown -R spark:spark /data
USER spark
EXPOSE 8090 4040
ENTRYPOINT ["/opt/spark/bin/spark-submit"]
CMD ["--master", "local[2]", "--driver-memory", "768m", "--conf", "spark.ui.port=4040", "--conf", "spark.ui.bindAddress=0.0.0.0", "--class", "com.invoiceflow.analytics.SparkAnalyticsService", "/opt/spark-analytics-service.jar"]
