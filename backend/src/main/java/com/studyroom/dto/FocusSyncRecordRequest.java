package com.studyroom.dto;

import javax.validation.constraints.Max;
import javax.validation.constraints.Min;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Pattern;
import javax.validation.constraints.Size;
import java.time.Instant;

public class FocusSyncRecordRequest {
  @Pattern(regexp="[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
  private String activitySessionId;
  public String getActivitySessionId(){return activitySessionId;}
  public void setActivitySessionId(String value){activitySessionId=value;}
  @NotBlank
  @Pattern(regexp = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
  private String clientRecordId;
  @NotBlank @Size(max = 64)
  private String sceneCode;
  @NotBlank @Size(max = 24)
  private String timeKey;
  @NotNull @Min(1) @Max(180)
  private Integer plannedMinutes;
  @NotNull @Min(1) @Max(10800)
  private Integer actualSeconds;
  @NotNull
  private Instant startedAt;
  @NotNull
  private Instant endedAt;

  public String getClientRecordId() { return clientRecordId; }
  public void setClientRecordId(String clientRecordId) { this.clientRecordId = clientRecordId; }
  public String getSceneCode() { return sceneCode; }
  public void setSceneCode(String sceneCode) { this.sceneCode = sceneCode; }
  public String getTimeKey() { return timeKey; }
  public void setTimeKey(String timeKey) { this.timeKey = timeKey; }
  public Integer getPlannedMinutes() { return plannedMinutes; }
  public void setPlannedMinutes(Integer plannedMinutes) { this.plannedMinutes = plannedMinutes; }
  public Integer getActualSeconds() { return actualSeconds; }
  public void setActualSeconds(Integer actualSeconds) { this.actualSeconds = actualSeconds; }
  public Instant getStartedAt() { return startedAt; }
  public void setStartedAt(Instant startedAt) { this.startedAt = startedAt; }
  public Instant getEndedAt() { return endedAt; }
  public void setEndedAt(Instant endedAt) { this.endedAt = endedAt; }
}
