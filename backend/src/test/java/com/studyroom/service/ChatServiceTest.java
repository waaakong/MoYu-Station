package com.studyroom.service;

import com.studyroom.common.BusinessException;
import com.studyroom.dto.ChatMessageResponse;
import com.studyroom.entity.ChatMessage;
import com.studyroom.entity.PrivateConversation;
import com.studyroom.entity.User;
import com.studyroom.mapper.ChatMessageMapper;
import com.studyroom.mapper.ChatMessageVisibilityMapper;
import com.studyroom.mapper.PrivateConversationMapper;
import com.studyroom.mapper.UserMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChatServiceTest {
  @Mock
  private UserMapper userMapper;
  @Mock
  private ChatMessageMapper chatMessageMapper;
  @Mock
  private PrivateConversationMapper privateConversationMapper;
  @Mock
  private ChatMessageVisibilityMapper chatMessageVisibilityMapper;
  @Mock
  private ImageStorageService imageStorageService;

  @Test
  void deletePrivateMessagesCreatesCurrentUserVisibilityRows() {
    ChatService service = service();
    User currentUser = user(1L);
    PrivateConversation conversation = conversation(10L, 1L, 2L);
    ChatMessage message = privateMessage(99L, 10L, 1L, 2L, LocalDateTime.now().minusMinutes(5));

    when(privateConversationMapper.selectOne(any())).thenReturn(conversation);
    when(chatMessageMapper.selectList(any())).thenReturn(java.util.List.of(message));

    service.deletePrivateMessages(currentUser, 2L);

    ArgumentCaptor<com.studyroom.entity.ChatMessageVisibility> captor =
        ArgumentCaptor.forClass(com.studyroom.entity.ChatMessageVisibility.class);
    verify(chatMessageVisibilityMapper).insert(captor.capture());
    assertThat(captor.getValue().getMessageId()).isEqualTo(99L);
    assertThat(captor.getValue().getUserId()).isEqualTo(1L);
  }

  @Test
  void recallPrivateMessageRejectsMessagesOlderThanThreeMinutes() {
    ChatService service = service();
    User currentUser = user(1L);
    ChatMessage message = privateMessage(99L, 10L, 1L, 2L, LocalDateTime.now().minusMinutes(4));

    when(chatMessageMapper.selectById(99L)).thenReturn(message);

    assertThatThrownBy(() -> service.recallPrivateMessage(currentUser, 99L))
        .isInstanceOf(BusinessException.class);
  }

  @Test
  void recallPrivateMessageMarksOwnFreshMessageAsRecalled() {
    ChatService service = service();
    User currentUser = user(1L);
    User sender = user(1L);
    ChatMessage message = privateMessage(99L, 10L, 1L, 2L, LocalDateTime.now().minusMinutes(2));

    when(chatMessageMapper.selectById(99L)).thenReturn(message);
    when(userMapper.selectById(1L)).thenReturn(sender);

    ChatMessageResponse response = service.recallPrivateMessage(currentUser, 99L);

    verify(chatMessageMapper).update(any(ChatMessage.class), any());
    assertThat(response.getId()).isEqualTo(99L);
    assertThat(response.getRecalled()).isTrue();
    assertThat(response.getCanRecall()).isFalse();
  }

  private ChatService service() {
    return new ChatService(userMapper, chatMessageMapper, privateConversationMapper, chatMessageVisibilityMapper, imageStorageService);
  }

  private User user(Long id) {
    User user = new User();
    user.setId(id);
    user.setUsername("user" + id);
    user.setNickname("User " + id);
    user.setUserType("NORMAL");
    return user;
  }

  private PrivateConversation conversation(Long id, Long userAId, Long userBId) {
    PrivateConversation conversation = new PrivateConversation();
    conversation.setId(id);
    conversation.setUserAId(userAId);
    conversation.setUserBId(userBId);
    return conversation;
  }

  private ChatMessage privateMessage(Long id, Long conversationId, Long senderId, Long receiverId, LocalDateTime createdAt) {
    ChatMessage message = new ChatMessage();
    message.setId(id);
    message.setConversationId(conversationId);
    message.setSenderId(senderId);
    message.setReceiverId(receiverId);
    message.setChannelType("PRIVATE");
    message.setMessageType("TEXT");
    message.setContent("hello");
    message.setCreatedAt(createdAt);
    return message;
  }
}
