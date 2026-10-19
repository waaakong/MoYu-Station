package com.studyroom.dto;

public class ChatMessageResponse {
  @com.fasterxml.jackson.databind.annotation.JsonSerialize(using=com.fasterxml.jackson.databind.ser.std.ToStringSerializer.class)
  private Long id;
  @com.fasterxml.jackson.databind.annotation.JsonSerialize(using=com.fasterxml.jackson.databind.ser.std.ToStringSerializer.class)
  private Long conversationId;
  @com.fasterxml.jackson.databind.annotation.JsonSerialize(using=com.fasterxml.jackson.databind.ser.std.ToStringSerializer.class)
  private Long senderId;
  private String clientMessageId;
  @com.fasterxml.jackson.databind.annotation.JsonSerialize(using=com.fasterxml.jackson.databind.ser.std.ToStringSerializer.class)
  private Long receiverId;
  private String senderName;
  private String senderAvatar;
  private String channelType;
  private String messageType;
  private String content;
  private String mediaUrl;
  private MediaDescriptor media;
  public MediaDescriptor getMedia() { return media; }
  public void setMedia(MediaDescriptor media) { this.media = media; }
  private Boolean mine;
  private Boolean recalled;
  @com.fasterxml.jackson.databind.annotation.JsonSerialize(using=com.fasterxml.jackson.databind.ser.std.ToStringSerializer.class)
  private Long recalledById;
  private Boolean canRecall;
  private String createdAt;

  public Long getId() {
    return id;
  }

  public void setId(Long id) {
    this.id = id;
  }

  public Long getConversationId() {
    return conversationId;
  }

  public void setConversationId(Long conversationId) {
    this.conversationId = conversationId;
  }

  public Long getSenderId() {
    return senderId;
  }

  public void setSenderId(Long senderId) {
    this.senderId = senderId;
  }

  public String getClientMessageId() {
    return clientMessageId;
  }

  public void setClientMessageId(String clientMessageId) {
    this.clientMessageId = clientMessageId;
  }

  public Long getReceiverId() {
    return receiverId;
  }

  public void setReceiverId(Long receiverId) {
    this.receiverId = receiverId;
  }

  public String getSenderName() {
    return senderName;
  }

  public void setSenderName(String senderName) {
    this.senderName = senderName;
  }

  public String getSenderAvatar() {
    return senderAvatar;
  }

  public void setSenderAvatar(String senderAvatar) {
    this.senderAvatar = senderAvatar;
  }

  public String getChannelType() {
    return channelType;
  }

  public void setChannelType(String channelType) {
    this.channelType = channelType;
  }

  public String getMessageType() {
    return messageType;
  }

  public void setMessageType(String messageType) {
    this.messageType = messageType;
  }

  public String getContent() {
    return content;
  }

  public void setContent(String content) {
    this.content = content;
  }

  public String getMediaUrl() {
    return mediaUrl;
  }

  public void setMediaUrl(String mediaUrl) {
    this.mediaUrl = mediaUrl;
  }

  public Boolean getMine() {
    return mine;
  }

  public void setMine(Boolean mine) {
    this.mine = mine;
  }

  public Boolean getRecalled() {
    return recalled;
  }

  public void setRecalled(Boolean recalled) {
    this.recalled = recalled;
  }

  public Long getRecalledById() {
    return recalledById;
  }

  public void setRecalledById(Long recalledById) {
    this.recalledById = recalledById;
  }

  public Boolean getCanRecall() {
    return canRecall;
  }

  public void setCanRecall(Boolean canRecall) {
    this.canRecall = canRecall;
  }

  public String getCreatedAt() {
    return createdAt;
  }

  public void setCreatedAt(String createdAt) {
    this.createdAt = createdAt;
  }
}
