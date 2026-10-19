package com.studyroom.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.time.LocalDateTime;

@TableName("sr_user")
public class User {
  @TableId
  private Long id;
  private String username;
  private String passwordHash;
  private Integer forcePasswordChange;
  private LocalDateTime passwordChangedAt;
  private String nickname;
  private String avatarUrl;
  private String userType;
  private String onlineStatus;
  private String banReason;
  private Integer level;
  private Integer exp;
  private LocalDateTime lastLoginAt;
  private LocalDateTime lastActiveAt;
  private String loginVersion;
  private LocalDateTime createdAt;
  private LocalDateTime updatedAt;
  private Integer deleted;

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

  public String getPasswordHash() {
    return passwordHash;
  }

  public void setPasswordHash(String passwordHash) {
    this.passwordHash = passwordHash;
  }

  public Integer getForcePasswordChange() {
    return forcePasswordChange;
  }

  public void setForcePasswordChange(Integer forcePasswordChange) {
    this.forcePasswordChange = forcePasswordChange;
  }

  public LocalDateTime getPasswordChangedAt() {
    return passwordChangedAt;
  }

  public void setPasswordChangedAt(LocalDateTime passwordChangedAt) {
    this.passwordChangedAt = passwordChangedAt;
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

  public LocalDateTime getLastLoginAt() {
    return lastLoginAt;
  }

  public void setLastLoginAt(LocalDateTime lastLoginAt) {
    this.lastLoginAt = lastLoginAt;
  }

  public LocalDateTime getLastActiveAt() {
    return lastActiveAt;
  }

  public void setLastActiveAt(LocalDateTime lastActiveAt) {
    this.lastActiveAt = lastActiveAt;
  }

  public String getLoginVersion() {
    return loginVersion;
  }

  public void setLoginVersion(String loginVersion) {
    this.loginVersion = loginVersion;
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

  public Integer getDeleted() {
    return deleted;
  }

  public void setDeleted(Integer deleted) {
    this.deleted = deleted;
  }
}
