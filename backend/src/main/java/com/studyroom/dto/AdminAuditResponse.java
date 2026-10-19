package com.studyroom.dto;

public class AdminAuditResponse {
  @com.fasterxml.jackson.databind.annotation.JsonSerialize(using=com.fasterxml.jackson.databind.ser.std.ToStringSerializer.class)
  private Long id;
  @com.fasterxml.jackson.databind.annotation.JsonSerialize(using=com.fasterxml.jackson.databind.ser.std.ToStringSerializer.class)
  private Long actorUserId;
  private String actionCode;
  private String targetType;
  private String targetId;
  private String result;
  private String errorCode;
  private String reason;
  private String createdAt;

  public Long getId() { return id; }
  public void setId(Long id) { this.id = id; }
  public Long getActorUserId() { return actorUserId; }
  public void setActorUserId(Long actorUserId) { this.actorUserId = actorUserId; }
  public String getActionCode() { return actionCode; }
  public void setActionCode(String actionCode) { this.actionCode = actionCode; }
  public String getTargetType() { return targetType; }
  public void setTargetType(String targetType) { this.targetType = targetType; }
  public String getTargetId() { return targetId; }
  public void setTargetId(String targetId) { this.targetId = targetId; }
  public String getResult() { return result; }
  public void setResult(String result) { this.result = result; }
  public String getErrorCode() { return errorCode; }
  public void setErrorCode(String errorCode) { this.errorCode = errorCode; }
  public String getReason() { return reason; }
  public void setReason(String reason) { this.reason = reason; }
  public String getCreatedAt() { return createdAt; }
  public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
}
