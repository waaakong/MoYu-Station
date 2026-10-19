package com.studyroom.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.time.LocalDateTime;

@TableName("sr_post")
public class Post {
  @TableId
  private Long id;
  private Long userId;
  private String clientRequestId;
  private String content;
  private String sceneCode;
  private String imageUrlsJson;
  private Integer likeCount;
  private Integer commentCount;
  private Integer deletedByUser;
  private Integer deletedByAdmin;
  private String deleteReason;
  private LocalDateTime createdAt;
  private LocalDateTime updatedAt;

  public Long getId() {
    return id;
  }

  public void setId(Long id) {
    this.id = id;
  }

  public Long getUserId() {
    return userId;
  }

  public void setUserId(Long userId) {
    this.userId = userId;
  }

  public String getClientRequestId() {
    return clientRequestId;
  }

  public void setClientRequestId(String clientRequestId) {
    this.clientRequestId = clientRequestId;
  }

  public String getContent() {
    return content;
  }

  public void setContent(String content) {
    this.content = content;
  }

  public String getSceneCode() {
    return sceneCode;
  }

  public void setSceneCode(String sceneCode) {
    this.sceneCode = sceneCode;
  }

  public String getImageUrlsJson() {
    return imageUrlsJson;
  }

  public void setImageUrlsJson(String imageUrlsJson) {
    this.imageUrlsJson = imageUrlsJson;
  }

  public Integer getLikeCount() {
    return likeCount;
  }

  public void setLikeCount(Integer likeCount) {
    this.likeCount = likeCount;
  }

  public Integer getCommentCount() {
    return commentCount;
  }

  public void setCommentCount(Integer commentCount) {
    this.commentCount = commentCount;
  }

  public Integer getDeletedByUser() {
    return deletedByUser;
  }

  public void setDeletedByUser(Integer deletedByUser) {
    this.deletedByUser = deletedByUser;
  }

  public Integer getDeletedByAdmin() {
    return deletedByAdmin;
  }

  public void setDeletedByAdmin(Integer deletedByAdmin) {
    this.deletedByAdmin = deletedByAdmin;
  }

  public String getDeleteReason() {
    return deleteReason;
  }

  public void setDeleteReason(String deleteReason) {
    this.deleteReason = deleteReason;
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
