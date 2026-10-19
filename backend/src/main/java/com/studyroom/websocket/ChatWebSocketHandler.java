package com.studyroom.websocket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyroom.common.AccountLoggedInElsewhereException;
import com.studyroom.common.BusinessException;
import com.studyroom.dto.ChatMessageResponse;
import com.studyroom.dto.SendChatMessageRequest;
import com.studyroom.entity.User;
import com.studyroom.service.AuthService;
import com.studyroom.service.ChatService;
import com.studyroom.service.ChatSocketHub;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.Map;

@Component
public class ChatWebSocketHandler extends TextWebSocketHandler {
  private static final String CHAT_USER_ID = "CHAT_USER_ID";
  private final ChatService chatService;
  private final ChatSocketHub chatSocketHub;
  private final ObjectMapper objectMapper;

  public ChatWebSocketHandler(ChatService chatService, ChatSocketHub chatSocketHub, ObjectMapper objectMapper) {
    this.chatService = chatService;
    this.chatSocketHub = chatSocketHub;
    this.objectMapper = objectMapper;
  }

  @Override
  public void afterConnectionEstablished(WebSocketSession session) {
    try {
      User user = currentUser(session);
      session.getAttributes().put(CHAT_USER_ID, user.getId());
      chatSocketHub.register(user.getId(), session);
      chatService.updateOnlineStatus(user, "IDLE");
      chatSocketHub.send(session, "CONNECTED", Map.of("userId", user.getId()));
      broadcastOnlineUsers();
    } catch (RuntimeException exception) {
      sendError(session, exception);
      closeQuietly(session);
    }
  }

  @Override
  protected void handleTextMessage(WebSocketSession session, TextMessage message) {
    String clientMessageId = null;
    try {
      User user = currentUser(session);
      JsonNode root = objectMapper.readTree(message.getPayload());
      String type = root.path("type").asText("");
      JsonNode payload = root.path("payload");
      String candidateId = payload.path("clientMessageId").asText("");
      if (candidateId.matches("[A-Za-z0-9_-]{1,64}")) clientMessageId = candidateId;
      switch (type) {
        case "PING" -> chatSocketHub.send(session, "PONG", Map.of("time", System.currentTimeMillis()));
        case "STATUS_UPDATE" -> {
          String status = payload.path("onlineStatus").asText("IDLE");
          chatService.updateOnlineStatus(user, status);
          broadcastOnlineUsers();
        }
        case "HALL_MESSAGE_SEND" -> {
          SendChatMessageRequest request = objectMapper.treeToValue(payload, SendChatMessageRequest.class);
          var result = chatService.saveHallMessageResult(user, request);
          ChatMessageResponse saved = result.getMessage();
          if (saved.getClientMessageId() != null) chatSocketHub.send(session, "MESSAGE_ACK", saved);
          if (!result.isCreated()) break;
          for (Long activeUserId : chatSocketHub.activeUserIds()) {
            chatSocketHub.sendToUser(activeUserId, "HALL_MESSAGE_RECEIVE", chatService.messageResponseFor(saved.getId(), activeUserId));
          }
        }
        case "PRIVATE_MESSAGE_SEND" -> {
          SendChatMessageRequest request = objectMapper.treeToValue(payload, SendChatMessageRequest.class);
          Long receiverId = request.getReceiverId();
          var result = chatService.savePrivateMessageResult(user, receiverId, request);
          ChatMessageResponse saved = result.getMessage();
          if (saved.getClientMessageId() != null) chatSocketHub.send(session, "MESSAGE_ACK", saved);
          if (!result.isCreated()) break;
          chatSocketHub.sendToUser(user.getId(), "PRIVATE_MESSAGE_RECEIVE", saved);
          chatSocketHub.sendToUser(receiverId, "PRIVATE_MESSAGE_RECEIVE", chatService.messageResponseFor(saved.getId(), receiverId));
          User receiver = chatService.activeUserById(receiverId);
          if (receiver != null) {
            chatSocketHub.sendToUser(receiverId, "PRIVATE_UNREAD_UPDATE", chatService.unread(receiver));
          }
        }
        case "PRIVATE_MESSAGE_RECALL" -> {
          Long messageId = payload.path("messageId").asLong(0);
          ChatMessageResponse recalled = chatService.recallPrivateMessage(user, messageId);
          chatSocketHub.sendToUser(recalled.getSenderId(), "PRIVATE_MESSAGE_RECALLED", recalled);
          if (recalled.getReceiverId() != null) {
            chatSocketHub.sendToUser(recalled.getReceiverId(), "PRIVATE_MESSAGE_RECALLED",
                chatService.messageResponseFor(recalled.getId(), recalled.getReceiverId()));
          }
        }
        default -> throw new BusinessException("不支持的聊天事件。");
      }
    } catch (RuntimeException exception) {
      sendError(session, exception, exception instanceof BusinessException ? clientMessageId : null);
    } catch (Exception exception) {
      sendError(session, new BusinessException("聊天消息处理失败，请稍后再试。"));
    }
  }

  @Override
  public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
    Long userId = readLong(session.getAttributes().get(CHAT_USER_ID));
    boolean lastSession = chatSocketHub.unregister(userId, session);
    if (lastSession) {
      User user = chatService.activeUserById(userId);
      if (user != null) {
        chatService.updateOnlineStatus(user, "OFFLINE");
      }
      broadcastOnlineUsers();
    }
  }

  private User currentUser(WebSocketSession session) {
    Long userId = readLong(session.getAttributes().get(AuthService.SESSION_USER_ID));
    String loginVersion = session.getAttributes().get(AuthService.SESSION_LOGIN_VERSION) instanceof String
        ? (String) session.getAttributes().get(AuthService.SESSION_LOGIN_VERSION)
        : "";
    return chatService.requireSocketUser(userId, loginVersion);
  }

  private void broadcastOnlineUsers() {
    for (Long userId : chatSocketHub.activeUserIds()) {
      chatSocketHub.sendToUser(userId, "ONLINE_USERS_UPDATE", chatService.onlineUsersFor(userId));
    }
  }

  private void sendError(WebSocketSession session, RuntimeException exception) {
    sendError(session, exception, null);
  }

  private void sendError(WebSocketSession session, RuntimeException exception, String clientMessageId) {
    String code = exception instanceof AccountLoggedInElsewhereException
        ? AccountLoggedInElsewhereException.CODE
        : exception instanceof BusinessException business ? business.getCode() : "CHAT_UNAVAILABLE";
    String message = exception instanceof BusinessException && exception.getMessage() != null ? exception.getMessage() : "聊天服务暂时不可用。";
    var payload = new java.util.LinkedHashMap<String, Object>();
    payload.put("code", code); payload.put("message", message);
    if (clientMessageId != null) payload.put("clientMessageId", clientMessageId);
    chatSocketHub.send(session, "ERROR", payload);
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
