package com.studyroom.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@TableName("sr_daily_stat")
public class DailyStat {
  @TableId
  private Long id;
  private Long userId;
  private LocalDate statDate;
  private Integer focusMinutes;
  private Integer slackMinutes;
  private Integer onlineMinutes;
  private BigDecimal fakeEffortIndex;
  private String favoriteSceneCode;
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

  public LocalDate getStatDate() {
    return statDate;
  }

  public void setStatDate(LocalDate statDate) {
    this.statDate = statDate;
  }

  public Integer getFocusMinutes() {
    return focusMinutes;
  }

  public void setFocusMinutes(Integer focusMinutes) {
    this.focusMinutes = focusMinutes;
  }

  public Integer getSlackMinutes() {
    return slackMinutes;
  }

  public void setSlackMinutes(Integer slackMinutes) {
    this.slackMinutes = slackMinutes;
  }

  public Integer getOnlineMinutes() {
    return onlineMinutes;
  }

  public void setOnlineMinutes(Integer onlineMinutes) {
    this.onlineMinutes = onlineMinutes;
  }

  public BigDecimal getFakeEffortIndex() {
    return fakeEffortIndex;
  }

  public void setFakeEffortIndex(BigDecimal fakeEffortIndex) {
    this.fakeEffortIndex = fakeEffortIndex;
  }

  public String getFavoriteSceneCode() {
    return favoriteSceneCode;
  }

  public void setFavoriteSceneCode(String favoriteSceneCode) {
    this.favoriteSceneCode = favoriteSceneCode;
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

