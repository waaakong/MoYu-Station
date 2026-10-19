package com.studyroom.websocket;

import com.studyroom.entity.User;
import com.studyroom.service.AuthService;
import com.studyroom.service.ChatService;
import com.studyroom.service.ClientUpdateService;
import com.studyroom.service.ClientUpdateSocketHub;
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

  public ClientUpdateWebSocketHandler(ChatService chatService, ClientUpdateService updateService, ClientUpdateSocketHub socketHub) {
    this.chatService = chatService;
    this.updateService = updateService;
    this.socketHub = socketHub;
  }

  @Override
  public void afterConnectionEstablished(WebSocketSession session) throws Exception {
    Long userId = readLong(session.getAttributes().get(AuthService.SESSION_USER_ID));
    String loginVersion = session.getAttributes().get(AuthService.SESSION_LOGIN_VERSION) instanceof String value ? value : "";
    User user = chatService.requireSocketUser(userId, loginVersion);
    if (!updateService.hasAnyMembership(user.getId())) {
      session.close(CloseStatus.POLICY_VIOLATION);
      return;
    }
    session.getAttributes().put(UPDATE_USER_ID, user.getId());
    socketHub.register(user.getId(), session);
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
