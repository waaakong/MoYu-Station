package com.studyroom.service;

import com.studyroom.config.ReadinessProperties;
import com.studyroom.config.ReleaseProperties;
import com.studyroom.health.ReadinessProbe;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.Executors;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ProductionReadinessServiceTest {
  private ProductionReadinessService service;

  @AfterEach
  void close() {
    if (service != null) service.close();
  }

  @Test
  void publishesReadyOnlyWhenEveryProbeSucceeds() {
    service = create(List.of(probe("database", null), probe("redis", null), probe("storage", null)), 90_000L);
    service.refresh();
    assertEquals("READY", service.current().state());
    assertEquals("phase12-test", service.current().releaseId());
    assertEquals("UP", service.current().components().get("database").state());
  }

  @Test
  void reportsAStableErrorCodeWithoutLeakingTheException() {
    service = create(List.of(probe("database", new IllegalStateException("jdbc:mysql://secret"))), 90_000L);
    service.refresh();
    assertEquals("NOT_READY", service.current().state());
    assertEquals("READINESS_DATABASE_UNAVAILABLE", service.current().components().get("database").errorCode());
    assertEquals(false, service.current().toString().contains("jdbc:mysql://secret"));
  }

  @Test
  void marksAnOldSnapshotStale() {
    MutableClock clock = new MutableClock(Instant.parse("2026-09-17T02:00:00Z"));
    service = new ProductionReadinessService(
        List.of(probe("database", null)), properties(1_000L), release(), clock, Executors.newFixedThreadPool(1));
    service.refresh();
    clock.advance(Duration.ofSeconds(2));
    assertEquals("STALE", service.current().state());
  }

  @Test
  void boundsASlowProbeAndFailsClosed() {
    ReadinessProperties properties = properties(90_000L);
    properties.setTimeoutMs(100L);
    service = new ProductionReadinessService(
        List.of(new ReadinessProbe() {
          @Override public String name() { return "database"; }
          @Override public void verify() throws InterruptedException { Thread.sleep(5_000L); }
        }),
        properties,
        release(),
        Clock.fixed(Instant.parse("2026-09-17T02:00:00Z"), ZoneOffset.UTC),
        Executors.newFixedThreadPool(1));
    service.refresh();
    assertEquals("NOT_READY", service.current().state());
    assertEquals("READINESS_DATABASE_UNAVAILABLE", service.current().components().get("database").errorCode());
  }

  private ProductionReadinessService create(List<ReadinessProbe> probes, long staleAfterMs) {
    return new ProductionReadinessService(
        probes,
        properties(staleAfterMs),
        release(),
        Clock.fixed(Instant.parse("2026-09-17T02:00:00Z"), ZoneOffset.UTC),
        Executors.newFixedThreadPool(3));
  }

  private ReadinessProperties properties(long staleAfterMs) {
    ReadinessProperties properties = new ReadinessProperties();
    properties.setIntervalMs(1_000L);
    properties.setTimeoutMs(500L);
    properties.setStaleAfterMs(staleAfterMs);
    return properties;
  }

  private ReleaseProperties release() {
    ReleaseProperties release = new ReleaseProperties();
    release.setId("phase12-test");
    release.setGitSha("0123456789abcdef");
    release.setBuiltAt("2026-09-17T02:00:00Z");
    return release;
  }

  private ReadinessProbe probe(String name, RuntimeException failure) {
    return new ReadinessProbe() {
      @Override public String name() { return name; }
      @Override public void verify() { if (failure != null) throw failure; }
    };
  }

  private static class MutableClock extends Clock {
    private Instant instant;

    MutableClock(Instant instant) { this.instant = instant; }
    void advance(Duration duration) { instant = instant.plus(duration); }
    @Override public ZoneId getZone() { return ZoneOffset.UTC; }
    @Override public Clock withZone(ZoneId zone) { return this; }
    @Override public Instant instant() { return instant; }
  }
}
