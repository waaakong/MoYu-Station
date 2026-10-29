package com.studyroom.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Supplier;
import com.studyroom.common.ClientDisconnects;
import com.studyroom.dto.AdminDashboardResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
public class AdminDashboardStreamService {
  private static final long STREAM_TIMEOUT_MS = 130_000L;
  private static final Logger log = LoggerFactory.getLogger(AdminDashboardStreamService.class);
  private final AdminMetricsSnapshotService snapshots;
  private final Supplier<SseEmitter> emitterFactory;
  private final CopyOnWriteArrayList<SseEmitter> emitters = new CopyOnWriteArrayList<>();

  @Autowired
  public AdminDashboardStreamService(AdminMetricsSnapshotService snapshots) {
    this(snapshots, () -> new SseEmitter(STREAM_TIMEOUT_MS));
  }

  AdminDashboardStreamService(AdminMetricsSnapshotService snapshots, Supplier<SseEmitter> emitterFactory) {
    this.snapshots = snapshots;
    this.emitterFactory = emitterFactory;
  }

  public SseEmitter connect() {
    AdminDashboardResponse snapshot = snapshots.current();
    SseEmitter emitter = emitterFactory.get();
    emitters.add(emitter);
    emitter.onCompletion(() -> remove(emitter));
    emitter.onTimeout(() -> removeAndComplete(emitter));
    emitter.onError(error -> remove(emitter));
    send(emitter, snapshot);
    return emitter;
  }

  @Scheduled(fixedDelayString = "${studyroom.admin-metrics.interval-ms:60000}")
  public void broadcast() {
    if (emitters.isEmpty()) return;
    AdminDashboardResponse snapshot;
    try { snapshot = snapshots.current(); }
    catch (RuntimeException exception) {
      log.error("Dashboard snapshot failed; retaining stream subscriptions", exception);
      return;
    }
    for (SseEmitter emitter : emitters) send(emitter, snapshot);
  }

  private void send(SseEmitter emitter, AdminDashboardResponse snapshot) {
    synchronized (emitter) {
      if (!emitters.contains(emitter)) return;
      try {
        emitter.send(SseEmitter.event().name("dashboard").data(snapshot));
      } catch (IOException | IllegalStateException exception) {
        if (!ClientDisconnects.isDisconnected(exception)) log.warn("Dashboard stream send failed", exception);
        removeAndComplete(emitter);
      }
    }
  }

  private void remove(SseEmitter emitter) {
    synchronized (emitter) { emitters.remove(emitter); }
  }

  private void removeAndComplete(SseEmitter emitter) {
    synchronized (emitter) {
      if (!emitters.remove(emitter)) return;
      try { emitter.complete(); }
      catch (RuntimeException exception) {
        if (!ClientDisconnects.isDisconnected(exception)) log.warn("Dashboard stream completion failed", exception);
      }
    }
  }
}
