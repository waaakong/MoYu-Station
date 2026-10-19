package com.studyroom.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.time.LocalDateTime;

@TableName("sr_focus_record")
public class FocusRecord {
  @TableId
  private Long id;
  private Long userId;
  private String clientRecordId;
  private String sceneCode;
  private String timeKey;
  private Integer plannedMinutes;
  private Integer actualMinutes;
  private Integer actualSeconds;
  private String state;
  private LocalDateTime startedAt;
  private LocalDateTime endedAt;
  private LocalDateTime createdAt;
  private LocalDateTime updatedAt;

  public Long getId() { return id; }
  public void setId(Long id) { this.id = id; }
  public Long getUserId() { return userId; }
  public void setUserId(Long userId) { this.userId = userId; }
  public String getClientRecordId() { return clientRecordId; }
  public void setClientRecordId(String clientRecordId) { this.clientRecordId = clientRecordId; }
  public String getSceneCode() { return sceneCode; }
  public void setSceneCode(String sceneCode) { this.sceneCode = sceneCode; }
  public String getTimeKey() { return timeKey; }
  public void setTimeKey(String timeKey) { this.timeKey = timeKey; }
  public Integer getPlannedMinutes() { return plannedMinutes; }
  public void setPlannedMinutes(Integer plannedMinutes) { this.plannedMinutes = plannedMinutes; }
  public Integer getActualMinutes() { return actualMinutes; }
  public void setActualMinutes(Integer actualMinutes) { this.actualMinutes = actualMinutes; }
  public Integer getActualSeconds() { return actualSeconds; }
  public void setActualSeconds(Integer actualSeconds) { this.actualSeconds = actualSeconds; }
  public String getState() { return state; }
  public void setState(String state) { this.state = state; }
  public LocalDateTime getStartedAt() { return startedAt; }
  public void setStartedAt(LocalDateTime startedAt) { this.startedAt = startedAt; }
  public LocalDateTime getEndedAt() { return endedAt; }
  public void setEndedAt(LocalDateTime endedAt) { this.endedAt = endedAt; }
  public LocalDateTime getCreatedAt() { return createdAt; }
  public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
  public LocalDateTime getUpdatedAt() { return updatedAt; }
  public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
