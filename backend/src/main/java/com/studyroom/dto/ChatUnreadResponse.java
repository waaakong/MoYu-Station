package com.studyroom.dto;

public class ChatUnreadResponse {
  @com.fasterxml.jackson.databind.annotation.JsonSerialize(using=com.fasterxml.jackson.databind.ser.std.ToStringSerializer.class)
  private Long senderId;
  private String senderName;
  private String senderAvatar;
  private Integer unreadCount;
  private String latestText;
  private String createdAt;

  public Long getSenderId() {
    return senderId;
  }

  public void setSenderId(Long senderId) {
    this.senderId = senderId;
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

  public Integer getUnreadCount() {
    return unreadCount;
  }

  public void setUnreadCount(Integer unreadCount) {
    this.unreadCount = unreadCount;
  }

  public String getLatestText() {
    return latestText;
  }

  public void setLatestText(String latestText) {
    this.latestText = latestText;
  }

  public String getCreatedAt() {
    return createdAt;
  }

  public void setCreatedAt(String createdAt) {
    this.createdAt = createdAt;
  }
}
