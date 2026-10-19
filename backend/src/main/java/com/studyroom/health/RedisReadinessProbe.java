package com.studyroom.health;

import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.stereotype.Component;

@Component
public class RedisReadinessProbe implements ReadinessProbe {
  private final RedisConnectionFactory connectionFactory;

  public RedisReadinessProbe(RedisConnectionFactory connectionFactory) {
    this.connectionFactory = connectionFactory;
  }

  @Override
  public String name() {
    return "redis";
  }

  @Override
  public void verify() {
    try (RedisConnection connection = connectionFactory.getConnection()) {
      String response = connection.ping();
      if (!"PONG".equalsIgnoreCase(response)) throw new IllegalStateException("Redis readiness probe failed");
    }
  }
}
