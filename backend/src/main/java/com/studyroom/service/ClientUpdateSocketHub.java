package com.studyroom.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyroom.dto.ChatSocketEnvelope;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Service
public class ClientUpdateSocketHub {
  private final ConcurrentMap<Long, Set<WebSocketSession>> sessionsByUser = new ConcurrentHashMap<>();
  private final ObjectMapper objectMapper;

  public ClientUpdateSocketHub(ObjectMapper objectMapper) { this.objectMapper = objectMapper; }

  public void register(Long userId, WebSocketSession session) {
    sessionsByUser.computeIfAbsent(userId, ignored -> ConcurrentHashMap.newKeySet()).add(session);
  }

  public void unregister(Long userId, WebSocketSession session) {
    if (userId == null) return;
    Set<WebSocketSession> sessions = sessionsByUser.get(userId);
    if (sessions == null) return;
    sessions.remove(session);
    if (sessions.isEmpty()) sessionsByUser.remove(userId, sessions);
  }

  public void disconnectUser(Long userId) {
    Set<WebSocketSession> sessions = sessionsByUser.remove(userId);
    if (sessions == null) return;
    sessions.forEach(session -> {
      try { session.close(CloseStatus.POLICY_VIOLATION); } catch (Exception ignored) { }
    });
  }

  public void broadcast(String channel, String releaseId, String version) {
    Map<String, String> payload = Map.of("channel", channel, "releaseId", releaseId, "version", version);
    sessionsByUser.values().forEach(sessions -> sessions.forEach(session -> send(session, "CLIENT_UPDATE_AVAILABLE", payload)));
  }

  public void send(WebSocketSession session, String type, Object payload) {
    if (session == null || !session.isOpen()) return;
    synchronized (session) {
      try {
        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(new ChatSocketEnvelope<>(type, payload))));
      } catch (Exception ignored) { }
    }
  }
}
