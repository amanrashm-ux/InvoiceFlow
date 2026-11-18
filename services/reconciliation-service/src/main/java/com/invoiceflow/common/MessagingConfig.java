package com.invoiceflow.common;

import org.springframework.amqp.core.*;
import org.springframework.context.annotation.Bean;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MessagingConfig {
    public static final String EXCHANGE = "invoiceflow.domain";

    @Bean
    TopicExchange domainExchange() {
        return new TopicExchange(EXCHANGE, true, false);
    }

    @Bean
    DirectExchange deadLetterExchange() {
        return new DirectExchange("invoiceflow.dlx", true, false);
    }

    @Bean
    Queue deadLetterQueue() {
        return QueueBuilder.durable("invoiceflow.dead-letter").build();
    }

    @Bean
    Declarables deadLetterBindings(@Qualifier("deadLetterQueue") Queue q, @Qualifier("deadLetterExchange") DirectExchange dlx) {
        return new Declarables(
                BindingBuilder.bind(q).to(dlx).with("invoice.created"),
                BindingBuilder.bind(q).to(dlx).with("invoice.accepted"),
                BindingBuilder.bind(q).to(dlx).with("invoice.rejected"),
                BindingBuilder.bind(q).to(dlx).with("risk.completed"),
                BindingBuilder.bind(q).to(dlx).with("financing.approved"),
                BindingBuilder.bind(q).to(dlx).with("payment.disbursed"),
                BindingBuilder.bind(q).to(dlx).with("reconciliation.completed")
        );
    }

    @Bean
    Queue analyticsQueue() {
        return QueueBuilder.durable("analytics.domain-events").withArgument("x-dead-letter-exchange", "invoiceflow.dlx").build();
    }

    @Bean
    Binding analyticsBinding(TopicExchange domainExchange, @Qualifier("analyticsQueue") Queue q) {
        return BindingBuilder.bind(q).to(domainExchange).with("#");
    }
}
