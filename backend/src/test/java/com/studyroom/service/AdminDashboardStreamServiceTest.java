package com.studyroom.service;

import java.io.IOException;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class AdminDashboardStreamServiceTest {
  @Test void completedEmitterIsNotSentAgainOrCompletedTwice() throws Exception {
    AdminMetricsSnapshotService snapshots = mock(AdminMetricsSnapshotService.class);
    SseEmitter emitter = mock(SseEmitter.class);
    AtomicReference<Runnable> completed = new AtomicReference<>();
    AtomicReference<Runnable> timedOut = new AtomicReference<>();
    doAnswer(call -> { completed.set(call.getArgument(0)); return null; }).when(emitter).onCompletion(any());
    doAnswer(call -> { timedOut.set(call.getArgument(0)); return null; }).when(emitter).onTimeout(any());
    AdminDashboardStreamService service = new AdminDashboardStreamService(snapshots, () -> emitter);
    service.connect();
    completed.get().run();
    completed.get().run();
    timedOut.get().run();
    service.broadcast();
    verify(emitter, times(1)).send(any(SseEmitter.SseEventBuilder.class));
    verify(emitter, never()).complete();
  }

  @Test void timeoutAndLateErrorAreIdempotent() throws Exception {
    SseEmitter emitter = mock(SseEmitter.class);
    AtomicReference<Runnable> timeout = new AtomicReference<>();
    AtomicReference<Consumer<Throwable>> error = new AtomicReference<>();
    doAnswer(call -> { timeout.set(call.getArgument(0)); return null; }).when(emitter).onTimeout(any());
    doAnswer(call -> { error.set(call.getArgument(0)); return null; }).when(emitter).onError(any());
    AdminDashboardStreamService service = new AdminDashboardStreamService(mock(AdminMetricsSnapshotService.class), () -> emitter);
    service.connect();
    timeout.get().run();
    timeout.get().run();
    error.get().accept(new IOException("Broken pipe"));
    service.broadcast();
    verify(emitter, times(1)).complete();
    verify(emitter, times(1)).send(any(SseEmitter.SseEventBuilder.class));
  }

  @Test void failedSendRemovesOnlyTheFailedConnection() throws Exception {
    SseEmitter failed = mock(SseEmitter.class), healthy = mock(SseEmitter.class);
    doThrow(new IOException("Broken pipe")).when(failed).send(any(SseEmitter.SseEventBuilder.class));
    AtomicReference<SseEmitter> next = new AtomicReference<>(failed);
    AdminDashboardStreamService service = new AdminDashboardStreamService(mock(AdminMetricsSnapshotService.class), next::get);
    service.connect();
    next.set(healthy);
    service.connect();
    service.broadcast();
    service.broadcast();
    verify(failed, times(1)).send(any(SseEmitter.SseEventBuilder.class));
    verify(failed, times(1)).complete();
    verify(healthy, times(3)).send(any(SseEmitter.SseEventBuilder.class));
  }

  @Test void snapshotBusinessFailureDoesNotSilentlyDiscardClients() throws Exception {
    AdminMetricsSnapshotService snapshots = mock(AdminMetricsSnapshotService.class);
    SseEmitter emitter = mock(SseEmitter.class);
    AdminDashboardStreamService service = new AdminDashboardStreamService(snapshots, () -> emitter);
    service.connect();
    when(snapshots.current()).thenThrow(new IllegalStateException("metrics sampling failed")).thenReturn(null);
    service.broadcast();
    service.broadcast();
    verify(emitter, times(2)).send(any(SseEmitter.SseEventBuilder.class));
    verify(emitter, never()).complete();
  }
}
