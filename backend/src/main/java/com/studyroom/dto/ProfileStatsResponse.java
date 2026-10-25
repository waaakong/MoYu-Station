package com.studyroom.dto;

import java.math.BigDecimal;

public class ProfileStatsResponse {
  private String fishTimingBasis;
  public String getFishTimingBasis(){return fishTimingBasis;}
  public void setFishTimingBasis(String value){fishTimingBasis=value;}
  private String coverage;
  public String getCoverage(){return coverage;}
  public void setCoverage(String value){coverage=value;}
  private Integer todayFocusMinutes;
  private Integer streakDays;
  private String favoriteScene;
  private BigDecimal totalFocusHours;
  private BigDecimal fakeEffortIndex;
  private Integer fishMinutes;
  private Integer onlineMinutes;

  public Integer getTodayFocusMinutes() {
    return todayFocusMinutes;
  }

  public void setTodayFocusMinutes(Integer todayFocusMinutes) {
    this.todayFocusMinutes = todayFocusMinutes;
  }

  public Integer getStreakDays() {
    return streakDays;
  }

  public void setStreakDays(Integer streakDays) {
    this.streakDays = streakDays;
  }

  public String getFavoriteScene() {
    return favoriteScene;
  }

  public void setFavoriteScene(String favoriteScene) {
    this.favoriteScene = favoriteScene;
  }

  public BigDecimal getTotalFocusHours() {
    return totalFocusHours;
  }

  public void setTotalFocusHours(BigDecimal totalFocusHours) {
    this.totalFocusHours = totalFocusHours;
  }

  public BigDecimal getFakeEffortIndex() {
    return fakeEffortIndex;
  }

  public void setFakeEffortIndex(BigDecimal fakeEffortIndex) {
    this.fakeEffortIndex = fakeEffortIndex;
  }

  public Integer getFishMinutes() {
    return fishMinutes;
  }

  public void setFishMinutes(Integer fishMinutes) {
    this.fishMinutes = fishMinutes;
  }

  public Integer getOnlineMinutes() {
    return onlineMinutes;
  }

  public void setOnlineMinutes(Integer onlineMinutes) {
    this.onlineMinutes = onlineMinutes;
  }
}

