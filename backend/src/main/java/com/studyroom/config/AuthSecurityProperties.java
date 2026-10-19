package com.studyroom.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.time.Duration;

@Component
@ConfigurationProperties(prefix = "studyroom.auth-security")
public class AuthSecurityProperties {
  private Duration webSessionIdle = Duration.ofHours(12);
  private Duration desktopSessionLifetime = Duration.ofDays(30);
  private Duration desktopCookieRefresh = Duration.ofHours(24);
  private String desktopOrigin = "https://desktop.moyustation.xyz";
  private String desktopHeaderName = "X-StudyRoom-Client";
  private String desktopHeaderValue = "desktop-v1";
  private boolean secureCookie;
  private boolean productionMode;
  private boolean concurrentSessions;
  private int localFallbackCapacity = 4096;
  private final Limit login = new Limit(10, 5, Duration.ofMinutes(5));
  private final Limit registration = new Limit(5, 3, Duration.ofMinutes(30));

  public Duration getWebSessionIdle() {
    return webSessionIdle;
  }

  public boolean isConcurrentSessions() { return concurrentSessions; }
  public void setConcurrentSessions(boolean concurrentSessions) { this.concurrentSessions = concurrentSessions; }

  public void setWebSessionIdle(Duration webSessionIdle) {
    this.webSessionIdle = webSessionIdle;
  }

  public Duration getDesktopSessionLifetime() {
    return desktopSessionLifetime;
  }

  public void setDesktopSessionLifetime(Duration desktopSessionLifetime) {
    this.desktopSessionLifetime = desktopSessionLifetime;
  }

  public Duration getDesktopCookieRefresh() {
    return desktopCookieRefresh;
  }

  public void setDesktopCookieRefresh(Duration desktopCookieRefresh) {
    this.desktopCookieRefresh = desktopCookieRefresh;
  }

  public String getDesktopOrigin() {
    return desktopOrigin;
  }

  public void setDesktopOrigin(String desktopOrigin) {
    this.desktopOrigin = desktopOrigin;
  }

  public String getDesktopHeaderName() {
    return desktopHeaderName;
  }

  public void setDesktopHeaderName(String desktopHeaderName) {
    this.desktopHeaderName = desktopHeaderName;
  }

  public String getDesktopHeaderValue() {
    return desktopHeaderValue;
  }

  public void setDesktopHeaderValue(String desktopHeaderValue) {
    this.desktopHeaderValue = desktopHeaderValue;
  }

  public boolean isSecureCookie() {
    return secureCookie;
  }

  public void setSecureCookie(boolean secureCookie) {
    this.secureCookie = secureCookie;
  }

  public boolean isProductionMode() {
    return productionMode;
  }

  public void setProductionMode(boolean productionMode) {
    this.productionMode = productionMode;
  }

  public int getLocalFallbackCapacity() {
    return localFallbackCapacity;
  }

  public void setLocalFallbackCapacity(int localFallbackCapacity) {
    this.localFallbackCapacity = localFallbackCapacity;
  }

  public Limit getLogin() {
    return login;
  }

  public Limit getRegistration() {
    return registration;
  }

  @PostConstruct
  public void validate() {
    if (productionMode && !secureCookie) {
      throw new IllegalStateException("Production session cookies must be Secure");
    }
    if (webSessionIdle.isZero() || webSessionIdle.isNegative()
        || desktopSessionLifetime.isZero() || desktopSessionLifetime.isNegative()
        || desktopCookieRefresh.isZero() || desktopCookieRefresh.isNegative()
        || desktopCookieRefresh.compareTo(desktopSessionLifetime) >= 0) {
      throw new IllegalStateException("Invalid session lifetime configuration");
    }
    if (localFallbackCapacity < 1) throw new IllegalStateException("Local auth rate limit capacity must be positive");
    validateLimit(login);
    validateLimit(registration);
  }

  private void validateLimit(Limit limit) {
    if (limit.maximumAttempts < 1 || limit.fallbackMaximumAttempts < 1
        || limit.fallbackMaximumAttempts > limit.maximumAttempts
        || limit.window == null || limit.window.isZero() || limit.window.isNegative()) {
      throw new IllegalStateException("Invalid auth rate limit configuration");
    }
  }

  public static class Limit {
    private int maximumAttempts;
    private int fallbackMaximumAttempts;
    private Duration window;

    public Limit() {
    }

    public Limit(int maximumAttempts, int fallbackMaximumAttempts, Duration window) {
      this.maximumAttempts = maximumAttempts;
      this.fallbackMaximumAttempts = fallbackMaximumAttempts;
      this.window = window;
    }

    public int getMaximumAttempts() {
      return maximumAttempts;
    }

    public void setMaximumAttempts(int maximumAttempts) {
      this.maximumAttempts = maximumAttempts;
    }

    public int getFallbackMaximumAttempts() {
      return fallbackMaximumAttempts;
    }

    public void setFallbackMaximumAttempts(int fallbackMaximumAttempts) {
      this.fallbackMaximumAttempts = fallbackMaximumAttempts;
    }

    public Duration getWindow() {
      return window;
    }

    public void setWindow(Duration window) {
      this.window = window;
    }
  }
}
