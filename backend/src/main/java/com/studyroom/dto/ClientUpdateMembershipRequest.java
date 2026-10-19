package com.studyroom.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;

public class ClientUpdateMembershipRequest extends AdminVersionRequest {
  @NotBlank private String channel;
  @NotNull private Boolean enabled;
  @NotBlank @Size(max = 300) private String reason;

  public String getChannel() { return channel; }
  public void setChannel(String channel) { this.channel = channel; }
  public Boolean getEnabled() { return enabled; }
  public void setEnabled(Boolean enabled) { this.enabled = enabled; }
  public String getReason() { return reason; }
  public void setReason(String reason) { this.reason = reason; }
}
