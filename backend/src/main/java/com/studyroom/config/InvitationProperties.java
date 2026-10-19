package com.studyroom.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "studyroom.invitation")
public class InvitationProperties {
  private String pepper = "";
  private int codeBytes = 16;
  private int maximumUses = 100;

  public String getPepper() {
    return pepper;
  }

  public void setPepper(String pepper) {
    this.pepper = pepper;
  }

  public int getCodeBytes() {
    return codeBytes;
  }

  public void setCodeBytes(int codeBytes) {
    this.codeBytes = codeBytes;
  }

  public int getMaximumUses() {
    return maximumUses;
  }

  public void setMaximumUses(int maximumUses) {
    this.maximumUses = maximumUses;
  }
}
