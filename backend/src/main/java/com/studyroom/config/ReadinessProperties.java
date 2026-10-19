package com.studyroom.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;

@Component
@ConfigurationProperties(prefix = "studyroom.readiness")
public class ReadinessProperties {
  private long intervalMs = 30_000L;
  private long timeoutMs = 2_000L;
  private long staleAfterMs = 90_000L;
  private long minimumFreeSpace = 8L * 1024 * 1024 * 1024;

  public long getIntervalMs() { return intervalMs; }
  public void setIntervalMs(long intervalMs) { this.intervalMs = intervalMs; }
  public long getTimeoutMs() { return timeoutMs; }
  public void setTimeoutMs(long timeoutMs) { this.timeoutMs = timeoutMs; }
  public long getStaleAfterMs() { return staleAfterMs; }
  public void setStaleAfterMs(long staleAfterMs) { this.staleAfterMs = staleAfterMs; }
  public long getMinimumFreeSpace() { return minimumFreeSpace; }
  public void setMinimumFreeSpace(long minimumFreeSpace) { this.minimumFreeSpace = minimumFreeSpace; }

  @PostConstruct
  public void validate() {
    if (intervalMs < 1_000L || timeoutMs < 100L || staleAfterMs < intervalMs || minimumFreeSpace < 0) {
      throw new IllegalStateException("Invalid production readiness configuration");
    }
  }
}
