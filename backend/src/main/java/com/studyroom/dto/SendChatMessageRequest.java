package com.studyroom.dto;

import javax.validation.constraints.Size;

public class SendChatMessageRequest {
  private Long receiverId;
  @Size(max = 64, message = "客户端消息 ID 不能超过 64 个字符")
  private String clientMessageId;
  private String messageType;
  @Size(max = 1000, message = "消息内容不能超过 1000 个字符")
  private String content;
  private String mediaUrl;

  public Long getReceiverId() {
    return receiverId;
  }

  public void setReceiverId(Long receiverId) {
    this.receiverId = receiverId;
  }

  public String getClientMessageId() {
    return clientMessageId;
  }

  public void setClientMessageId(String clientMessageId) {
    this.clientMessageId = clientMessageId;
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
}
