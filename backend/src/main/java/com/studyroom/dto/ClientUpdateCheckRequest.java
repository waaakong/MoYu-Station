package com.studyroom.dto;

import javax.validation.constraints.NotBlank;

public class ClientUpdateCheckRequest {
  @NotBlank private String currentVersion;
  @NotBlank private String channel;
  @NotBlank private String platform;
  @NotBlank private String arch;

  public String getCurrentVersion() { return currentVersion; }
  public void setCurrentVersion(String currentVersion) { this.currentVersion = currentVersion; }
  public String getChannel() { return channel; }
  public void setChannel(String channel) { this.channel = channel; }
  public String getPlatform() { return platform; }
  public void setPlatform(String platform) { this.platform = platform; }
  public String getArch() { return arch; }
  public void setArch(String arch) { this.arch = arch; }
}
