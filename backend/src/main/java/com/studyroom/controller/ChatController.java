package com.studyroom.controller;

import com.studyroom.common.ApiResponse;
import com.studyroom.dto.ChatMessageResponse;
import com.studyroom.dto.ChatUnreadResponse;
import com.studyroom.dto.ChatUserResponse;
import com.studyroom.dto.UpdateOnlineStatusRequest;
import com.studyroom.entity.User;
import com.studyroom.service.AuthService;
import com.studyroom.service.ChatService;
import com.studyroom.service.ChatConversationService;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import javax.servlet.http.HttpSession;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/chat")
public class ChatController {
  private final AuthService authService;
  private final ChatService chatService;
  private final ChatConversationService conversations;

  public ChatController(AuthService authService, ChatService chatService, ChatConversationService conversations) {
    this.authService = authService;
    this.chatService = chatService;
    this.conversations = conversations;
  }

  @GetMapping("/online-users")
  public ApiResponse<List<ChatUserResponse>> onlineUsers(HttpSession session) {
    User user = authService.requireActiveUser(session);
    return ApiResponse.ok(chatService.onlineUsers(user));
  }

  @GetMapping("/capabilities")
  public ApiResponse<Map<String, Boolean>> capabilities(HttpSession session) {
    authService.requireActiveUser(session);
    return ApiResponse.ok(Map.of("reliableText", true, "bidirectionalHistory", true, "conversationPages", true, "boundedRead", true,"privateMessageDeletion",chatService.supportsPrivateDeletion()));
  }

  @GetMapping("/conversations")
  public ApiResponse<ChatConversationService.Page> conversations(@RequestParam(required = false) String cursor, HttpSession session) {
    return ApiResponse.ok(conversations.list(authService.requireActiveUser(session).getId(), cursor));
  }

  @GetMapping("/hall/messages")
  public ApiResponse<List<ChatMessageResponse>> hallMessages(
      @RequestParam(required = false) Long afterId,
      @RequestParam(required = false) Long beforeId,
      HttpSession session
  ) {
    User user = authService.requireActiveUser(session);
    return ApiResponse.ok(chatService.hallMessages(user, afterId, beforeId));
  }

  @GetMapping("/private/{userId}/messages")
  public ApiResponse<List<ChatMessageResponse>> privateMessages(
      @PathVariable Long userId,
      @RequestParam(required = false) Long afterId,
      @RequestParam(required = false) Long beforeId,
      HttpSession session
  ) {
    User user = authService.requireActiveUser(session);
    return ApiResponse.ok(chatService.privateMessages(user, userId, afterId, beforeId));
  }

  @PostMapping("/private/{userId}/read")
  public ApiResponse<Void> readPrivateMessages(@PathVariable Long userId,
      @org.springframework.web.bind.annotation.RequestBody(required = false) ReadPosition position, HttpSession session) {
    User user = authService.requireActiveUser(session);
    chatService.markPrivateRead(user, userId, position == null ? null : position.throughId());
    return ApiResponse.ok(null);
  }

  public record ReadPosition(Long throughId) {}

  @DeleteMapping("/private/{userId}/messages")
  public ApiResponse<Void> deletePrivateMessages(@PathVariable Long userId, @org.springframework.web.bind.annotation.RequestBody(required=false) ReadPosition position,HttpSession session) {
    User user = authService.requireActiveUser(session);
    chatService.deletePrivateMessages(user, userId,position==null?null:position.throughId());
    return ApiResponse.ok(null);
  }

  @PostMapping("/private/messages/{messageId}/recall")
  public ApiResponse<ChatMessageResponse> recallPrivateMessage(@PathVariable Long messageId, HttpSession session) {
    User user = authService.requireActiveUser(session);
    return ApiResponse.ok(chatService.recallPrivateMessage(user, messageId));
  }

  @DeleteMapping("/private/messages/{messageId}")
  public ApiResponse<Map<String,String>> deletePrivateMessage(@PathVariable Long messageId,HttpSession session){
    chatService.deletePrivateMessage(authService.requireActiveUser(session),messageId);
    return ApiResponse.ok(Map.of("messageId",String.valueOf(messageId),"status","deleted"));
  }
  @GetMapping("/private/{userId}/messages/visibility")
  public ApiResponse<Map<String,List<String>>> privateVisibility(@PathVariable Long userId,@RequestParam List<Long> ids,HttpSession session){
    return ApiResponse.ok(Map.of("visibleIds",chatService.visiblePrivateMessageIds(authService.requireActiveUser(session),userId,ids)));
  }

  @GetMapping("/private/unread")
  public ApiResponse<List<ChatUnreadResponse>> unread(HttpSession session) {
    User user = authService.requireActiveUser(session);
    return ApiResponse.ok(chatService.unread(user));
  }

  @PostMapping("/images")
  public ApiResponse<Map<String, String>> uploadImage(
      @RequestParam("file") MultipartFile file,
      HttpSession session
  ) {
    User user = authService.requireActiveUser(session);
    return ApiResponse.ok(Map.of("url", chatService.uploadImage(user, file)));
  }

  @PatchMapping("/status")
  public ApiResponse<Void> updateOnlineStatus(
      @Validated @org.springframework.web.bind.annotation.RequestBody UpdateOnlineStatusRequest request,
      HttpSession session
  ) {
    User user = authService.requireActiveUser(session);
    chatService.updateOnlineStatus(user, request.getOnlineStatus());
    return ApiResponse.ok(null);
  }
}
