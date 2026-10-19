package com.studyroom.media;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyroom.entity.User;
import com.studyroom.service.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.*;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;

class MediaPublicationNotifierTest {
  private final ChatService accounts = mock(ChatService.class);
  private final ChatSocketHub hub = new ChatSocketHub(new ObjectMapper());
  private final MediaPublicationNotifier notifier = new MediaPublicationNotifier(accounts, hub);

  @Test void privateImagePublishesCanonicalMessageOnlyToItsVerifiedRecipient() throws Exception {
    WebSocketSession sender = socket(1, "current"), receiver = socket(2, "current"), stranger = socket(3, "current");
    var message = new com.studyroom.dto.ChatMessageResponse(); message.setId(7L); message.setSenderId(1L); message.setReceiverId(2L); message.setMessageType("IMAGE");
    when(accounts.messageResponseFor(7L, 2L)).thenReturn(message);
    notifier.accept(event(MediaPublicationService.Kind.PRIVATE));
    verify(sender).sendMessage(any()); verify(stranger, never()).sendMessage(any());
    var captured = org.mockito.ArgumentCaptor.forClass(WebSocketMessage.class); verify(receiver, times(2)).sendMessage(captured.capture());
    var node = new ObjectMapper().readTree(captured.getAllValues().get(1).getPayload().toString());
    assertThat(node.path("type").asText()).isEqualTo("PRIVATE_MESSAGE_RECEIVE");
    assertThat(node.path("payload").path("id").asText()).isEqualTo("7");
  }

  @Test void privateHintOnlyReachesParticipantsAndContainsNoMediaOrRequestData() throws Exception {
    WebSocketSession first = socket(1, "current"), second = socket(2, "current"), third = socket(3, "current");
    notifier.accept(event(MediaPublicationService.Kind.PRIVATE));
    var captured = org.mockito.ArgumentCaptor.forClass(WebSocketMessage.class);
    verify(first).sendMessage(captured.capture()); verify(second).sendMessage(any()); verify(third, never()).sendMessage(any());
    var node = new ObjectMapper().readTree(captured.getValue().getPayload().toString());
    assertThat(node.path("type").asText()).isEqualTo(MediaPublicationNotifier.EVENT);
    assertThat(node.path("payload").size()).isEqualTo(2);
    assertThat(node.path("payload").path("kind").asText()).isEqualTo("PRIVATE");
    assertThat(node.path("payload").path("targetId").asLong()).isEqualTo(7);
  }
  @Test void replacedSessionIsSkippedWithoutBlockingCurrentSession() throws Exception {
    WebSocketSession stale = socket(1, "stale"), current = socket(1, "current");
    when(accounts.requireSocketUser(1L, "stale")).thenThrow(new IllegalStateException("expired"));
    notifier.accept(event(MediaPublicationService.Kind.PRIVATE));
    verify(stale, never()).sendMessage(any()); verify(current).sendMessage(any());
  }
  @Test void publicHintChecksAccountsAndSkipsClosedOrMisregisteredSockets() throws Exception {
    WebSocketSession active = socket(1, "current"), closed = socket(2, "current"), mismatch = socket(3, "current");
    when(closed.isOpen()).thenReturn(false);
    when(mismatch.getAttributes()).thenReturn(Map.of(AuthService.SESSION_USER_ID, 4L, AuthService.SESSION_LOGIN_VERSION, "current"));
    notifier.accept(event(MediaPublicationService.Kind.POST));
    verify(active).sendMessage(any()); verify(closed, never()).sendMessage(any()); verify(mismatch, never()).sendMessage(any());
    verify(accounts, never()).requireSocketUser(3L, "current");
  }
  @Test void brokenSocketDoesNotPreventOtherParticipantNotification() throws Exception {
    WebSocketSession broken = socket(1, "current"), receiver = socket(2, "current");
    doThrow(new java.io.IOException("socket failure")).when(broken).sendMessage(any());
    notifier.accept(event(MediaPublicationService.Kind.PRIVATE)); verify(receiver).sendMessage(any());
  }
  private WebSocketSession socket(long id, String version) {
    var socket = mock(WebSocketSession.class); when(socket.isOpen()).thenReturn(true);
    when(socket.getAttributes()).thenReturn(Map.of(AuthService.SESSION_USER_ID, id, AuthService.SESSION_LOGIN_VERSION, version));
    when(accounts.requireSocketUser(id, version)).thenReturn(new User()); hub.register(id, socket); return socket;
  }
  private MediaPublicationService.Committed event(MediaPublicationService.Kind kind) {
    return new MediaPublicationService.Committed(1, kind == MediaPublicationService.Kind.PRIVATE ? 2L : null, new MediaPublicationService.Published(kind, 7));
  }
}
