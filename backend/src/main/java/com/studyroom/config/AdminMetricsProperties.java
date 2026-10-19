package com.studyroom.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;

@Component
@ConfigurationProperties(prefix = "studyroom.admin-metrics")
public class AdminMetricsProperties {
  private long intervalMs = 60_000L;
  private long timeoutMs = 3_000L;
  private long staleAfterMs = 300_000L;

  public long getIntervalMs() { return intervalMs; }
  public void setIntervalMs(long intervalMs) { this.intervalMs = intervalMs; }
  public long getTimeoutMs() { return timeoutMs; }
  public void setTimeoutMs(long timeoutMs) { this.timeoutMs = timeoutMs; }
  public long getStaleAfterMs() { return staleAfterMs; }
  public void setStaleAfterMs(long staleAfterMs) { this.staleAfterMs = staleAfterMs; }

  @PostConstruct
  public void validate() {
    if (intervalMs < 1_000L || timeoutMs < 100L || staleAfterMs < intervalMs) {
      throw new IllegalStateException("Invalid administrator metrics snapshot configuration");
    }
  }
}
