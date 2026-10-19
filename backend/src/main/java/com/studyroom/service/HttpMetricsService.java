package com.studyroom.service;

import org.springframework.stereotype.Service;

import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.concurrent.atomic.AtomicLong;

@Service
public class HttpMetricsService {
  private static final long RECENT_WINDOW_MS = 60_000L;
  private static final long SLOW_QUERY_THRESHOLD_MS = 800L;

  private final AtomicLong requestCount = new AtomicLong();
  private final AtomicLong http4xxCount = new AtomicLong();
  private final AtomicLong http5xxCount = new AtomicLong();
  private final AtomicLong slowQueryCount = new AtomicLong();
  private final ConcurrentLinkedDeque<Long> recentRequests = new ConcurrentLinkedDeque<>();
  private final ConcurrentLinkedDeque<Long> recentSlowQueries = new ConcurrentLinkedDeque<>();

  public void recordRequest(int status) {
    long now = System.currentTimeMillis();
    requestCount.incrementAndGet();
    recentRequests.addLast(now);
    if (status >= 400 && status < 500) {
      http4xxCount.incrementAndGet();
    } else if (status >= 500) {
      http5xxCount.incrementAndGet();
    }
    prune(recentRequests, now);
  }

  public void recordQuery(long elapsedMs) {
    if (elapsedMs < SLOW_QUERY_THRESHOLD_MS) return;
    long now = System.currentTimeMillis();
    slowQueryCount.incrementAndGet();
    recentSlowQueries.addLast(now);
    prune(recentSlowQueries, now);
  }

  public long getRequestCount() {
    return requestCount.get();
  }

  public long getHttp4xxCount() {
    return http4xxCount.get();
  }

  public long getHttp5xxCount() {
    return http5xxCount.get();
  }

  public long getSlowQueryCount() {
    return slowQueryCount.get();
  }

  public int getRequestsPerMinute() {
    long now = System.currentTimeMillis();
    prune(recentRequests, now);
    return recentRequests.size();
  }

  public long getRecentSlowQueryCount() {
    long now = System.currentTimeMillis();
    prune(recentSlowQueries, now);
    return recentSlowQueries.size();
  }

  public int getHttpErrorRate() {
    long total = requestCount.get();
    if (total <= 0) return 0;
    long errors = http4xxCount.get() + http5xxCount.get();
    return (int) Math.max(0, Math.min(100, Math.round(errors * 100.0 / total)));
  }

  public String getQps() {
    return String.format("%.2f", getRequestsPerMinute() / 60.0);
  }

  private void prune(ConcurrentLinkedDeque<Long> values, long now) {
    while (true) {
      Long first = values.peekFirst();
      if (first == null || now - first <= RECENT_WINDOW_MS) return;
      values.pollFirst();
    }
  }
}
