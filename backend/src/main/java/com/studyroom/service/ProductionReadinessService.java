package com.studyroom.service;

import com.studyroom.config.ReadinessProperties;
import com.studyroom.config.ReleaseProperties;
import com.studyroom.dto.HealthComponentStatus;
import com.studyroom.dto.SystemHealthResponse;
import com.studyroom.health.ReadinessProbe;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import javax.annotation.PreDestroy;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

@Service
public class ProductionReadinessService {
  private final List<ReadinessProbe> probes;
  private final ReadinessProperties properties;
  private final ReleaseProperties release;
  private final Clock clock;
  private final ExecutorService executor;
  private final AtomicBoolean sampling = new AtomicBoolean();
  private final AtomicReference<SystemHealthResponse> snapshot;

  @Autowired
  public ProductionReadinessService(
      List<ReadinessProbe> probes,
      ReadinessProperties properties,
      ReleaseProperties release
  ) {
    this(probes, properties, release, Clock.systemUTC(), new ThreadPoolExecutor(
        3, 3, 0L, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(3), runnable -> {
          Thread thread = new Thread(runnable, "production-readiness-probe");
          thread.setDaemon(true);
          return thread;
        }, new ThreadPoolExecutor.AbortPolicy()));
  }

  ProductionReadinessService(
      List<ReadinessProbe> probes,
      ReadinessProperties properties,
      ReleaseProperties release,
      Clock clock,
      ExecutorService executor
  ) {
    this.probes = new ArrayList<>(probes);
    this.probes.sort(Comparator.comparing(ReadinessProbe::name));
    this.properties = properties;
    this.release = release;
    this.clock = clock;
    this.executor = executor;
    this.snapshot = new AtomicReference<>(response("STARTING", null, Map.of()));
  }

  @EventListener(ApplicationReadyEvent.class)
  public void initialSample() {
    refresh();
  }

  @Scheduled(fixedDelayString = "${studyroom.readiness.interval-ms:30000}")
  public void scheduledSample() {
    refresh();
  }

  public SystemHealthResponse current() {
    SystemHealthResponse current = snapshot.get();
    if (current.checkedAt() == null) return current;
    Instant checkedAt = Instant.parse(current.checkedAt());
    if (clock.millis() - checkedAt.toEpochMilli() <= properties.getStaleAfterMs()) return current;
    return response("STALE", checkedAt, current.components());
  }

  void refresh() {
    if (!sampling.compareAndSet(false, true)) return;
    try {
      Map<String, HealthComponentStatus> components = new LinkedHashMap<>();
      boolean ready = true;
      for (ReadinessProbe probe : probes) {
        HealthComponentStatus status = execute(probe);
        components.put(probe.name(), status);
        ready &= "UP".equals(status.state());
      }
      snapshot.set(response(ready ? "READY" : "NOT_READY", clock.instant(), components));
    } finally {
      sampling.set(false);
    }
  }

  @PreDestroy
  public void close() {
    executor.shutdownNow();
  }

  private HealthComponentStatus execute(ReadinessProbe probe) {
    Future<?> future = null;
    try {
      future = executor.submit(() -> {
        try {
          probe.verify();
        } catch (Exception exception) {
          throw new ProbeFailure(exception);
        }
      });
      future.get(properties.getTimeoutMs(), TimeUnit.MILLISECONDS);
      return HealthComponentStatus.up();
    } catch (Exception exception) {
      if (future != null) future.cancel(true);
      return HealthComponentStatus.down("READINESS_" + probe.name().toUpperCase() + "_UNAVAILABLE");
    }
  }

  private SystemHealthResponse response(String state, Instant checkedAt, Map<String, HealthComponentStatus> components) {
    return new SystemHealthResponse(
        state,
        release.getId(),
        release.getGitSha(),
        release.getBuiltAt(),
        checkedAt == null ? null : checkedAt.toString(),
        Map.copyOf(components)
    );
  }

  private static class ProbeFailure extends RuntimeException {
    ProbeFailure(Throwable cause) { super(cause); }
  }
}
