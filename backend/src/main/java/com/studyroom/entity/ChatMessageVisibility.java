package com.studyroom.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.time.LocalDateTime;

@TableName("sr_chat_message_visibility")
public class ChatMessageVisibility {
  @TableId
  private Long id;
  private Long messageId;
  private Long userId;
  private LocalDateTime hiddenAt;

  public Long getId() {
    return id;
  }

  public void setId(Long id) {
    this.id = id;
  }

  public Long getMessageId() {
    return messageId;
  }

  public void setMessageId(Long messageId) {
    this.messageId = messageId;
  }

  public Long getUserId() {
    return userId;
  }

  public void setUserId(Long userId) {
    this.userId = userId;
  }

  public LocalDateTime getHiddenAt() {
    return hiddenAt;
  }

  public void setHiddenAt(LocalDateTime hiddenAt) {
    this.hiddenAt = hiddenAt;
  }
}
