package com.studyroom.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;

public class UpdateOwnPasswordRequest {
  @NotBlank(message = "请输入当前密码")
  @Size(max = 128, message = "当前密码不正确")
  private String oldPassword;

  @NotBlank(message = "请输入新密码")
  @Size(max = 128, message = "密码超出输入上限")
  private String newPassword;

  public String getOldPassword() {
    return oldPassword;
  }

  public void setOldPassword(String oldPassword) {
    this.oldPassword = oldPassword;
  }

  public String getNewPassword() {
    return newPassword;
  }

  public void setNewPassword(String newPassword) {
    this.newPassword = newPassword;
  }
}
