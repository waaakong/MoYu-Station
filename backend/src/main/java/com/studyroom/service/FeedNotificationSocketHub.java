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
public class FeedNotificationSocketHub {
  private final ConcurrentMap<Long, Set<WebSocketSession>> sessionsByUser = new ConcurrentHashMap<>();
  private final ObjectMapper objectMapper;

  public FeedNotificationSocketHub(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
  }

  public void register(Long userId, WebSocketSession session) {
    sessionsByUser.computeIfAbsent(userId, key -> ConcurrentHashMap.newKeySet()).add(session);
  }

  public void unregister(Long userId, WebSocketSession session) {
    if (userId == null) {
      return;
    }
    Set<WebSocketSession> sessions = sessionsByUser.get(userId);
    if (sessions == null) {
      return;
    }
    sessions.remove(session);
    if (sessions.isEmpty()) {
      sessionsByUser.remove(userId, sessions);
    }
  }

  public Set<Long> activeUserIds() {
    return Collections.unmodifiableSet(sessionsByUser.keySet());
  }

  public void sendToUser(Long userId, String type, Object payload) {
    Set<WebSocketSession> sessions = sessionsByUser.get(userId);
    if (sessions == null) {
      return;
    }
    sessions.forEach(session -> send(session, type, payload));
  }
  /** Invalidation only. Readers re-fetch through authenticated HTTP; no body or actor is broadcast. */
  public void postChanged(Long postId) {
    Runnable publish=()->sessionsByUser.values().forEach(sessions->sessions.forEach(session->send(session,"FEED_POST_CHANGED",java.util.Map.of("postId",String.valueOf(postId)))));
    if(org.springframework.transaction.support.TransactionSynchronizationManager.isSynchronizationActive())
      org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(new org.springframework.transaction.support.TransactionSynchronization(){@Override public void afterCommit(){publish.run();}});
    else publish.run();
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
