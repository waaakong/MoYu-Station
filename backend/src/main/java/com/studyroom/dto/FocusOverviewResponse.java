package com.studyroom.dto;

import java.util.List;

public class FocusOverviewResponse {
  private Integer todayFocusMinutes;
  private Integer level;
  private Integer exp;
  private Integer nextLevelExp;
  private Integer levelProgress;
  private FocusCheckinResponse todayCheckin;
  private List<UserAudioResponse> userAudio;

  public Integer getTodayFocusMinutes() { return todayFocusMinutes; }
  public void setTodayFocusMinutes(Integer todayFocusMinutes) { this.todayFocusMinutes = todayFocusMinutes; }
  public Integer getLevel() { return level; }
  public void setLevel(Integer level) { this.level = level; }
  public Integer getExp() { return exp; }
  public void setExp(Integer exp) { this.exp = exp; }
  public Integer getNextLevelExp() { return nextLevelExp; }
  public void setNextLevelExp(Integer nextLevelExp) { this.nextLevelExp = nextLevelExp; }
  public Integer getLevelProgress() { return levelProgress; }
  public void setLevelProgress(Integer levelProgress) { this.levelProgress = levelProgress; }
  public FocusCheckinResponse getTodayCheckin() { return todayCheckin; }
  public void setTodayCheckin(FocusCheckinResponse todayCheckin) { this.todayCheckin = todayCheckin; }
  public List<UserAudioResponse> getUserAudio() { return userAudio; }
  public void setUserAudio(List<UserAudioResponse> userAudio) { this.userAudio = userAudio; }
}
