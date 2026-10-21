package com.studyroom.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyroom.dto.ChatSocketEnvelope;
import org.springframework.stereotype.Service;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.function.Consumer;

@Service
public class ClientUpdateSocketHub {
  private final ConcurrentMap<Long, Set<WebSocketSession>> sessionsByUser = new ConcurrentHashMap<>();
  private final ObjectMapper objectMapper;
  private final ConcurrentMap<WebSocketSession, Consumer<WebSocketSession>> validators = new ConcurrentHashMap<>();

  public ClientUpdateSocketHub(ObjectMapper objectMapper) { this.objectMapper = objectMapper; }

  public void register(Long userId, WebSocketSession session, Consumer<WebSocketSession> validator) {
    validators.put(session, validator);
    sessionsByUser.computeIfAbsent(userId, ignored -> ConcurrentHashMap.newKeySet()).add(session);
  }

  public void unregister(Long userId, WebSocketSession session) {
    validators.remove(session);
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
      validators.remove(session);
      try { session.close(CloseStatus.POLICY_VIOLATION); } catch (Exception ignored) { }
    });
  }

  public void broadcast(String channel, String releaseId, String version) {
    Map<String, String> payload = Map.of("channel", channel, "releaseId", releaseId, "version", version);
    sessionsByUser.values().forEach(sessions -> sessions.forEach(session -> send(session, "CLIENT_UPDATE_AVAILABLE", payload)));
  }

  /** Includes negative policy changes; clients must recheck rather than trust this hint. */
  public void broadcastPolicyChanged(String channel, String releaseId, String version, String policyVersion) {
    Map<String, String> payload = Map.of("channel", channel, "releaseId", releaseId, "version", version, "policyVersion", policyVersion);
    sessionsByUser.values().forEach(sessions -> sessions.forEach(session -> send(session, "CLIENT_UPDATE_POLICY_CHANGED", payload)));
  }

  @Scheduled(fixedDelayString = "${studyroom.client-updates.socket-auth-check-ms:30000}")
  public void validateIdleSessions() {
    validators.forEach((session, validator) -> {
      try {
        if (!session.isOpen()) throw new IllegalStateException("UPDATE_SOCKET_CLOSED");
        validator.accept(session);
      } catch (Exception failure) {
        sessionsByUser.forEach((userId, sessions) -> unregister(userId, session));
        try { session.close(CloseStatus.POLICY_VIOLATION); } catch (Exception ignored) { }
      }
    });
  }

  public void send(WebSocketSession session, String type, Object payload) {
    if (session == null || !session.isOpen()) return;
    synchronized (session) {
      try {
        Consumer<WebSocketSession> validator = validators.get(session);
        if (validator == null) throw new IllegalStateException("UPDATE_SOCKET_NOT_REGISTERED");
        validator.accept(session);
        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(new ChatSocketEnvelope<>(type, payload))));
      } catch (Exception ignored) {
        validators.remove(session);
        sessionsByUser.forEach((userId, sessions) -> unregister(userId, session));
        try { session.close(CloseStatus.POLICY_VIOLATION); } catch (Exception closeFailure) { }
      }
    }
  }
}
