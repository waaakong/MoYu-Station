package com.studyroom.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.time.Duration;

@Component
@ConfigurationProperties(prefix = "studyroom.admin-security")
public class AdminSecurityProperties {
  private Long protectedAdminId;
  private Duration reverificationWindow = Duration.ofMinutes(10);

  public Long getProtectedAdminId() { return protectedAdminId; }
  public void setProtectedAdminId(Long protectedAdminId) { this.protectedAdminId = protectedAdminId; }
  public Duration getReverificationWindow() { return reverificationWindow; }
  public void setReverificationWindow(Duration reverificationWindow) { this.reverificationWindow = reverificationWindow; }

  @PostConstruct
  public void validate() {
    if (protectedAdminId != null && protectedAdminId < 1) throw new IllegalStateException("Protected administrator ID must be positive");
    if (reverificationWindow == null || reverificationWindow.isZero() || reverificationWindow.isNegative()) {
      throw new IllegalStateException("Administrator reverification window must be positive");
    }
  }
}
