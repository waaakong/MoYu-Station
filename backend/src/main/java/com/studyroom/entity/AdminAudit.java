package com.studyroom.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.time.LocalDateTime;

@TableName("sr_admin_audit")
public class AdminAudit {
  @TableId private Long id;
  private Long actorUserId;
  private String actionCode;
  private String targetType;
  private String targetId;
  private String beforeJson;
  private String afterJson;
  private String result;
  private String errorCode;
  private String reason;
  private String ipAddress;
  private String userAgentHash;
  private LocalDateTime createdAt;

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
  public String getBeforeJson() { return beforeJson; }
  public void setBeforeJson(String beforeJson) { this.beforeJson = beforeJson; }
  public String getAfterJson() { return afterJson; }
  public void setAfterJson(String afterJson) { this.afterJson = afterJson; }
  public String getResult() { return result; }
  public void setResult(String result) { this.result = result; }
  public String getErrorCode() { return errorCode; }
  public void setErrorCode(String errorCode) { this.errorCode = errorCode; }
  public String getReason() { return reason; }
  public void setReason(String reason) { this.reason = reason; }
  public String getIpAddress() { return ipAddress; }
  public void setIpAddress(String ipAddress) { this.ipAddress = ipAddress; }
  public String getUserAgentHash() { return userAgentHash; }
  public void setUserAgentHash(String userAgentHash) { this.userAgentHash = userAgentHash; }
  public LocalDateTime getCreatedAt() { return createdAt; }
  public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
