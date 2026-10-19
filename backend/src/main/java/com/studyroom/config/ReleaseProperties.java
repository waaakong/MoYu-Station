package com.studyroom.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "studyroom.release")
public class ReleaseProperties {
  private String id = "development";
  private String gitSha = "unknown";
  private String builtAt = "unknown";

  public String getId() { return id; }
  public void setId(String id) { this.id = id; }
  public String getGitSha() { return gitSha; }
  public void setGitSha(String gitSha) { this.gitSha = gitSha; }
  public String getBuiltAt() { return builtAt; }
  public void setBuiltAt(String builtAt) { this.builtAt = builtAt; }
}
