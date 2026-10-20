package com.studyroom.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.any;

class ClientUpdateSocketHubTest {
  @Test
  void rechecksLiveAuthorizationBeforeEveryPushAndDisconnectsOnFailure() throws Exception {
    var session = mock(WebSocketSession.class);
    when(session.isOpen()).thenReturn(true);
    var valid = new java.util.concurrent.atomic.AtomicBoolean(true);
    var hub = new ClientUpdateSocketHub(new ObjectMapper());
    hub.register(42L, session, socket -> {
      if (!valid.get()) throw new IllegalStateException("REVOKED");
    });
    hub.broadcast("stable", "release-a", "0.3.0");
    verify(session, times(1)).sendMessage(any());
    valid.set(false);
    hub.broadcast("stable", "release-b", "0.4.0");
    hub.broadcast("stable", "release-c", "0.5.0");
    verify(session, times(1)).sendMessage(any());
    verify(session).close(CloseStatus.POLICY_VIOLATION);
  }

  @Test
  void refusesUnregisteredSessions() throws Exception {
    var session = mock(WebSocketSession.class);
    when(session.isOpen()).thenReturn(true);
    new ClientUpdateSocketHub(new ObjectMapper()).send(session, "CONNECTED", java.util.Map.of());
    verify(session, never()).sendMessage(any());
    verify(session).close(CloseStatus.POLICY_VIOLATION);
  }

  @Test
  void idleSessionIsClosedAfterRevocationWithoutWaitingForAnotherRelease() throws Exception {
    var session = mock(WebSocketSession.class);
    when(session.isOpen()).thenReturn(true);
    var hub = new ClientUpdateSocketHub(new ObjectMapper());
    hub.register(42L, session, socket -> { throw new IllegalStateException("REDIS_UNAVAILABLE"); });
    hub.validateIdleSessions();
    verify(session).close(CloseStatus.POLICY_VIOLATION);
    hub.broadcast("stable", "release-a", "0.3.0");
    verify(session, never()).sendMessage(any());
  }
}
