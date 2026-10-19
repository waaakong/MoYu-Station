package com.studyroom.dto;

import javax.validation.constraints.Max;
import javax.validation.constraints.Min;
import javax.validation.constraints.NotBlank;

public class StartFocusRequest {
  @NotBlank
  private String sceneCode;
  @NotBlank
  private String timeKey;
  @Min(1)
  @Max(180)
  private Integer plannedMinutes;

  public String getSceneCode() { return sceneCode; }
  public void setSceneCode(String sceneCode) { this.sceneCode = sceneCode; }
  public String getTimeKey() { return timeKey; }
  public void setTimeKey(String timeKey) { this.timeKey = timeKey; }
  public Integer getPlannedMinutes() { return plannedMinutes; }
  public void setPlannedMinutes(Integer plannedMinutes) { this.plannedMinutes = plannedMinutes; }
}
