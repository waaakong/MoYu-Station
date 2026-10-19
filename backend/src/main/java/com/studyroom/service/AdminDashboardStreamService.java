package com.studyroom.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.concurrent.CopyOnWriteArrayList;

@Service
public class AdminDashboardStreamService {
  private static final long STREAM_TIMEOUT_MS = 130_000L;
  private final AdminMetricsSnapshotService snapshots;
  private final CopyOnWriteArrayList<SseEmitter> emitters = new CopyOnWriteArrayList<>();

  public AdminDashboardStreamService(AdminMetricsSnapshotService snapshots) {
    this.snapshots = snapshots;
  }

  public SseEmitter connect() {
    SseEmitter emitter = new SseEmitter(STREAM_TIMEOUT_MS);
    emitters.add(emitter);
    emitter.onCompletion(() -> emitters.remove(emitter));
    emitter.onTimeout(() -> removeAndComplete(emitter));
    emitter.onError(error -> emitters.remove(emitter));
    send(emitter);
    return emitter;
  }

  @Scheduled(fixedDelayString = "${studyroom.admin-metrics.interval-ms:60000}")
  public void broadcast() {
    for (SseEmitter emitter : emitters) send(emitter);
  }

  private void send(SseEmitter emitter) {
    try {
      emitter.send(SseEmitter.event().name("dashboard").data(snapshots.current()));
    } catch (IOException | IllegalStateException exception) {
      removeAndComplete(emitter);
    }
  }

  private void removeAndComplete(SseEmitter emitter) {
    emitters.remove(emitter);
    try { emitter.complete(); } catch (RuntimeException ignored) { }
  }
}
