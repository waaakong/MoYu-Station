package com.studyroom.service;

import com.studyroom.dto.DatabaseMetrics;
import com.zaxxer.hikari.HikariDataSource;
import com.zaxxer.hikari.HikariPoolMXBean;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;

@Service
public class DatabaseMetricsService {
  private final DataSource dataSource;

  public DatabaseMetricsService(DataSource dataSource) {
    this.dataSource = dataSource;
  }

  public DatabaseMetrics metrics() {
    DatabaseMetrics metrics = new DatabaseMetrics();
    if (dataSource instanceof HikariDataSource) {
      HikariPoolMXBean pool = ((HikariDataSource) dataSource).getHikariPoolMXBean();
      if (pool != null) {
        metrics.setActiveConnections(pool.getActiveConnections());
        metrics.setIdleConnections(pool.getIdleConnections());
        metrics.setTotalConnections(pool.getTotalConnections());
        metrics.setThreadsAwaitingConnection(pool.getThreadsAwaitingConnection());
        metrics.setStatus(pool.getThreadsAwaitingConnection() > 0 ? "WAITING" : "STABLE");
        return metrics;
      }
    }
    metrics.setActiveConnections(0);
    metrics.setIdleConnections(0);
    metrics.setTotalConnections(0);
    metrics.setThreadsAwaitingConnection(0);
    metrics.setStatus("UNKNOWN");
    return metrics;
  }
}
