package com.studyroom.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Pattern;
import javax.validation.constraints.Size;

public class LoginRequest {
  @NotBlank(message = "请输入用户名")
  @Pattern(regexp = "^[A-Za-z0-9_-]{2,32}$", message = "用户名只能包含英文、数字、下划线或短横线，长度 2-32 位")
  private String username;

  @NotBlank(message = "请输入密码")
  @Size(max = 128, message = "用户名或密码不正确")
  private String password;

  private boolean rememberMe;

  public String getUsername() {
    return username;
  }

  public void setUsername(String username) {
    this.username = username;
  }

  public String getPassword() {
    return password;
  }

  public void setPassword(String password) {
    this.password = password;
  }

  public boolean isRememberMe() {
    return rememberMe;
  }

  public void setRememberMe(boolean rememberMe) {
    this.rememberMe = rememberMe;
  }
}
