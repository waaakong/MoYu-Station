package com.studyroom.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;

public class AdminReverifyRequest {
  @NotBlank
  @Size(max = 64)
  private String password;

  public String getPassword() { return password; }
  public void setPassword(String password) { this.password = password; }
}
