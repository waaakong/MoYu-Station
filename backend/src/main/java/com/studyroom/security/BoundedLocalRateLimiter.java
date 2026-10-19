package com.studyroom.security;

import java.time.Clock;
import java.time.Duration;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;

public class BoundedLocalRateLimiter {
  private final int capacity;
  private final Clock clock;
  private final LinkedHashMap<String, Bucket> buckets = new LinkedHashMap<>();

  public BoundedLocalRateLimiter(int capacity) {
    this(capacity, Clock.systemUTC());
  }

  BoundedLocalRateLimiter(int capacity, Clock clock) {
    if (capacity < 1) throw new IllegalArgumentException("capacity must be positive");
    this.capacity = capacity;
    this.clock = clock;
  }

  public synchronized Result consume(String key, int maximumAttempts, Duration window) {
    long now = clock.millis();
    removeExpired(now);
    Bucket bucket = buckets.get(key);
    if (bucket == null || bucket.expiresAt <= now) {
      if (buckets.size() >= capacity) {
        long earliestExpiry = buckets.values().stream()
            .mapToLong(existing -> existing.expiresAt)
            .min()
            .orElse(now + window.toMillis());
        return new Result(false, retrySeconds(earliestExpiry, now));
      }
      bucket = new Bucket(0, now + window.toMillis());
      buckets.put(key, bucket);
    }
    bucket.attempts++;
    return new Result(bucket.attempts <= maximumAttempts, retrySeconds(bucket.expiresAt, now));
  }

  synchronized int size() {
    return buckets.size();
  }

  private void removeExpired(long now) {
    Iterator<Map.Entry<String, Bucket>> iterator = buckets.entrySet().iterator();
    while (iterator.hasNext()) {
      if (iterator.next().getValue().expiresAt <= now) iterator.remove();
    }
  }

  private long retrySeconds(long expiresAt, long now) {
    return Math.max(1, (expiresAt - now + 999) / 1000);
  }

  private static final class Bucket {
    private int attempts;
    private final long expiresAt;

    private Bucket(int attempts, long expiresAt) {
      this.attempts = attempts;
      this.expiresAt = expiresAt;
    }
  }

  public record Result(boolean allowed, long retryAfterSeconds) {
  }
}
