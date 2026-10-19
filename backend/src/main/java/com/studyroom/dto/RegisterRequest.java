package com.studyroom.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Pattern;
import javax.validation.constraints.Size;

public class RegisterRequest {
  @NotBlank(message = "请输入用户名")
  @Pattern(regexp = "^[A-Za-z0-9_-]{2,32}$", message = "用户名只能包含英文、数字、下划线或短横线，长度 2-32 位")
  private String username;

  @NotBlank(message = "请输入密码")
  // Transport bound only; PasswordService enforces code points and UTF-8 bytes.
  @Size(max = 128, message = "密码超出输入上限")
  private String password;

  private String nickname;

  @NotBlank(message = "请输入邀请码")
  @Size(max = 128, message = "邀请码无效")
  private String invitationCode;

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

  public String getNickname() {
    return nickname;
  }

  public void setNickname(String nickname) {
    this.nickname = nickname;
  }

  public String getInvitationCode() {
    return invitationCode;
  }

  public void setInvitationCode(String invitationCode) {
    this.invitationCode = invitationCode;
  }
}
