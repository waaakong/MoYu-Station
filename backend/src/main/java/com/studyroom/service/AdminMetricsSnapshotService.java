package com.studyroom.service;

import com.studyroom.common.ErrorCode;
import com.studyroom.config.AdminMetricsProperties;
import com.studyroom.dto.AdminDashboardResponse;
import com.studyroom.dto.MetricSectionStatus;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import javax.annotation.PreDestroy;
import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

@Service
public class AdminMetricsSnapshotService {
  private static final String[] SECTIONS = {"summary", "system", "database", "redis", "http", "websocket"};
  private final AdminService adminService;
  private final AdminMetricsProperties properties;
  private final Clock clock;
  private final ExecutorService executor;
  private final AtomicBoolean sampling = new AtomicBoolean();
  private final AtomicReference<AdminDashboardResponse> current = new AtomicReference<>(unavailableSnapshot());
  private volatile AdminDashboardResponse lastSuccessful;
  private volatile Instant lastSuccessfulAt;

  @Autowired
  public AdminMetricsSnapshotService(AdminService adminService, AdminMetricsProperties properties) {
    this(adminService, properties, Clock.systemUTC(), new ThreadPoolExecutor(
        1, 1, 0L, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(1), runnable -> {
          Thread thread = new Thread(runnable, "admin-metrics-sampler");
          thread.setDaemon(true);
          return thread;
        }, new ThreadPoolExecutor.AbortPolicy()));
  }

  AdminMetricsSnapshotService(AdminService adminService, AdminMetricsProperties properties, Clock clock, ExecutorService executor) {
    this.adminService = adminService;
    this.properties = properties;
    this.clock = clock;
    this.executor = executor;
  }

  @EventListener(ApplicationReadyEvent.class)
  public void initialSample() {
    refresh();
  }

  @Scheduled(fixedDelayString = "${studyroom.admin-metrics.interval-ms:60000}")
  public void scheduledSample() {
    refresh();
  }

  public AdminDashboardResponse current() {
    return current.get();
  }

  void refresh() {
    if (!sampling.compareAndSet(false, true)) return;
    CompletableFuture<AdminDashboardResponse> future = null;
    try {
      future = CompletableFuture.supplyAsync(adminService::dashboard, executor);
      AdminDashboardResponse result = future.get(properties.getTimeoutMs(), TimeUnit.MILLISECONDS);
      Instant sampledAt = clock.instant();
      applySectionStates(result, sampledAt);
      lastSuccessful = result;
      lastSuccessfulAt = sampledAt;
      current.set(result);
    } catch (TimeoutException exception) {
      if (future != null) future.cancel(true);
      publishFailure("METRICS_TIMEOUT");
    } catch (Exception exception) {
      if (future != null) future.cancel(true);
      publishFailure(ErrorCode.METRICS_UNAVAILABLE.name());
    } finally {
      sampling.set(false);
    }
  }

  @PreDestroy
  public void close() {
    executor.shutdownNow();
  }

  private void applySectionStates(AdminDashboardResponse result, Instant sampledAt) {
    String timestamp = sampledAt.toString();
    Map<String, MetricSectionStatus> sections = new LinkedHashMap<>();
    sections.put("summary", available(timestamp));
    sections.put("system", "UNAVAILABLE".equalsIgnoreCase(result.getDiskTotalSpace())
        ? unavailable(timestamp, "SYSTEM_METRICS_UNAVAILABLE") : available(timestamp));
    sections.put("database", "UNKNOWN".equalsIgnoreCase(result.getDbStatus())
        ? unavailable(timestamp, "DATABASE_METRICS_UNAVAILABLE") : available(timestamp));
    sections.put("redis", "CONNECTED".equalsIgnoreCase(result.getRedisStatus())
        ? available(timestamp) : unavailable(timestamp, "REDIS_METRICS_UNAVAILABLE"));
    sections.put("http", available(timestamp));
    sections.put("websocket", available(timestamp));
    result.setSampledAt(timestamp);
    result.setSections(sections);
  }

  private void publishFailure(String errorCode) {
    Instant now = clock.instant();
    AdminDashboardResponse previous = lastSuccessful;
    Instant previousAt = lastSuccessfulAt;
    if (previous != null && previousAt != null && now.toEpochMilli() - previousAt.toEpochMilli() <= properties.getStaleAfterMs()) {
      Map<String, MetricSectionStatus> stale = new LinkedHashMap<>();
      for (String section : SECTIONS) stale.put(section, new MetricSectionStatus("STALE", previousAt.toString(), errorCode));
      previous.setSections(stale);
      current.set(previous);
      return;
    }
    AdminDashboardResponse unavailable = unavailableSnapshot();
    unavailable.setSampledAt(now.toString());
    Map<String, MetricSectionStatus> sections = new LinkedHashMap<>();
    for (String section : SECTIONS) sections.put(section, unavailable(now.toString(), errorCode));
    unavailable.setSections(sections);
    current.set(unavailable);
  }

  private static AdminDashboardResponse unavailableSnapshot() {
    AdminDashboardResponse response = new AdminDashboardResponse();
    Map<String, MetricSectionStatus> sections = new LinkedHashMap<>();
    for (String section : SECTIONS) sections.put(section, new MetricSectionStatus("UNAVAILABLE", null, ErrorCode.METRICS_UNAVAILABLE.name()));
    response.setSections(sections);
    return response;
  }

  private MetricSectionStatus available(String timestamp) {
    return new MetricSectionStatus("AVAILABLE", timestamp, null);
  }

  private MetricSectionStatus unavailable(String timestamp, String errorCode) {
    return new MetricSectionStatus("UNAVAILABLE", timestamp, errorCode);
  }
}
