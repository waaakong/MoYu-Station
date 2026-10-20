package com.studyroom.websocket;

import com.studyroom.entity.User;
import com.studyroom.service.AuthService;
import com.studyroom.service.ChatService;
import com.studyroom.service.ClientUpdateService;
import com.studyroom.service.ClientUpdateSocketHub;
import com.studyroom.security.SocketSessionGuard;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.Map;

@Component
public class ClientUpdateWebSocketHandler extends TextWebSocketHandler {
  private static final String UPDATE_USER_ID = "CLIENT_UPDATE_USER_ID";
  private final ChatService chatService;
  private final ClientUpdateService updateService;
  private final ClientUpdateSocketHub socketHub;
  private final SocketSessionGuard sessionGuard;

  public ClientUpdateWebSocketHandler(ChatService chatService, ClientUpdateService updateService, ClientUpdateSocketHub socketHub, SocketSessionGuard sessionGuard) {
    this.chatService = chatService;
    this.updateService = updateService;
    this.socketHub = socketHub;
    this.sessionGuard = sessionGuard;
  }

  @Override
  public void afterConnectionEstablished(WebSocketSession session) throws Exception {
    sessionGuard.check(session);
    Long userId = readLong(session.getAttributes().get(AuthService.SESSION_USER_ID));
    String loginVersion = session.getAttributes().get(AuthService.SESSION_LOGIN_VERSION) instanceof String value ? value : "";
    User user = chatService.requireSocketUser(userId, loginVersion);
    if (!updateService.hasAnyMembership(user.getId())) {
      session.close(CloseStatus.POLICY_VIOLATION);
      return;
    }
    session.getAttributes().put(UPDATE_USER_ID, user.getId());
    socketHub.register(user.getId(), session, socket -> {
      sessionGuard.check(socket);
      if (!updateService.hasAnyMembership(user.getId())) throw new IllegalStateException("UPDATE_MEMBERSHIP_REVOKED");
    });
    socketHub.send(session, "CONNECTED", Map.of("updates", true));
  }

  @Override
  public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
    socketHub.unregister(readLong(session.getAttributes().get(UPDATE_USER_ID)), session);
  }

  private Long readLong(Object value) {
    if (value instanceof Number number) return number.longValue();
    if (value instanceof String text) {
      try { return Long.parseLong(text); } catch (NumberFormatException ignored) { return null; }
    }
    return null;
  }
}
