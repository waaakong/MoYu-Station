package com.studyroom.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;

public class UpdateNicknameRequest {
  @NotBlank(message = "请输入昵称")
  @Size(min = 2, max = 20, message = "昵称长度需要在 2 到 20 个字符之间")
  private String nickname;

  public String getNickname() {
    return nickname;
  }

  public void setNickname(String nickname) {
    this.nickname = nickname;
  }
}
