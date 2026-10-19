package com.studyroom.dto;

public class UserProfileResponse {
  @com.fasterxml.jackson.databind.annotation.JsonSerialize(using=com.fasterxml.jackson.databind.ser.std.ToStringSerializer.class)
  private Long id;
  private String username;
  private String nickname;
  private String avatarUrl;
  private String userType;
  private String onlineStatus;
  private String banReason;
  private Integer level;
  private Integer exp;
  private Integer currentLevelExp;
  private Integer nextLevelExp;
  private Integer levelProgress;
  private String createdAt;
  private String privacy;
  private boolean passwordChangeRequired;

  public Long getId() {
    return id;
  }

  public void setId(Long id) {
    this.id = id;
  }

  public String getUsername() {
    return username;
  }

  public void setUsername(String username) {
    this.username = username;
  }

  public String getNickname() {
    return nickname;
  }

  public void setNickname(String nickname) {
    this.nickname = nickname;
  }

  public String getAvatarUrl() {
    return avatarUrl;
  }

  public void setAvatarUrl(String avatarUrl) {
    this.avatarUrl = avatarUrl;
  }

  public String getUserType() {
    return userType;
  }

  public void setUserType(String userType) {
    this.userType = userType;
  }

  public String getOnlineStatus() {
    return onlineStatus;
  }

  public void setOnlineStatus(String onlineStatus) {
    this.onlineStatus = onlineStatus;
  }

  public String getBanReason() {
    return banReason;
  }

  public void setBanReason(String banReason) {
    this.banReason = banReason;
  }

  public Integer getLevel() {
    return level;
  }

  public void setLevel(Integer level) {
    this.level = level;
  }

  public Integer getExp() {
    return exp;
  }

  public void setExp(Integer exp) {
    this.exp = exp;
  }

  public Integer getNextLevelExp() {
    return nextLevelExp;
  }

  public Integer getCurrentLevelExp() {
    return currentLevelExp;
  }

  public void setCurrentLevelExp(Integer currentLevelExp) {
    this.currentLevelExp = currentLevelExp;
  }

  public void setNextLevelExp(Integer nextLevelExp) {
    this.nextLevelExp = nextLevelExp;
  }

  public Integer getLevelProgress() {
    return levelProgress;
  }

  public void setLevelProgress(Integer levelProgress) {
    this.levelProgress = levelProgress;
  }

  public String getCreatedAt() {
    return createdAt;
  }

  public void setCreatedAt(String createdAt) {
    this.createdAt = createdAt;
  }

  public String getPrivacy() {
    return privacy;
  }

  public void setPrivacy(String privacy) {
    this.privacy = privacy;
  }

  public boolean isPasswordChangeRequired() {
    return passwordChangeRequired;
  }

  public void setPasswordChangeRequired(boolean passwordChangeRequired) {
    this.passwordChangeRequired = passwordChangeRequired;
  }
}
