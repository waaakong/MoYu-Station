package com.studyroom.dto;

public class FocusRecordResponse {
  @com.fasterxml.jackson.databind.annotation.JsonSerialize(using=com.fasterxml.jackson.databind.ser.std.ToStringSerializer.class)
  private Long id;
  private String sceneCode;
  private String timeKey;
  private Integer plannedMinutes;
  private Integer actualMinutes;
  private String state;
  private String startedAt;
  private String endedAt;

  public Long getId() { return id; }
  public void setId(Long id) { this.id = id; }
  public String getSceneCode() { return sceneCode; }
  public void setSceneCode(String sceneCode) { this.sceneCode = sceneCode; }
  public String getTimeKey() { return timeKey; }
  public void setTimeKey(String timeKey) { this.timeKey = timeKey; }
  public Integer getPlannedMinutes() { return plannedMinutes; }
  public void setPlannedMinutes(Integer plannedMinutes) { this.plannedMinutes = plannedMinutes; }
  public Integer getActualMinutes() { return actualMinutes; }
  public void setActualMinutes(Integer actualMinutes) { this.actualMinutes = actualMinutes; }
  public String getState() { return state; }
  public void setState(String state) { this.state = state; }
  public String getStartedAt() { return startedAt; }
  public void setStartedAt(String startedAt) { this.startedAt = startedAt; }
  public String getEndedAt() { return endedAt; }
  public void setEndedAt(String endedAt) { this.endedAt = endedAt; }
}
