package com.studyroom.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.studyroom.common.AccountLoggedInElsewhereException;
import com.studyroom.common.BusinessException;
import com.studyroom.dto.ChatMessageResponse;
import com.studyroom.dto.ChatMessageSaveResult;
import com.studyroom.dto.ChatUnreadResponse;
import com.studyroom.dto.ChatUserResponse;
import com.studyroom.dto.SendChatMessageRequest;
import com.studyroom.entity.ChatMessage;
import com.studyroom.entity.ChatMessageVisibility;
import com.studyroom.entity.PrivateConversation;
import com.studyroom.entity.User;
import com.studyroom.mapper.ChatMessageMapper;
import com.studyroom.mapper.ChatMessageVisibilityMapper;
import com.studyroom.mapper.PrivateConversationMapper;
import com.studyroom.mapper.UserMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class ChatService {
  private static final int MESSAGE_LIMIT = 80;
  private static final int MAX_TEXT_LENGTH = 1000;
  private static final long MAX_IMAGE_SIZE = 5L * 1024L * 1024L;
  private static final DateTimeFormatter DATE_TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

  private final UserMapper userMapper;
  private final ChatMessageMapper chatMessageMapper;
  private final PrivateConversationMapper privateConversationMapper;
  private final ChatMessageVisibilityMapper chatMessageVisibilityMapper;
  private final ImageStorageService imageStorageService;
  private com.studyroom.media.MediaDescriptorService mediaDescriptors;
  private PrivateMessageDeletionService privateDeletion;
  @org.springframework.beans.factory.annotation.Autowired(required=false)
  public void setPrivateDeletion(PrivateMessageDeletionService service){privateDeletion=service;}
  public boolean supportsPrivateDeletion(){return privateDeletion!=null;}
  public void deletePrivateMessage(User user,Long messageId){
    if(privateDeletion==null)throw new BusinessException("CHAT_DELETION_UNAVAILABLE","当前服务尚未启用单条删除。");
    privateDeletion.delete(user,messageId);
  }
  public List<String> visiblePrivateMessageIds(User user,Long peer,List<Long> ids){
    if(privateDeletion==null)throw new BusinessException("CHAT_DELETION_UNAVAILABLE","当前服务尚未启用单条删除。");
    return privateDeletion.visible(user.getId(),peer,ids);
  }
  @org.springframework.beans.factory.annotation.Autowired(required = false)
  public void setMediaDescriptors(com.studyroom.media.MediaDescriptorService value) { mediaDescriptors = value; }

  public ChatService(
      UserMapper userMapper,
      ChatMessageMapper chatMessageMapper,
      PrivateConversationMapper privateConversationMapper,
      ChatMessageVisibilityMapper chatMessageVisibilityMapper,
      ImageStorageService imageStorageService
  ) {
    this.userMapper = userMapper;
    this.chatMessageMapper = chatMessageMapper;
    this.privateConversationMapper = privateConversationMapper;
    this.chatMessageVisibilityMapper = chatMessageVisibilityMapper;
    this.imageStorageService = imageStorageService;
  }

  public User requireSocketUser(Long userId, String loginVersion) {
    if (userId == null || !StringUtils.hasText(loginVersion)) {
      throw new BusinessException("请先登录。");
    }
    User user = userMapper.selectById(userId);
    if (user == null || Integer.valueOf(1).equals(user.getDeleted())) {
      throw new BusinessException("请先登录。");
    }
    if (!Objects.equals(user.getLoginVersion(), loginVersion)) {
      throw new AccountLoggedInElsewhereException();
    }
    if ("BANNED".equalsIgnoreCase(user.getUserType())) {
      throw new BusinessException("账号已被封禁，无法使用聊天功能。");
    }
    return user;
  }

  public List<ChatUserResponse> onlineUsers(User currentUser) {
    return onlineUsersFor(currentUser.getId());
  }

  public List<ChatUserResponse> onlineUsersFor(Long currentUserId) {
    Map<Long, Integer> unread = unreadCountMap(currentUserId);
    Map<Long, User> visibleUsers = new LinkedHashMap<>();

    List<User> onlineUsers = userMapper.selectList(new LambdaQueryWrapper<User>()
        .eq(User::getDeleted, 0)
        .ne(currentUserId != null, User::getId, currentUserId)
        .ne(User::getOnlineStatus, "OFFLINE")
        .orderByDesc(User::getLastLoginAt));

    for (User user : onlineUsers) {
      if (!"BANNED".equalsIgnoreCase(user.getUserType())) {
        visibleUsers.put(user.getId(), user);
      }
    }

    if (currentUserId != null) {
      List<PrivateConversation> conversations = privateConversationMapper.selectList(new LambdaQueryWrapper<PrivateConversation>()
          .and(wrapper -> wrapper.eq(PrivateConversation::getUserAId, currentUserId)
              .or()
              .eq(PrivateConversation::getUserBId, currentUserId))
          .orderByDesc(PrivateConversation::getLastMessageAt));

      Set<Long> conversationUserIds = conversations.stream()
          .map(conversation -> Objects.equals(conversation.getUserAId(), currentUserId)
              ? conversation.getUserBId()
              : conversation.getUserAId())
          .filter(Objects::nonNull)
          .filter(userId -> !Objects.equals(userId, currentUserId))
          .collect(Collectors.toCollection(java.util.LinkedHashSet::new));

      conversationUserIds.removeAll(visibleUsers.keySet());
      if (!conversationUserIds.isEmpty()) {
        List<User> conversationUsers = userMapper.selectBatchIds(conversationUserIds);
        Map<Long, User> byId = conversationUsers.stream()
            .filter(user -> user != null
                && Integer.valueOf(0).equals(user.getDeleted())
                && !"BANNED".equalsIgnoreCase(user.getUserType()))
            .collect(Collectors.toMap(User::getId, Function.identity(), (left, right) -> left, LinkedHashMap::new));
        for (Long userId : conversationUserIds) {
          User user = byId.get(userId);
          if (user != null) {
            visibleUsers.put(userId, user);
          }
        }
      }
    }

    return visibleUsers.values().stream()
        .map(user -> toUserResponse(user, unread.getOrDefault(user.getId(), 0)))
        .collect(Collectors.toList());
  }

  public User activeUserById(Long userId) {
    if (userId == null) {
      return null;
    }
    User user = userMapper.selectById(userId);
    if (user == null || Integer.valueOf(1).equals(user.getDeleted()) || "BANNED".equalsIgnoreCase(user.getUserType())) {
      return null;
    }
    return user;
  }

  public List<ChatMessageResponse> hallMessages(User currentUser, Long afterId) {
    return hallMessages(currentUser, afterId, null);
  }

  public List<ChatMessageResponse> hallMessages(User currentUser, Long afterId, Long beforeId) {
    validateCursors(afterId, beforeId);
    LambdaQueryWrapper<ChatMessage> query = new LambdaQueryWrapper<ChatMessage>()
        .eq(ChatMessage::getChannelType, "HALL");
    if (afterId != null && afterId > 0) {
      query.gt(ChatMessage::getId, afterId).orderByAsc(ChatMessage::getId);
      return toMessageResponses(chatMessageMapper.selectList(query.last("LIMIT " + MESSAGE_LIMIT)), currentUser);
    }
    query.lt(beforeId != null, ChatMessage::getId, beforeId);
    List<ChatMessage> latest = chatMessageMapper.selectList(query.orderByDesc(ChatMessage::getId).last("LIMIT " + MESSAGE_LIMIT));
    Collections.reverse(latest);
    return toMessageResponses(latest, currentUser);
  }

  public List<ChatMessageResponse> privateMessages(User currentUser, Long targetUserId, Long afterId) {
    return privateMessages(currentUser, targetUserId, afterId, null);
  }

  public List<ChatMessageResponse> privateMessages(User currentUser, Long targetUserId, Long afterId, Long beforeId) {
    validateCursors(afterId, beforeId);
    PrivateConversation conversation = findConversation(currentUser.getId(), targetUserId);
    if (conversation == null) {
      return Collections.emptyList();
    }
    LambdaQueryWrapper<ChatMessage> query = new LambdaQueryWrapper<ChatMessage>()
        .eq(ChatMessage::getChannelType, "PRIVATE")
        .eq(ChatMessage::getConversationId, conversation.getId());
    query.notExists("SELECT 1 FROM sr_chat_message_visibility v WHERE v.message_id=sr_chat_message.id AND v.user_id={0}", currentUser.getId());
    if (afterId != null && afterId > 0) {
      query.gt(ChatMessage::getId, afterId).orderByAsc(ChatMessage::getId);
      return toMessageResponses(chatMessageMapper.selectList(query.last("LIMIT " + MESSAGE_LIMIT)), currentUser);
    }
    query.lt(beforeId != null, ChatMessage::getId, beforeId);
    List<ChatMessage> latest = chatMessageMapper.selectList(query.orderByDesc(ChatMessage::getId).last("LIMIT " + MESSAGE_LIMIT));
    Collections.reverse(latest);
    return toMessageResponses(latest, currentUser);
  }

  @Transactional
  public ChatMessageResponse saveHallMessage(User user, SendChatMessageRequest request) {
    return saveHallMessageResult(user, request).getMessage();
  }

  @Transactional(timeout = 10)
  public ChatMessageSaveResult saveHallMessageResult(User user, SendChatMessageRequest request) {
    ensureCanSend(user);
    NormalizedMessage normalized = normalizeMessage(request);
    String clientId = normalizeClientId(request);
    ChatMessageSaveResult existing = existingSend(user, clientId, "HALL", null, normalized);
    if (existing != null) return existing;
    ChatMessage message = new ChatMessage();
    message.setSenderId(user.getId());
    message.setClientMessageId(clientId);
    message.setChannelType("HALL");
    message.setMessageType(normalized.messageType);
    message.setContent(normalized.content);
    message.setMediaUrl(normalized.mediaUrl);
    chatMessageMapper.insert(message);
    return new ChatMessageSaveResult(toMessageResponse(chatMessageMapper.selectById(message.getId()), user, user.getId()), true);
  }

  @Transactional
  public ChatMessageResponse savePrivateMessage(User user, Long targetUserId, SendChatMessageRequest request) {
    return savePrivateMessageResult(user, targetUserId, request).getMessage();
  }

  @Transactional(timeout = 10)
  public ChatMessageSaveResult savePrivateMessageResult(User user, Long targetUserId, SendChatMessageRequest request) {
    ensureCanSend(user);
    if (targetUserId == null || Objects.equals(targetUserId, user.getId())) {
      throw new BusinessException("请选择私聊用户。");
    }
    User target = userMapper.selectById(targetUserId);
    if (target == null || Integer.valueOf(1).equals(target.getDeleted())) {
      throw new BusinessException("私聊用户不存在。");
    }
    NormalizedMessage normalized = normalizeMessage(request);
    String clientId = normalizeClientId(request);
    ChatMessageSaveResult existing = existingSend(user, clientId, "PRIVATE", targetUserId, normalized);
    if (existing != null) return existing;
    PrivateConversation conversation = findOrCreateConversation(user.getId(), targetUserId);
    ChatMessage message = new ChatMessage();
    message.setConversationId(conversation.getId());
    message.setSenderId(user.getId());
    message.setClientMessageId(clientId);
    message.setReceiverId(targetUserId);
    message.setChannelType("PRIVATE");
    message.setMessageType(normalized.messageType);
    message.setContent(normalized.content);
    message.setMediaUrl(normalized.mediaUrl);
    chatMessageMapper.insert(message);
    privateConversationMapper.update(null, new LambdaUpdateWrapper<PrivateConversation>()
        .eq(PrivateConversation::getId, conversation.getId())
        .set(PrivateConversation::getLastMessageAt, LocalDateTime.now()));
    return new ChatMessageSaveResult(toMessageResponse(chatMessageMapper.selectById(message.getId()), user, user.getId()), true);
  }

  private void validateCursors(Long afterId, Long beforeId) {
    if ((afterId != null && beforeId != null) || (afterId != null && afterId <= 0) || (beforeId != null && beforeId <= 0)) {
      throw new BusinessException("CHAT_INVALID_CURSOR", "向前和向后游标必须互斥且为正整数。");
    }
  }

  private String normalizeClientId(SendChatMessageRequest request) {
    String value = request.getClientMessageId();
    if (value == null) return null; // Legacy clients remain readable/sendable, without retry guarantees.
    if (!value.matches("[A-Za-z0-9_-]{1,64}")) {
      throw new BusinessException("CHAT_INVALID_MESSAGE_ID", "客户端消息 ID 格式错误。");
    }
    // Image publication has its own asset ACL, receipt and transaction; never bypass it here.
    if (!"TEXT".equalsIgnoreCase(request.getMessageType() == null ? "TEXT" : request.getMessageType().trim())) {
      throw new BusinessException("CHAT_USE_MEDIA_PUBLICATION", "图片请通过受控图片发布接口发送。");
    }
    return value;
  }

  private ChatMessageSaveResult existingSend(User user, String clientId, String channel, Long receiverId, NormalizedMessage normalized) {
    if (clientId == null) return null;
    // Serialize this account's sends before the first lookup; locking reads also see a concurrent commit under MySQL RR.
    User locked = userMapper.selectOne(new LambdaQueryWrapper<User>().eq(User::getId, user.getId()).last("FOR UPDATE"));
    if (locked == null || Integer.valueOf(1).equals(locked.getDeleted()) || "BANNED".equalsIgnoreCase(locked.getUserType())) {
      throw new BusinessException("账号不可用。");
    }
    ensureCanSend(locked);
    if (!Objects.equals(user.getLoginVersion(), locked.getLoginVersion())) throw new AccountLoggedInElsewhereException();
    if(privateDeletion!=null && privateDeletion.wasRemoved(user.getId(),clientId))throw new BusinessException("CHAT_MESSAGE_REMOVED","此消息记录已删除，不会重新发送。");
    ChatMessage previous = chatMessageMapper.selectOne(new LambdaQueryWrapper<ChatMessage>()
        .eq(ChatMessage::getSenderId, user.getId()).eq(ChatMessage::getClientMessageId, clientId).last("FOR UPDATE"));
    if (previous == null) return null;
    if (!Objects.equals(previous.getClientMessageId(), clientId) || !Objects.equals(previous.getChannelType(), channel) || !Objects.equals(previous.getReceiverId(), receiverId)
        || !Objects.equals(previous.getMessageType(), normalized.messageType)
        || !Objects.equals(previous.getContent(), normalized.content) || !Objects.equals(previous.getMediaUrl(), normalized.mediaUrl)) {
      throw new BusinessException("CHAT_MESSAGE_ID_CONFLICT", "该消息 ID 已绑定其他内容或收件人，请勿改写重试目标。");
    }
    if (visibilityExists(previous.getId(), user.getId())) {
      throw new BusinessException("CHAT_MESSAGE_REMOVED", "此消息记录已删除，不会重新发送。");
    }
    return new ChatMessageSaveResult(toMessageResponse(previous, user, user.getId()), false);
  }

  @Transactional
  public void deletePrivateMessages(User currentUser, Long targetUserId) {
    deletePrivateMessages(currentUser,targetUserId,null);
  }
  @Transactional
  public void deletePrivateMessages(User currentUser, Long targetUserId,Long throughId) {
    if(throughId!=null && throughId<=0)throw new BusinessException("CHAT_CURSOR_INVALID","删除范围无效。");
    PrivateConversation conversation = findConversation(currentUser.getId(), targetUserId);
    if (conversation == null) {
      return;
    }
    List<ChatMessage> messages = chatMessageMapper.selectList(new LambdaQueryWrapper<ChatMessage>()
        .eq(ChatMessage::getChannelType, "PRIVATE")
        .eq(ChatMessage::getConversationId, conversation.getId())
        .le(throughId!=null,ChatMessage::getId,throughId)
        .orderByAsc(ChatMessage::getId));
    if (messages.isEmpty()) {
      return;
    }
    if(privateDeletion!=null){for(ChatMessage message:messages)privateDeletion.delete(currentUser,message.getId());return;}
    LocalDateTime hiddenAt = LocalDateTime.now();
    for (ChatMessage message : messages) {
      if (!visibilityExists(message.getId(), currentUser.getId())) {
        ChatMessageVisibility visibility = new ChatMessageVisibility();
        visibility.setMessageId(message.getId());
        visibility.setUserId(currentUser.getId());
        visibility.setHiddenAt(hiddenAt);
        chatMessageVisibilityMapper.insert(visibility);
      }
      int hiddenCount = Math.toIntExact(chatMessageVisibilityMapper.selectCount(new LambdaQueryWrapper<ChatMessageVisibility>()
          .eq(ChatMessageVisibility::getMessageId, message.getId())));
      // Keep the immutable idempotency receipt for reliable text sends, even when both participants hide it.
      if (hiddenCount >= 2 && !("TEXT".equals(message.getMessageType()) && message.getClientMessageId() != null)) {
        chatMessageMapper.deleteById(message.getId());
        chatMessageVisibilityMapper.delete(new LambdaQueryWrapper<ChatMessageVisibility>()
            .eq(ChatMessageVisibility::getMessageId, message.getId()));
      }
    }
  }

  @Transactional
  public ChatMessageResponse recallPrivateMessage(User currentUser, Long messageId) {
    ChatMessage message = chatMessageMapper.selectById(messageId);
    if (message == null || !"PRIVATE".equalsIgnoreCase(message.getChannelType())) {
      throw new BusinessException("Message not found.");
    }
    if (!Objects.equals(currentUser.getId(), message.getSenderId())) {
      throw new BusinessException("Only the sender can recall this message.");
    }
    if (message.getRecalledAt() != null) {
      return toMessageResponse(message, userMapper.selectById(message.getSenderId()), currentUser.getId());
    }
    LocalDateTime createdAt = message.getCreatedAt();
    if (createdAt == null || createdAt.isBefore(LocalDateTime.now().minusMinutes(3))) {
      throw new BusinessException("Messages can only be recalled within 3 minutes.");
    }
    LocalDateTime recalledAt = LocalDateTime.now();
    ChatMessage updateEntity = new ChatMessage();
    updateEntity.setRecalledAt(recalledAt);
    updateEntity.setRecalledById(currentUser.getId());
    chatMessageMapper.update(updateEntity, new LambdaUpdateWrapper<ChatMessage>()
        .eq(ChatMessage::getId, messageId)
        .isNull(ChatMessage::getRecalledAt));
    message.setRecalledAt(recalledAt);
    message.setRecalledById(currentUser.getId());
    return toMessageResponse(message, userMapper.selectById(message.getSenderId()), currentUser.getId());
  }

  public void markPrivateRead(User currentUser, Long senderId) {
    markPrivateRead(currentUser, senderId, null);
  }

  public void markPrivateRead(User currentUser, Long senderId, Long throughId) {
    if (senderId == null) return;
    if (throughId != null && throughId <= 0) throw new BusinessException("CHAT_CURSOR_INVALID", "已读位置无效");
    chatMessageMapper.update(null, new LambdaUpdateWrapper<ChatMessage>()
        .eq(ChatMessage::getChannelType, "PRIVATE")
        .eq(ChatMessage::getSenderId, senderId)
        .eq(ChatMessage::getReceiverId, currentUser.getId())
        .le(throughId != null, ChatMessage::getId, throughId)
        .isNull(ChatMessage::getReadAt)
        .isNull(ChatMessage::getRecalledAt)
        .set(ChatMessage::getReadAt, LocalDateTime.now()));
  }

  public List<ChatUnreadResponse> unread(User currentUser) {
    List<ChatMessage> messages = chatMessageMapper.selectList(new LambdaQueryWrapper<ChatMessage>()
        .eq(ChatMessage::getChannelType, "PRIVATE")
        .eq(ChatMessage::getReceiverId, currentUser.getId())
        .isNull(ChatMessage::getReadAt)
        .isNull(ChatMessage::getRecalledAt)
        .orderByDesc(ChatMessage::getCreatedAt)
        .last("LIMIT 200"));
    if (messages.isEmpty()) {
      return Collections.emptyList();
    }
    Map<Long, User> users = userMap(messages.stream().map(ChatMessage::getSenderId).collect(Collectors.toSet()));
    var hidden = hiddenMessageIds(currentUser.getId(), messages.stream().map(ChatMessage::getId).collect(Collectors.toSet()));
    Map<Long, ChatUnreadResponse> grouped = new LinkedHashMap<>();
    for (ChatMessage message : messages) {
      if (hidden.contains(message.getId())) continue;
      ChatUnreadResponse item = grouped.computeIfAbsent(message.getSenderId(), senderId -> {
        User sender = users.get(senderId);
        ChatUnreadResponse response = new ChatUnreadResponse();
        response.setSenderId(senderId);
        response.setSenderName(displayName(sender));
        response.setSenderAvatar(sender == null ? null : sender.getAvatarUrl());
        response.setUnreadCount(0);
        response.setLatestText(previewText(message));
        response.setCreatedAt(formatDateTime(message.getCreatedAt()));
        return response;
      });
      item.setUnreadCount(item.getUnreadCount() + 1);
    }
    return new ArrayList<>(grouped.values());
  }

  public String uploadImage(User user, MultipartFile file) {
    if (file == null || file.isEmpty()) {
      throw new BusinessException("请选择图片。");
    }
    if (file.getSize() > MAX_IMAGE_SIZE) {
      throw new BusinessException("UPLOAD_TOO_LARGE", "单张聊天图片不能超过 5MB。");
    }
    try {
      ImageStorageService.StoredImage storedImage = imageStorageService.saveDisplayImage(
          file,
          user.getId(),
          Path.of("chat", String.valueOf(user.getId())),
          "/uploads/chat/" + user.getId(),
          "chat-" + System.currentTimeMillis(),
          1280,
          1280,
          0.82F
      );
      return storedImage.displayUrl();
    } catch (IOException exception) {
      throw new BusinessException("聊天图片保存失败，请稍后再试。");
    }
  }

  public void updateOnlineStatus(User user, String onlineStatus) {
    String normalized = normalizeOnlineStatus(onlineStatus);
    LambdaUpdateWrapper<User> update = new LambdaUpdateWrapper<User>()
        .eq(User::getId, user.getId())
        .set(User::getOnlineStatus, normalized);
    if ("OFFLINE".equals(normalized)) {
      update.set(User::getLastActiveAt, null);
    } else {
      update.set(User::getLastActiveAt, LocalDateTime.now());
    }
    userMapper.update(null, update);
    user.setOnlineStatus(normalized);
  }

  private Map<Long, Integer> unreadCountMap(Long currentUserId) {
    List<ChatMessage> messages = chatMessageMapper.selectList(new LambdaQueryWrapper<ChatMessage>()
        .eq(ChatMessage::getChannelType, "PRIVATE")
        .eq(ChatMessage::getReceiverId, currentUserId)
        .isNull(ChatMessage::getReadAt)
        .isNull(ChatMessage::getRecalledAt)
        .last("LIMIT 500"));
    List<Long> hiddenMessageIds = hiddenMessageIds(currentUserId, messages.stream()
        .map(ChatMessage::getId)
        .filter(Objects::nonNull)
        .collect(Collectors.toSet()));
    Map<Long, Integer> result = new LinkedHashMap<>();
    for (ChatMessage message : messages) {
      if (hiddenMessageIds.contains(message.getId())) {
        continue;
      }
      result.merge(message.getSenderId(), 1, Integer::sum);
    }
    return result;
  }

  private List<Long> hiddenMessageIds(Long userId, Long conversationId) {
    if (userId == null || conversationId == null) {
      return Collections.emptyList();
    }
    List<ChatMessage> conversationMessages = chatMessageMapper.selectList(new LambdaQueryWrapper<ChatMessage>()
        .select(ChatMessage::getId)
        .eq(ChatMessage::getChannelType, "PRIVATE")
        .eq(ChatMessage::getConversationId, conversationId));
    Set<Long> messageIds = conversationMessages.stream()
        .map(ChatMessage::getId)
        .filter(Objects::nonNull)
        .collect(Collectors.toSet());
    return hiddenMessageIds(userId, messageIds);
  }

  private List<Long> hiddenMessageIds(Long userId, Set<Long> messageIds) {
    if (userId == null || messageIds == null || messageIds.isEmpty()) {
      return Collections.emptyList();
    }
    return chatMessageVisibilityMapper.selectList(new LambdaQueryWrapper<ChatMessageVisibility>()
            .select(ChatMessageVisibility::getMessageId)
            .eq(ChatMessageVisibility::getUserId, userId)
            .in(ChatMessageVisibility::getMessageId, messageIds))
        .stream()
        .map(ChatMessageVisibility::getMessageId)
        .filter(Objects::nonNull)
        .collect(Collectors.toList());
  }

  private boolean visibilityExists(Long messageId, Long userId) {
    Long count = chatMessageVisibilityMapper.selectCount(new LambdaQueryWrapper<ChatMessageVisibility>()
        .eq(ChatMessageVisibility::getMessageId, messageId)
        .eq(ChatMessageVisibility::getUserId, userId));
    return count != null && count > 0;
  }

  private void ensureCanSend(User user) {
    if ("MUTED".equalsIgnoreCase(user.getUserType())) {
      throw new BusinessException("禁言用户暂时无法在聊天页发言。");
    }
  }

  private NormalizedMessage normalizeMessage(SendChatMessageRequest request) {
    if (request == null) {
      throw new BusinessException("消息不能为空。");
    }
    String messageType = StringUtils.hasText(request.getMessageType())
        ? request.getMessageType().trim().toUpperCase(Locale.ROOT)
        : "TEXT";
    if (!List.of("TEXT", "IMAGE").contains(messageType)) {
      throw new BusinessException("当前聊天仅支持文字和图片消息。");
    }
    String content = request.getContent() == null ? "" : request.getContent().trim();
    String mediaUrl = request.getMediaUrl() == null ? "" : request.getMediaUrl().trim();
    if ("TEXT".equals(messageType)) {
      if (!StringUtils.hasText(content)) {
        throw new BusinessException("消息内容不能为空。");
      }
      if (content.length() > MAX_TEXT_LENGTH) {
        throw new BusinessException("消息内容不能超过 1000 个字符。");
      }
      mediaUrl = null;
    } else {
      if (!StringUtils.hasText(mediaUrl)) {
        throw new BusinessException("请先上传图片。");
      }
      if (!StringUtils.hasText(content)) {
        content = "图片消息";
      }
    }
    return new NormalizedMessage(messageType, content, mediaUrl);
  }

  private PrivateConversation findOrCreateConversation(Long currentUserId, Long targetUserId) {
    PrivateConversation conversation = findConversation(currentUserId, targetUserId);
    if (conversation != null) {
      return conversation;
    }
    conversation = new PrivateConversation();
    conversation.setUserAId(Math.min(currentUserId, targetUserId));
    conversation.setUserBId(Math.max(currentUserId, targetUserId));
    conversation.setLastMessageAt(LocalDateTime.now());
    try {
      privateConversationMapper.insert(conversation);
      return conversation;
    } catch (RuntimeException exception) {
      PrivateConversation existing = findConversation(currentUserId, targetUserId);
      if (existing != null) return existing;
      throw exception;
    }
  }

  private PrivateConversation findConversation(Long currentUserId, Long targetUserId) {
    if (currentUserId == null || targetUserId == null) {
      return null;
    }
    Long userAId = Math.min(currentUserId, targetUserId);
    Long userBId = Math.max(currentUserId, targetUserId);
    return privateConversationMapper.selectOne(new LambdaQueryWrapper<PrivateConversation>()
        .eq(PrivateConversation::getUserAId, userAId)
        .eq(PrivateConversation::getUserBId, userBId)
        .last("LIMIT 1"));
  }

  private List<ChatMessageResponse> toMessageResponses(List<ChatMessage> messages, User currentUser) {
    if (messages == null || messages.isEmpty()) {
      return Collections.emptyList();
    }
    Map<Long, User> users = userMap(messages.stream().map(ChatMessage::getSenderId).collect(Collectors.toSet()));
    Long currentUserId = currentUser == null ? null : currentUser.getId();
    var descriptors = mediaDescriptors == null ? Map.<Long, List<com.studyroom.dto.MediaDescriptor>>of()
        : mediaDescriptors.messages(messages.stream().filter(message -> "IMAGE".equals(message.getMessageType()) && message.getRecalledAt() == null)
            .map(ChatMessage::getId).collect(Collectors.toList()));
    return messages.stream()
        .map(message -> toMessageResponse(message, users.get(message.getSenderId()), currentUserId, descriptors.getOrDefault(message.getId(), List.of())))
        .collect(Collectors.toList());
  }

  public ChatMessageResponse toMessageResponse(ChatMessage message, User sender, Long currentUserId) {
    var descriptors = mediaDescriptors == null || !"IMAGE".equals(message.getMessageType()) || message.getRecalledAt() != null
        ? List.<com.studyroom.dto.MediaDescriptor>of() : mediaDescriptors.messages(List.of(message.getId())).getOrDefault(message.getId(), List.of());
    return toMessageResponse(message, sender, currentUserId, descriptors);
  }

  private ChatMessageResponse toMessageResponse(ChatMessage message, User sender, Long currentUserId, List<com.studyroom.dto.MediaDescriptor> media) {
    ChatMessageResponse response = new ChatMessageResponse();
    response.setId(message.getId());
    response.setConversationId(message.getConversationId());
    response.setSenderId(message.getSenderId());
    response.setClientMessageId(message.getClientMessageId());
    response.setReceiverId(message.getReceiverId());
    response.setSenderName(displayName(sender));
    response.setSenderAvatar(sender == null ? null : sender.getAvatarUrl());
    response.setChannelType(message.getChannelType());
    response.setMessageType(message.getMessageType());
    boolean recalled = message.getRecalledAt() != null;
    response.setContent(recalled ? "" : message.getContent());
    response.setMediaUrl(recalled ? null : message.getMediaUrl());
    response.setMedia(recalled || media.isEmpty() ? null : media.get(0));
    response.setMine(currentUserId != null && Objects.equals(currentUserId, message.getSenderId()));
    response.setRecalled(recalled);
    response.setRecalledById(message.getRecalledById());
    response.setCanRecall(canRecall(message, currentUserId));
    response.setCreatedAt(formatDateTime(message.getCreatedAt()));
    return response;
  }

  private boolean canRecall(ChatMessage message, Long currentUserId) {
    if (message == null || currentUserId == null) {
      return false;
    }
    if (!"PRIVATE".equalsIgnoreCase(message.getChannelType())) {
      return false;
    }
    if (!Objects.equals(currentUserId, message.getSenderId()) || message.getRecalledAt() != null) {
      return false;
    }
    LocalDateTime createdAt = message.getCreatedAt();
    return createdAt != null && !createdAt.isBefore(LocalDateTime.now().minusMinutes(3));
  }

  public ChatMessageResponse messageResponseFor(Long messageId, Long currentUserId) {
    ChatMessage message = chatMessageMapper.selectById(messageId);
    if (message == null) {
      throw new BusinessException("消息不存在。");
    }
    return toMessageResponse(message, userMapper.selectById(message.getSenderId()), currentUserId);
  }

  private ChatUserResponse toUserResponse(User user, int unreadCount) {
    ChatUserResponse response = new ChatUserResponse();
    response.setId(user.getId());
    response.setUsername(user.getUsername());
    response.setNickname(displayName(user));
    response.setAvatarUrl(user.getAvatarUrl());
    response.setUserType(user.getUserType());
    response.setOnlineStatus(user.getOnlineStatus());
    response.setUnreadCount(unreadCount);
    return response;
  }

  private Map<Long, User> userMap(Set<Long> userIds) {
    if (userIds == null || userIds.isEmpty()) {
      return Collections.emptyMap();
    }
    return userMapper.selectBatchIds(userIds).stream()
        .collect(Collectors.toMap(User::getId, Function.identity(), (left, right) -> left, LinkedHashMap::new));
  }

  private String displayName(User user) {
    if (user == null) return "StudyRoom";
    if (StringUtils.hasText(user.getNickname())) return user.getNickname();
    return user.getUsername();
  }

  private String previewText(ChatMessage message) {
    if ("IMAGE".equalsIgnoreCase(message.getMessageType())) {
      return "发来一张图片";
    }
    return StringUtils.hasText(message.getContent()) ? message.getContent() : "发来一条消息";
  }

  private String normalizeOnlineStatus(String status) {
    String value = StringUtils.hasText(status) ? status.trim().toUpperCase(Locale.ROOT) : "IDLE";
    if (!List.of("FOCUSING", "PLAYING", "IDLE", "OFFLINE").contains(value)) {
      return "IDLE";
    }
    return value;
  }

  private String formatDateTime(LocalDateTime value) {
    return value == null ? "" : value.format(DATE_TIME_FORMATTER);
  }

  private String extensionOf(String filename) {
    if (!StringUtils.hasText(filename) || !filename.contains(".")) {
      return "";
    }
    return filename.substring(filename.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
  }

  private record NormalizedMessage(String messageType, String content, String mediaUrl) {
  }
}
