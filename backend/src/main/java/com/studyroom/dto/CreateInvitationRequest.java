package com.studyroom.dto;

import javax.validation.constraints.Max;
import javax.validation.constraints.Min;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;
import java.time.LocalDateTime;

public class CreateInvitationRequest extends ReliableCreateRequest {
  @NotBlank(message = "请输入邀请码用途")
  @Size(max = 100, message = "邀请码用途不能超过 100 个字符")
  private String label;

  @Min(value = 1, message = "邀请码至少允许使用 1 次")
  @Max(value = 100, message = "邀请码最多允许使用 100 次")
  private Integer maxUses = 1;

  private LocalDateTime expiresAt;

  public String getLabel() { return label; }
  public void setLabel(String label) { this.label = label; }
  public Integer getMaxUses() { return maxUses; }
  public void setMaxUses(Integer maxUses) { this.maxUses = maxUses; }
  public LocalDateTime getExpiresAt() { return expiresAt; }
  public void setExpiresAt(LocalDateTime expiresAt) { this.expiresAt = expiresAt; }
}
