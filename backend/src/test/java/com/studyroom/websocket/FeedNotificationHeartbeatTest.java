package com.studyroom.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyroom.entity.User;
import com.studyroom.service.*;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.*;
import static org.mockito.Mockito.*;

class FeedNotificationHeartbeatTest {
  @Test void heartbeatRevalidatesIdentityAndRespondsWithoutBusinessWrites() throws Exception {
    var service = mock(ChatService.class); var hub = mock(FeedNotificationSocketHub.class); var session = mock(WebSocketSession.class);
    when(session.getAttributes()).thenReturn(Map.of(AuthService.SESSION_USER_ID, 2L, AuthService.SESSION_LOGIN_VERSION, "epoch"));
    when(service.requireSocketUser(2L, "epoch")).thenReturn(new User());
    var handler = new FeedNotificationWebSocketHandler(service, hub, new ObjectMapper());
    handler.handleMessage(session, new TextMessage("{\"type\":\"PING\"}"));
    verify(service).requireSocketUser(2L, "epoch");
    verify(hub).send(eq(session), eq("PONG"), any()); verifyNoMoreInteractions(service);
  }
  @Test void revokedSessionGetsClosedInsteadOfContinuingHeartbeat() throws Exception {
    var service = mock(ChatService.class); var hub = mock(FeedNotificationSocketHub.class); var session = mock(WebSocketSession.class);
    when(session.getAttributes()).thenReturn(Map.of(AuthService.SESSION_USER_ID, 2L, AuthService.SESSION_LOGIN_VERSION, "old"));
    when(service.requireSocketUser(2L, "old")).thenThrow(new IllegalStateException("expired"));
    new FeedNotificationWebSocketHandler(service, hub, new ObjectMapper()).handleMessage(session, new TextMessage("{\"type\":\"PING\"}"));
    verify(session).close(); verify(hub, never()).send(eq(session), eq("PONG"), any());
  }
  @Test void invalidFramesCannotBecomeBusinessCommands() throws Exception {
    var service = mock(ChatService.class); var hub = mock(FeedNotificationSocketHub.class); var session = mock(WebSocketSession.class);
    when(session.getAttributes()).thenReturn(Map.of(AuthService.SESSION_USER_ID, 2L, AuthService.SESSION_LOGIN_VERSION, "epoch"));
    when(service.requireSocketUser(2L, "epoch")).thenReturn(new User());
    new FeedNotificationWebSocketHandler(service, hub, new ObjectMapper()).handleMessage(session, new TextMessage("{\"type\":\"DELETE\"}"));
    verify(session).close(CloseStatus.POLICY_VIOLATION); verifyNoInteractions(hub);
  }
}
