package com.studyroom.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyroom.config.ClientUpdateProperties;
import com.studyroom.dto.ClientUpdateCheckRequest;
import com.studyroom.entity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ClientUpdateServiceTest {
  private JdbcTemplate jdbcTemplate;
  private ClientUpdateProperties properties;
  private ClientUpdateService service;

  @BeforeEach
  void setUp() {
    jdbcTemplate = mock(JdbcTemplate.class);
    properties = new ClientUpdateProperties();
    service = new ClientUpdateService(
        jdbcTemplate,
        mock(StringRedisTemplate.class),
        new ObjectMapper(),
        properties,
        mock(ClientUpdateSocketHub.class)
    );
  }

  @Test
  void failsClosedWhenPrivateUpdateServiceIsDisabled() {
    ClientUpdateService.CheckResponse response = service.check(user(), request("stable", "0.1.0"));
    assertThat(response.status()).isEqualTo("disabled");
    assertThat(response.accessToken()).isNull();
  }

  @Test
  void rejectsAccountsOutsideTheChannelMembership() {
    properties.setEnabled(true);
    when(jdbcTemplate.queryForObject(any(String.class), eq(Integer.class), any(), any())).thenReturn(0);
    ClientUpdateService.CheckResponse response = service.check(user(), request("stable", "0.1.0"));
    assertThat(response.status()).isEqualTo("unauthorized");
    assertThat(response.feedUrl()).isNull();
  }

  @Test
  void rolloutBucketsAreStableAndBounded() {
    int first = service.rolloutBucket("fixed-release-salt", 42L);
    assertThat(first).isBetween(0, 99);
    assertThat(service.rolloutBucket("fixed-release-salt", 42L)).isEqualTo(first);
    assertThat(service.rolloutBucket("another-release-salt", 42L)).isNotEqualTo(first);
  }

  @Test
  void githubTransportIsAnExplicitOptInAndDoesNotChangeLegacyFeeds() throws Exception {
    String server = "https://moyustation.xyz/private-updates/releases/stable/0.3.0/";
    assertThat(properties.isGithubDownloadsEnabled()).isFalse();
    assertThat(service.releaseFeedUrl(githubManifest("waaakong/StudyRoom", "v0.3.0"), server)).isEqualTo(server);
    properties.setGithubDownloadsEnabled(true);
    properties.setGithubRepository("waaakong/StudyRoom");
    assertThat(service.releaseFeedUrl("{\"schemaVersion\":1}", server)).isEqualTo(server);
    assertThat(service.releaseFeedUrl(githubManifest("waaakong/StudyRoom", "v0.3.0"), server))
        .isEqualTo("https://github.com/waaakong/StudyRoom/releases/download/v0.3.0/");
    assertThatThrownBy(() -> service.releaseFeedUrl(githubManifest("other/repo", "v0.3.0"), server)).hasMessageContaining("来源");
    assertThatThrownBy(() -> service.releaseFeedUrl(githubManifest("waaakong/StudyRoom", "latest"), server)).hasMessageContaining("来源");
  }

  private String githubManifest(String repository, String tag) throws Exception {
    return new ObjectMapper().writeValueAsString(java.util.Map.ofEntries(
        java.util.Map.entry("schemaVersion", 2), java.util.Map.entry("releaseId", "stable-0.3.0"),
        java.util.Map.entry("channel", "stable"), java.util.Map.entry("version", "0.3.0"),
        java.util.Map.entry("platform", "win32"), java.util.Map.entry("arch", "x64"),
        java.util.Map.entry("appId", "xyz.moyustation.studyroom"), java.util.Map.entry("artifactKey", "stable/0.3.0"),
        java.util.Map.entry("publishedAt", "2026-10-01T00:00:00Z"),
        java.util.Map.entry("github", java.util.Map.of("repository", repository, "tag", tag)),
        java.util.Map.entry("files", java.util.List.of(
            java.util.Map.of("name", "latest.yml", "size", 120, "sha512", java.util.Base64.getEncoder().encodeToString(new byte[64]), "role", "feed"),
            java.util.Map.of("name", "MoYu.exe", "size", 1000, "sha512", java.util.Base64.getEncoder().encodeToString(new byte[64]), "role", "installer")))));
  }

  private ClientUpdateCheckRequest request(String channel, String version) {
    ClientUpdateCheckRequest request = new ClientUpdateCheckRequest();
    request.setCurrentVersion(version);
    request.setChannel(channel);
    request.setPlatform("win32");
    request.setArch("x64");
    return request;
  }

  private User user() {
    User user = new User();
    user.setId(42L);
    user.setUsername("tester");
    user.setUserType("NORMAL");
    user.setDeleted(0);
    return user;
  }
}
