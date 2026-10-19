package com.studyroom.dto;

import javax.validation.constraints.NotBlank;

public class UpdateFeedbackStatusRequest extends AdminVersionRequest {
  @NotBlank(message = "请选择反馈状态")
  private String status;

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }
}

