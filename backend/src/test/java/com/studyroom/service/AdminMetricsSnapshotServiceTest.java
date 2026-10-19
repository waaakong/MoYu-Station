package com.studyroom.service;

import com.studyroom.config.AdminMetricsProperties;
import com.studyroom.dto.AdminDashboardResponse;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.Executors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AdminMetricsSnapshotServiceTest {
  private AdminMetricsSnapshotService service;

  @AfterEach
  void close() {
    if (service != null) service.close();
  }

  @Test
  void publishesExplicitAvailabilityForEverySection() {
    AdminService admin = mock(AdminService.class);
    AdminDashboardResponse dashboard = new AdminDashboardResponse();
    dashboard.setDbStatus("STABLE");
    dashboard.setRedisStatus("CONNECTED");
    when(admin.dashboard()).thenReturn(dashboard);
    service = create(admin, Instant.parse("2026-09-17T00:00:00Z"));

    service.refresh();

    assertEquals("AVAILABLE", service.current().getSections().get("system").getStatus());
    assertEquals("AVAILABLE", service.current().getSections().get("database").getStatus());
    assertEquals("AVAILABLE", service.current().getSections().get("redis").getStatus());
    assertNull(service.current().getSections().get("redis").getErrorCode());
  }

  @Test
  void reportsPartialDependenciesAsUnavailableInsteadOfHealthyZeros() {
    AdminService admin = mock(AdminService.class);
    AdminDashboardResponse dashboard = new AdminDashboardResponse();
    dashboard.setDbStatus("UNKNOWN");
    dashboard.setRedisStatus("UNAVAILABLE");
    when(admin.dashboard()).thenReturn(dashboard);
    service = create(admin, Instant.parse("2026-09-17T00:00:00Z"));

    service.refresh();

    assertEquals("UNAVAILABLE", service.current().getSections().get("database").getStatus());
    assertEquals("UNAVAILABLE", service.current().getSections().get("redis").getStatus());
  }

  @Test
  void retainsLastGoodSnapshotAsStaleAfterSamplingFailure() {
    AdminService admin = mock(AdminService.class);
    AdminDashboardResponse dashboard = new AdminDashboardResponse();
    dashboard.setOnlineUsers(9L);
    dashboard.setDbStatus("STABLE");
    dashboard.setRedisStatus("CONNECTED");
    when(admin.dashboard()).thenReturn(dashboard).thenThrow(new IllegalStateException("database offline"));
    service = create(admin, Instant.parse("2026-09-17T00:00:00Z"));
    service.refresh();

    service.refresh();

    assertEquals(9L, service.current().getOnlineUsers());
    assertEquals("STALE", service.current().getSections().get("summary").getStatus());
    assertEquals("METRICS_UNAVAILABLE", service.current().getSections().get("summary").getErrorCode());
  }

  private AdminMetricsSnapshotService create(AdminService admin, Instant instant) {
    AdminMetricsProperties properties = new AdminMetricsProperties();
    properties.setTimeoutMs(1_000L);
    return new AdminMetricsSnapshotService(admin, properties, Clock.fixed(instant, ZoneOffset.UTC), Executors.newSingleThreadExecutor());
  }
}
