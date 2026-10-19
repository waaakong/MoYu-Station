package com.studyroom.websocket;

import com.studyroom.common.AccountLoggedInElsewhereException;
import com.studyroom.common.BusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.web.socket.TextMessage;
import com.studyroom.entity.User;
import com.studyroom.service.AuthService;
import com.studyroom.service.ChatService;
import com.studyroom.service.FeedNotificationSocketHub;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.Map;

@Component
public class FeedNotificationWebSocketHandler extends TextWebSocketHandler {
  private static final String NOTIFICATION_USER_ID = "NOTIFICATION_USER_ID";

  private final ChatService chatService;
  private final FeedNotificationSocketHub notificationSocketHub;
  private final ObjectMapper objectMapper;

  public FeedNotificationWebSocketHandler(ChatService chatService, FeedNotificationSocketHub notificationSocketHub, ObjectMapper objectMapper) {
    this.chatService = chatService;
    this.notificationSocketHub = notificationSocketHub;
    this.objectMapper = objectMapper;
  }

  @Override
  protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
    try {
      currentUser(session); // Revalidate on every heartbeat, not only on the handshake.
      if (message.getPayloadLength() > 1024 || !"PING".equals(objectMapper.readTree(message.getPayload()).path("type").asText())) {
        session.close(CloseStatus.POLICY_VIOLATION);
        return;
      }
      notificationSocketHub.send(session, "PONG", Map.of("time", System.currentTimeMillis()));
    } catch (RuntimeException exception) {
      sendError(session, exception); closeQuietly(session);
    } catch (java.io.IOException exception) {
      closeQuietly(session);
    }
  }

  @Override
  public void afterConnectionEstablished(WebSocketSession session) {
    try {
      User user = currentUser(session);
      session.getAttributes().put(NOTIFICATION_USER_ID, user.getId());
      notificationSocketHub.register(user.getId(), session);
      notificationSocketHub.send(session, "CONNECTED", Map.of("userId", user.getId()));
    } catch (RuntimeException exception) {
      sendError(session, exception);
      closeQuietly(session);
    }
  }

  @Override
  public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
    notificationSocketHub.unregister(readLong(session.getAttributes().get(NOTIFICATION_USER_ID)), session);
  }

  private User currentUser(WebSocketSession session) {
    Long userId = readLong(session.getAttributes().get(AuthService.SESSION_USER_ID));
    String loginVersion = session.getAttributes().get(AuthService.SESSION_LOGIN_VERSION) instanceof String
        ? (String) session.getAttributes().get(AuthService.SESSION_LOGIN_VERSION)
        : "";
    return chatService.requireSocketUser(userId, loginVersion);
  }

  private void sendError(WebSocketSession session, RuntimeException exception) {
    String code = exception instanceof AccountLoggedInElsewhereException
        ? AccountLoggedInElsewhereException.CODE
        : exception instanceof BusinessException business ? business.getCode() : "NOTIFICATION_UNAVAILABLE";
    String message = exception instanceof BusinessException && exception.getMessage() != null
        ? exception.getMessage() : "互动通知服务暂时不可用。";
    notificationSocketHub.send(session, "ERROR", Map.of("code", code, "message", message));
  }

  private Long readLong(Object value) {
    if (value instanceof Long number) return number;
    if (value instanceof Integer number) return number.longValue();
    if (value instanceof String text) {
      try {
        return Long.parseLong(text);
      } catch (NumberFormatException ignored) {
        return null;
      }
    }
    return null;
  }

  private void closeQuietly(WebSocketSession session) {
    try {
      session.close();
    } catch (Exception ignored) {
      // Ignore close errors.
    }
  }
}
