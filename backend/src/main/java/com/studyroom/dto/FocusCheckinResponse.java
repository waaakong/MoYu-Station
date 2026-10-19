package com.studyroom.dto;

public class FocusCheckinResponse {
  private Boolean checkedIn;
  private String date;
  private String drawType;
  private String title;
  private String explanation;
  private Integer expAdded;
  private Integer level;
  private Integer exp;
  private Integer nextLevelExp;
  private Integer levelProgress;

  public Boolean getCheckedIn() { return checkedIn; }
  public void setCheckedIn(Boolean checkedIn) { this.checkedIn = checkedIn; }
  public String getDate() { return date; }
  public void setDate(String date) { this.date = date; }
  public String getDrawType() { return drawType; }
  public void setDrawType(String drawType) { this.drawType = drawType; }
  public String getTitle() { return title; }
  public void setTitle(String title) { this.title = title; }
  public String getExplanation() { return explanation; }
  public void setExplanation(String explanation) { this.explanation = explanation; }
  public Integer getExpAdded() { return expAdded; }
  public void setExpAdded(Integer expAdded) { this.expAdded = expAdded; }
  public Integer getLevel() { return level; }
  public void setLevel(Integer level) { this.level = level; }
  public Integer getExp() { return exp; }
  public void setExp(Integer exp) { this.exp = exp; }
  public Integer getNextLevelExp() { return nextLevelExp; }
  public void setNextLevelExp(Integer nextLevelExp) { this.nextLevelExp = nextLevelExp; }
  public Integer getLevelProgress() { return levelProgress; }
  public void setLevelProgress(Integer levelProgress) { this.levelProgress = levelProgress; }
}
