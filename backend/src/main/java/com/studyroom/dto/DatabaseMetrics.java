package com.studyroom.dto;

public class DatabaseMetrics {
  private Integer activeConnections;
  private Integer idleConnections;
  private Integer totalConnections;
  private Integer threadsAwaitingConnection;
  private String status;

  public Integer getActiveConnections() {
    return activeConnections;
  }

  public void setActiveConnections(Integer activeConnections) {
    this.activeConnections = activeConnections;
  }

  public Integer getIdleConnections() {
    return idleConnections;
  }

  public void setIdleConnections(Integer idleConnections) {
    this.idleConnections = idleConnections;
  }

  public Integer getTotalConnections() {
    return totalConnections;
  }

  public void setTotalConnections(Integer totalConnections) {
    this.totalConnections = totalConnections;
  }

  public Integer getThreadsAwaitingConnection() {
    return threadsAwaitingConnection;
  }

  public void setThreadsAwaitingConnection(Integer threadsAwaitingConnection) {
    this.threadsAwaitingConnection = threadsAwaitingConnection;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }
}
