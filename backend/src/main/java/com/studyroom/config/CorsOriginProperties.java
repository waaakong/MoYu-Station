package com.studyroom.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;

@Component
@ConfigurationProperties(prefix = "studyroom.cors")
public class CorsOriginProperties {
  private boolean allowAll;
  private boolean productionMode;

  private List<String> allowedOriginPatterns = new ArrayList<>(List.of(
      "https://moyustation.xyz",
      "https://www.moyustation.xyz",
      "https://desktop.moyustation.xyz",
      "http://localhost:[*]",
      "http://127.0.0.1:[*]"
  ));

  public boolean isAllowAll() {
    return allowAll;
  }

  public void setAllowAll(boolean allowAll) {
    this.allowAll = allowAll;
  }

  public boolean isProductionMode() {
    return productionMode;
  }

  public void setProductionMode(boolean productionMode) {
    this.productionMode = productionMode;
  }

  public List<String> getAllowedOriginPatterns() {
    return allowedOriginPatterns;
  }

  public void setAllowedOriginPatterns(List<String> allowedOriginPatterns) {
    this.allowedOriginPatterns = allowedOriginPatterns;
  }

  public String[] resolvedPatterns() {
    validate();
    if (allowAll) {
      return new String[]{"*"};
    }
    return allowedOriginPatterns.stream()
        .map(String::trim)
        .filter(pattern -> !pattern.isEmpty())
        .toArray(String[]::new);
  }

  public boolean isAllowedOrigin(String origin) {
    if (!isSyntacticallyValidOrigin(origin)) return false;
    CorsConfiguration configuration = new CorsConfiguration();
    configuration.setAllowedOriginPatterns(List.of(resolvedPatterns()));
    return configuration.checkOrigin(origin) != null;
  }

  @PostConstruct
  public void validate() {
    if (productionMode && allowAll) {
      throw new IllegalStateException("Production CORS cannot allow every origin");
    }
    List<String> configured = allowedOriginPatterns.stream()
        .map(String::trim)
        .filter(pattern -> !pattern.isEmpty())
        .toList();
    if (!allowAll && configured.isEmpty()) {
      throw new IllegalStateException("At least one CORS origin must be configured");
    }
    if (productionMode && configured.stream().anyMatch(pattern -> pattern.contains("*") || "null".equalsIgnoreCase(pattern))) {
      throw new IllegalStateException("Production CORS origins must be exact and cannot include null");
    }
  }

  private boolean isSyntacticallyValidOrigin(String origin) {
    if (origin == null || origin.isBlank() || "null".equalsIgnoreCase(origin)) return false;
    try {
      URI uri = URI.create(origin);
      return ("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme()))
          && uri.getHost() != null
          && uri.getRawUserInfo() == null
          && (uri.getRawPath() == null || uri.getRawPath().isEmpty())
          && uri.getRawQuery() == null
          && uri.getRawFragment() == null;
    } catch (IllegalArgumentException invalid) {
      return false;
    }
  }
}
