package com.studyroom.dto;

public class RedisMetrics {
  private boolean available;
  private Integer hitRate;
  private Long hits;
  private Long misses;
  private Integer latencyMs;
  private String status;

  public boolean isAvailable() {
    return available;
  }

  public void setAvailable(boolean available) {
    this.available = available;
  }

  public Integer getHitRate() {
    return hitRate;
  }

  public void setHitRate(Integer hitRate) {
    this.hitRate = hitRate;
  }

  public Long getHits() {
    return hits;
  }

  public void setHits(Long hits) {
    this.hits = hits;
  }

  public Long getMisses() {
    return misses;
  }

  public void setMisses(Long misses) {
    this.misses = misses;
  }

  public Integer getLatencyMs() {
    return latencyMs;
  }

  public void setLatencyMs(Integer latencyMs) {
    this.latencyMs = latencyMs;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }
}
