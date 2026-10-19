package com.studyroom.service;

import com.studyroom.dto.RedisMetrics;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.Properties;

@Service
public class RedisMonitorService {
  private final RedisConnectionFactory connectionFactory;

  public RedisMonitorService(RedisConnectionFactory connectionFactory) {
    this.connectionFactory = connectionFactory;
  }

  public RedisMetrics metrics() {
    RedisMetrics metrics = new RedisMetrics();
    metrics.setAvailable(false);
    metrics.setHitRate(0);
    metrics.setHits(0L);
    metrics.setMisses(0L);
    metrics.setLatencyMs(0);
    metrics.setStatus("UNAVAILABLE");

    long started = System.nanoTime();
    try (RedisConnection connection = connectionFactory.getConnection()) {
      connection.ping();
      Properties stats = connection.info("stats");
      long hits = longValue(stats, "keyspace_hits");
      long misses = longValue(stats, "keyspace_misses");
      long total = hits + misses;
      int hitRate = total <= 0 ? 0 : (int) Math.round(hits * 100.0 / total);

      // Touch a lightweight key so the project has an actual Redis read/write path.
      byte[] key = "studyroom:monitor:last-ping".getBytes(StandardCharsets.UTF_8);
      byte[] value = String.valueOf(System.currentTimeMillis()).getBytes(StandardCharsets.UTF_8);
      connection.stringCommands().set(key, value);
      connection.keyCommands().expire(key, 60);
      connection.stringCommands().get(key);

      metrics.setAvailable(true);
      metrics.setHits(hits);
      metrics.setMisses(misses);
      metrics.setHitRate(hitRate);
      metrics.setLatencyMs((int) Math.max(1, (System.nanoTime() - started) / 1_000_000));
      metrics.setStatus("CONNECTED");
    } catch (RuntimeException exception) {
      metrics.setLatencyMs((int) Math.max(1, (System.nanoTime() - started) / 1_000_000));
      metrics.setStatus("UNAVAILABLE");
    }
    return metrics;
  }

  private long longValue(Properties properties, String key) {
    if (properties == null) {
      return 0L;
    }
    String value = properties.getProperty(key);
    if (value == null) {
      return 0L;
    }
    try {
      return Long.parseLong(value);
    } catch (NumberFormatException exception) {
      return 0L;
    }
  }
}
