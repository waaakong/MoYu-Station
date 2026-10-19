package com.studyroom.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.time.LocalDateTime;

@TableName("sr_chat_message")
public class ChatMessage {
  @TableId
  private Long id;
  private Long conversationId;
  private Long senderId;
  private String clientMessageId;
  private Long receiverId;
  private String channelType;
  private String messageType;
  private String content;
  private String mediaUrl;
  private Integer voiceSeconds;
  private LocalDateTime readAt;
  private LocalDateTime recalledAt;
  private Long recalledById;
  private LocalDateTime createdAt;

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

  public Integer getVoiceSeconds() {
    return voiceSeconds;
  }

  public void setVoiceSeconds(Integer voiceSeconds) {
    this.voiceSeconds = voiceSeconds;
  }

  public LocalDateTime getReadAt() {
    return readAt;
  }

  public void setReadAt(LocalDateTime readAt) {
    this.readAt = readAt;
  }

  public LocalDateTime getRecalledAt() {
    return recalledAt;
  }

  public void setRecalledAt(LocalDateTime recalledAt) {
    this.recalledAt = recalledAt;
  }

  public Long getRecalledById() {
    return recalledById;
  }

  public void setRecalledById(Long recalledById) {
    this.recalledById = recalledById;
  }

  public LocalDateTime getCreatedAt() {
    return createdAt;
  }

  public void setCreatedAt(LocalDateTime createdAt) {
    this.createdAt = createdAt;
  }
}
