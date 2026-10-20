package com.studyroom.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.nio.file.Path;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

@Component
@ConfigurationProperties(prefix = "studyroom.client-updates")
public class ClientUpdateProperties {
  private boolean enabled = false;
  public enum Audience { MEMBERS, REGISTERED }
  private Audience audience = Audience.MEMBERS;
  // Public Release assets bypass login-only file access. Explicit deployment opt-in only.
  private boolean githubDownloadsEnabled = false;
  private String githubRepository = "";
  // Requires the separately approved V13 migration; does not enable update distribution.
  private boolean versionedPolicyEnabled = false;
  private String baseUrl = "https://moyustation.xyz/private-updates";
  private Path storageRoot = Path.of("/srv/studyroom-updates/releases");
  private Duration grantTtl = Duration.ofMinutes(10);
  private String importSecret = "";
  private Map<String, String> manifestPublicKeys = new LinkedHashMap<>();

  public boolean isEnabled() { return enabled; }
  public Audience getAudience() { return audience; }
  public void setAudience(Audience value) {
    if (value == null) throw new IllegalArgumentException("Update audience is required");
    audience = value;
  }
  public boolean isGithubDownloadsEnabled() { return githubDownloadsEnabled; }
  public void setGithubDownloadsEnabled(boolean value) { githubDownloadsEnabled = value; }
  public String getGithubRepository() { return githubRepository; }
  public void setGithubRepository(String value) { githubRepository = value; }
  public boolean isVersionedPolicyEnabled() { return versionedPolicyEnabled; }
  public void setVersionedPolicyEnabled(boolean value) { versionedPolicyEnabled = value; }
  public void setEnabled(boolean enabled) { this.enabled = enabled; }
  public String getBaseUrl() { return baseUrl; }
  public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }
  public Path getStorageRoot() { return storageRoot; }
  public void setStorageRoot(Path storageRoot) { this.storageRoot = storageRoot; }
  public Duration getGrantTtl() { return grantTtl; }
  public void setGrantTtl(Duration grantTtl) { this.grantTtl = grantTtl; }
  public String getImportSecret() { return importSecret; }
  public void setImportSecret(String importSecret) { this.importSecret = importSecret; }
  public Map<String, String> getManifestPublicKeys() { return manifestPublicKeys; }
  public void setManifestPublicKeys(Map<String, String> manifestPublicKeys) { this.manifestPublicKeys = manifestPublicKeys; }
}
