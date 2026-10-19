package com.studyroom.dto;

import javax.validation.constraints.NotBlank;

public class UpdateOnlineStatusRequest {
  @NotBlank(message = "请选择在线状态")
  private String onlineStatus;

  public String getOnlineStatus() {
    return onlineStatus;
  }

  public void setOnlineStatus(String onlineStatus) {
    this.onlineStatus = onlineStatus;
  }
}
