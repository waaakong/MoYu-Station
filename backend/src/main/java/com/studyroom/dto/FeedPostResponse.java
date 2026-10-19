package com.studyroom.dto;

import java.util.ArrayList;
import java.util.List;

public class FeedPostResponse {
  @com.fasterxml.jackson.databind.annotation.JsonSerialize(using=com.fasterxml.jackson.databind.ser.std.ToStringSerializer.class)
  private Long id;
  @com.fasterxml.jackson.databind.annotation.JsonSerialize(using=com.fasterxml.jackson.databind.ser.std.ToStringSerializer.class)
  private Long authorId;
  private String authorName;
  private String authorAvatar;
  private String studyRoomId;
  private String content;
  private String sceneCode;
  private String sceneName;
  private List<String> imageUrls = new ArrayList<>();
  private List<MediaDescriptor> media = new ArrayList<>();
  public List<MediaDescriptor> getMedia() { return media; }
  public void setMedia(List<MediaDescriptor> media) { this.media = media; }
  private Integer likeCount;
  private Integer commentCount;
  private Boolean liked;
  private String createdAt;

  public Long getId() {
    return id;
  }

  public void setId(Long id) {
    this.id = id;
  }

  public Long getAuthorId() {
    return authorId;
  }

  public void setAuthorId(Long authorId) {
    this.authorId = authorId;
  }

  public String getAuthorName() {
    return authorName;
  }

  public void setAuthorName(String authorName) {
    this.authorName = authorName;
  }

  public String getAuthorAvatar() {
    return authorAvatar;
  }

  public void setAuthorAvatar(String authorAvatar) {
    this.authorAvatar = authorAvatar;
  }

  public String getStudyRoomId() {
    return studyRoomId;
  }

  public void setStudyRoomId(String studyRoomId) {
    this.studyRoomId = studyRoomId;
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

  public String getSceneName() {
    return sceneName;
  }

  public void setSceneName(String sceneName) {
    this.sceneName = sceneName;
  }

  public List<String> getImageUrls() {
    return imageUrls;
  }

  public void setImageUrls(List<String> imageUrls) {
    this.imageUrls = imageUrls;
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

  public Boolean getLiked() {
    return liked;
  }

  public void setLiked(Boolean liked) {
    this.liked = liked;
  }

  public String getCreatedAt() {
    return createdAt;
  }

  public void setCreatedAt(String createdAt) {
    this.createdAt = createdAt;
  }
}
