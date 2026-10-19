package com.studyroom.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.time.LocalDateTime;

@TableName("sr_private_conversation")
public class PrivateConversation {
  @TableId
  private Long id;
  private Long userAId;
  private Long userBId;
  private LocalDateTime lastMessageAt;
  private LocalDateTime createdAt;
  private LocalDateTime updatedAt;

  public Long getId() {
    return id;
  }

  public void setId(Long id) {
    this.id = id;
  }

  public Long getUserAId() {
    return userAId;
  }

  public void setUserAId(Long userAId) {
    this.userAId = userAId;
  }

  public Long getUserBId() {
    return userBId;
  }

  public void setUserBId(Long userBId) {
    this.userBId = userBId;
  }

  public LocalDateTime getLastMessageAt() {
    return lastMessageAt;
  }

  public void setLastMessageAt(LocalDateTime lastMessageAt) {
    this.lastMessageAt = lastMessageAt;
  }

  public LocalDateTime getCreatedAt() {
    return createdAt;
  }

  public void setCreatedAt(LocalDateTime createdAt) {
    this.createdAt = createdAt;
  }

  public LocalDateTime getUpdatedAt() {
    return updatedAt;
  }

  public void setUpdatedAt(LocalDateTime updatedAt) {
    this.updatedAt = updatedAt;
  }
}
