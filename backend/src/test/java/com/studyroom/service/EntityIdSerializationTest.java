package com.studyroom.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyroom.dto.*;
import com.studyroom.media.MediaPublicationService;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class EntityIdSerializationTest {
  private final ObjectMapper json = new ObjectMapper();
  private static final long ID = 2104509220480131075L;

  @Test void allResponseIdentityFieldsAreStringsWithoutChangingDomainLongs() throws Exception {
    for (Class<?> type : List.of(UserProfileResponse.class, ChatMessageResponse.class, ChatUserResponse.class,
        ChatUnreadResponse.class, FeedPostResponse.class, FeedCommentResponse.class, FeedNotificationResponse.class,
        AdminUserResponse.class, AdminPostResponse.class, AdminFeedbackResponse.class, AdminAuditResponse.class,
        InvitationResponse.class, ProfilePostResponse.class, FocusRecordResponse.class, FocusSyncItemResponse.class, UserAudioResponse.class)) {
      var instance = type.getConstructor().newInstance();
      for (var field : type.getDeclaredFields()) if (field.getType() == Long.class && (field.getName().equals("id") || field.getName().endsWith("Id"))) {
        field.setAccessible(true); field.set(instance, ID);
        var node = json.readTree(json.writeValueAsString(instance)).get(field.getName());
        assertThat(node.isTextual()).as(type.getSimpleName()+"."+field.getName()).isTrue();
        assertThat(node.textValue()).isEqualTo(String.valueOf(ID));
      }
    }
  }
  @Test void conversationFeedAndMediaRecordsKeepIdsButNotCountersAsText() throws Exception {
    var summary=new ChatConversationService.Summary(ID,ID-1,"u",null,null,"IDLE",true,ID+1,"hello","now",2);
    var node=json.readTree(json.writeValueAsString(summary));
    for(String field:List.of("conversationId","userId","lastMessageId"))assertThat(node.get(field).isTextual()).isTrue();
    assertThat(node.get("unreadCount").isNumber()).isTrue();
    var page=new FeedTimelineService.Page(List.of(),null,3,List.of(ID,ID+1));
    node=json.readTree(json.writeValueAsString(page));
    assertThat(node.get("followingIds").get(1).textValue()).isEqualTo(String.valueOf(ID+1));
    assertThat(node.get("relationshipVersion").isNumber()).isTrue();
    node=json.readTree(json.writeValueAsString(new MediaPublicationService.Published(MediaPublicationService.Kind.PRIVATE,ID)));
    assertThat(node.get("targetId").textValue()).isEqualTo(String.valueOf(ID));
    node=json.readTree(json.writeValueAsString(new ClientUpdateService.MembershipView(ID,"fixture","stable",false,null,null)));
    assertThat(node.get("userId").textValue()).isEqualTo(String.valueOf(ID));
  }
  @Test void decimalStringRequestsBindToExactDomainLongsAndRejectOverflow() throws Exception {
    var request=json.readValue("{\"receiverId\":\""+ID+"\",\"content\":\"hello\"}",SendChatMessageRequest.class);
    assertThat(request.getReceiverId()).isEqualTo(ID);
    assertThatThrownBy(()->json.readValue("{\"receiverId\":\"9223372036854775808\"}",SendChatMessageRequest.class)).isInstanceOf(com.fasterxml.jackson.core.JsonProcessingException.class);
  }
}
