package com.studyroom.dto;

import javax.validation.constraints.NotBlank;

public class UpdateUserTypeRequest extends AdminVersionRequest {
  @NotBlank(message = "请选择用户类型")
  private String userType;

  public String getUserType() {
    return userType;
  }

  public void setUserType(String userType) {
    this.userType = userType;
  }
}

