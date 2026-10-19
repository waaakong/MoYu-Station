package com.studyroom.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.LocalDateTime;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class InvitationResponse {
  @com.fasterxml.jackson.databind.annotation.JsonSerialize(using=com.fasterxml.jackson.databind.ser.std.ToStringSerializer.class)
  private Long id;
  private String label;
  private String code;
  private String codeHint;
  private String status;
  private Integer maxUses;
  private Integer usedCount;
  private LocalDateTime expiresAt;
  @com.fasterxml.jackson.databind.annotation.JsonSerialize(using=com.fasterxml.jackson.databind.ser.std.ToStringSerializer.class)
  private Long createdBy;
  @com.fasterxml.jackson.databind.annotation.JsonSerialize(using=com.fasterxml.jackson.databind.ser.std.ToStringSerializer.class)
  private Long disabledBy;
  private LocalDateTime disabledAt;
  private LocalDateTime createdAt;

  public Long getId() { return id; }
  public void setId(Long id) { this.id = id; }
  public String getLabel() { return label; }
  public void setLabel(String label) { this.label = label; }
  public String getCode() { return code; }
  public void setCode(String code) { this.code = code; }
  public String getCodeHint() { return codeHint; }
  public void setCodeHint(String codeHint) { this.codeHint = codeHint; }
  public String getStatus() { return status; }
  public void setStatus(String status) { this.status = status; }
  public Integer getMaxUses() { return maxUses; }
  public void setMaxUses(Integer maxUses) { this.maxUses = maxUses; }
  public Integer getUsedCount() { return usedCount; }
  public void setUsedCount(Integer usedCount) { this.usedCount = usedCount; }
  public LocalDateTime getExpiresAt() { return expiresAt; }
  public void setExpiresAt(LocalDateTime expiresAt) { this.expiresAt = expiresAt; }
  public Long getCreatedBy() { return createdBy; }
  public void setCreatedBy(Long createdBy) { this.createdBy = createdBy; }
  public Long getDisabledBy() { return disabledBy; }
  public void setDisabledBy(Long disabledBy) { this.disabledBy = disabledBy; }
  public LocalDateTime getDisabledAt() { return disabledAt; }
  public void setDisabledAt(LocalDateTime disabledAt) { this.disabledAt = disabledAt; }
  public LocalDateTime getCreatedAt() { return createdAt; }
  public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
