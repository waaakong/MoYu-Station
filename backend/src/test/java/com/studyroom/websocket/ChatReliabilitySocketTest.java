package com.studyroom.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyroom.dto.*;
import com.studyroom.entity.User;
import com.studyroom.service.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class ChatReliabilitySocketTest {
  @Test void privateRetryAcknowledgesTwiceButNotifiesRecipientOnce() throws Exception {
    var service = mock(ChatService.class); var hub = mock(ChatSocketHub.class); var session = mock(WebSocketSession.class);
    var sender = new User(); sender.setId(1L); var receiver = new User(); receiver.setId(2L);
    when(session.getAttributes()).thenReturn(new HashMap<>(Map.of(AuthService.SESSION_USER_ID, 1L, AuthService.SESSION_LOGIN_VERSION, "v")));
    when(service.requireSocketUser(1L, "v")).thenReturn(sender);
    var response = new ChatMessageResponse(); response.setId(9L); response.setClientMessageId("original");
    response.setSenderId(1L); response.setReceiverId(2L); response.setChannelType("PRIVATE");
    when(service.savePrivateMessageResult(eq(sender), eq(2L), any())).thenReturn(new ChatMessageSaveResult(response, true), new ChatMessageSaveResult(response, false));
    when(service.messageResponseFor(9L, 2L)).thenReturn(response);
    when(service.activeUserById(2L)).thenReturn(receiver); when(service.unread(receiver)).thenReturn(List.of());
    var handler = new ChatWebSocketHandler(service, hub, new ObjectMapper());
    var request = new TextMessage("{\"type\":\"PRIVATE_MESSAGE_SEND\",\"payload\":{\"receiverId\":2,\"clientMessageId\":\"original\",\"content\":\"hi\"}}");
    handler.handleMessage(session, request); handler.handleMessage(session, request);
    verify(hub, times(2)).send(session, "MESSAGE_ACK", response);
    verify(hub, times(1)).sendToUser(1L, "PRIVATE_MESSAGE_RECEIVE", response);
    verify(hub, times(1)).sendToUser(2L, "PRIVATE_MESSAGE_RECEIVE", response);
    verify(hub, times(1)).sendToUser(2L, "PRIVATE_UNREAD_UPDATE", List.of());
    verifyNoMoreInteractions(hub);
  }

  @Test void hallRetryDoesNotBroadcastAgain() throws Exception {
    var service = mock(ChatService.class); var hub = mock(ChatSocketHub.class); var session = mock(WebSocketSession.class);
    var user = new User(); user.setId(1L);
    when(session.getAttributes()).thenReturn(new HashMap<>(Map.of(AuthService.SESSION_USER_ID, 1L, AuthService.SESSION_LOGIN_VERSION, "v")));
    when(service.requireSocketUser(1L, "v")).thenReturn(user);
    var response = new ChatMessageResponse(); response.setId(9L); response.setClientMessageId("original");
    when(service.saveHallMessageResult(eq(user), any())).thenReturn(new ChatMessageSaveResult(response, false));
    new ChatWebSocketHandler(service, hub, new ObjectMapper()).handleMessage(session,
        new TextMessage("{\"type\":\"HALL_MESSAGE_SEND\",\"payload\":{\"clientMessageId\":\"original\",\"content\":\"hi\"}}"));
    verify(hub).send(session, "MESSAGE_ACK", response); verifyNoMoreInteractions(hub);
  }
}
