package com.studyroom.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyroom.dto.ChatSocketEnvelope;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.Collections;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Service
public class ChatSocketHub {
  private final ConcurrentMap<Long, Set<WebSocketSession>> sessionsByUser = new ConcurrentHashMap<>();
  private final ObjectMapper objectMapper;

  public ChatSocketHub(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
  }

  public void register(Long userId, WebSocketSession session) {
    sessionsByUser.computeIfAbsent(userId, key -> ConcurrentHashMap.newKeySet()).add(session);
  }

  public boolean unregister(Long userId, WebSocketSession session) {
    if (userId == null) {
      return false;
    }
    Set<WebSocketSession> sessions = sessionsByUser.get(userId);
    if (sessions == null) {
      return false;
    }
    sessions.remove(session);
    if (sessions.isEmpty()) {
      sessionsByUser.remove(userId, sessions);
      return true;
    }
    return false;
  }

  public Set<Long> activeUserIds() {
    return Collections.unmodifiableSet(sessionsByUser.keySet());
  }

  public void broadcast(String type, Object payload) {
    sessionsByUser.values().forEach(sessions -> sessions.forEach(session -> send(session, type, payload)));
  }

  public void sendToUser(Long userId, String type, Object payload) {
    Set<WebSocketSession> sessions = sessionsByUser.get(userId);
    if (sessions == null) {
      return;
    }
    sessions.forEach(session -> send(session, type, payload));
  }

  /** New media hints validate each live session; legacy message delivery remains unchanged. */
  public void sendToUserIf(Long userId, String type, Object payload, java.util.function.Predicate<WebSocketSession> allowed) {
    Set<WebSocketSession> sessions = sessionsByUser.get(userId);
    if (sessions == null) return;
    sessions.forEach(session -> {
      try { if (session.isOpen() && allowed.test(session)) send(session, type, payload); }
      catch (RuntimeException unavailable) { /* One stale/broken session must not stop other sessions. */ }
    });
  }

  public void send(WebSocketSession session, String type, Object payload) {
    if (session == null || !session.isOpen()) {
      return;
    }
    synchronized (session) {
      try {
        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(new ChatSocketEnvelope<>(type, payload))));
      } catch (IOException ignored) {
        // Broken socket sessions are cleaned up by the close callback.
      }
    }
  }
}
