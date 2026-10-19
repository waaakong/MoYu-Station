package com.studyroom.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;

public class UpdatePasswordRequest extends AdminVersionRequest {
  @NotBlank(message = "\u8bf7\u8f93\u5165\u65b0\u5bc6\u7801")
  @Size(max = 128, message = "密码超出输入上限")
  private String password;

  public String getPassword() {
    return password;
  }

  public void setPassword(String password) {
    this.password = password;
  }
}
