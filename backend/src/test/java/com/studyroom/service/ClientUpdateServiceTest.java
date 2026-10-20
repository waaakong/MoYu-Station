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
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.never;
import static org.mockito.ArgumentMatchers.contains;

class ClientUpdateServiceTest {
  private JdbcTemplate jdbcTemplate;
  private ClientUpdateProperties properties;
  private ClientUpdateService service;
  private StringRedisTemplate redis;

  @BeforeEach
  void setUp() {
    jdbcTemplate = mock(JdbcTemplate.class);
    properties = new ClientUpdateProperties();
    redis = mock(StringRedisTemplate.class);
    service = new ClientUpdateService(
        jdbcTemplate,
        redis,
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
    when(jdbcTemplate.queryForObject(any(String.class), eq(Integer.class), any(), any(), any(), any())).thenReturn(0);
    ClientUpdateService.CheckResponse response = service.check(user(), request("stable", "0.1.0"));
    assertThat(response.status()).isEqualTo("unauthorized");
    assertThat(response.feedUrl()).isNull();
  }

  @Test
  void audienceDefaultsToMembersAndRegisteredNeverExpandsExperimentalChannels() {
    assertThat(properties.getAudience()).isEqualTo(ClientUpdateProperties.Audience.MEMBERS);
    properties.setEnabled(true);
    properties.setAudience(ClientUpdateProperties.Audience.REGISTERED);
    when(jdbcTemplate.queryForObject(contains("SELECT COUNT(*) FROM sr_user"), eq(Integer.class),
        eq(42L), eq("stable"), eq(1), eq("stable"))).thenReturn(1);
    assertThat(service.hasMembership(42L, "stable")).isTrue();
    assertThat(service.hasMembership(42L, "beta")).isFalse();
    assertThat(service.hasMembership(42L, "provider-experimental")).isFalse();
    verify(jdbcTemplate).queryForObject(contains("m.enabled = 0"), eq(Integer.class),
        eq(42L), eq("stable"), eq(1), eq("stable"));
    verify(jdbcTemplate).queryForObject(contains("force_password_change"), eq(Integer.class),
        eq(42L), eq("beta"), eq(0), eq("beta"));
  }

  @Test
  void disabledAudienceDoesNotQueryAccountsAndHalfRolloutIsSupported() {
    properties.setAudience(ClientUpdateProperties.Audience.REGISTERED);
    assertThat(service.hasMembership(42L, "stable")).isFalse();
    verify(jdbcTemplate, never()).queryForObject(any(String.class), eq(Integer.class), any(), any(), any(), any());
    assertThat(ClientUpdateService.ROLLOUT_PERCENTAGES).contains(50);
    assertThatThrownBy(() -> properties.setAudience(null)).isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void downloadGrantRechecksAccountEpochWithdrawalAndPilotMembership() {
    properties.setEnabled(true);
    properties.setAudience(ClientUpdateProperties.Audience.REGISTERED);
    var values = mock(org.springframework.data.redis.core.ValueOperations.class);
    when(redis.opsForValue()).thenReturn(values);
    String epoch = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString("epoch-1".getBytes(java.nio.charset.StandardCharsets.UTF_8));
    var session = new org.springframework.session.MapSession("fixture-session");
    session.setAttribute(AuthService.SESSION_USER_ID, 42L);
    session.setAttribute(AuthService.SESSION_LOGIN_VERSION, "epoch-1");
    var repository = mock(org.springframework.session.SessionRepository.class);
    service.setSessionRepository(repository);
    when(repository.findById("fixture-session")).thenReturn(session);
    String sessionId = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString("fixture-session".getBytes(java.nio.charset.StandardCharsets.UTF_8));
    when(values.get(any(String.class))).thenReturn("1|stable/0.3.0|42|" + epoch + "|" + sessionId);
    when(jdbcTemplate.queryForObject(contains("SELECT COUNT(*) FROM sr_user u"), eq(Integer.class),
        eq(42L), eq("stable"), eq(1), eq("stable"))).thenReturn(1);
    when(jdbcTemplate.queryForObject(contains("login_version = ?"), eq(Integer.class), eq(42L), eq("epoch-1"))).thenReturn(1);
    var full = java.util.Map.<String, Object>of("channel", "stable", "status", "FULL", "rollout_percentage", 100, "release_salt", "salt");
    when(jdbcTemplate.queryForList(contains("FROM sr_client_release WHERE"), eq(1L), eq("stable/0.3.0"))).thenReturn(java.util.List.of(full));
    String auth = "Bearer " + "a".repeat(64), uri = "/private-updates/releases/stable/0.3.0/installer.exe";
    assertThat(service.verifyGrant(auth, uri)).isTrue();
    when(repository.findById("fixture-session")).thenReturn(null);
    assertThat(service.verifyGrant(auth, uri)).isFalse();
    when(repository.findById("fixture-session")).thenReturn(session);
    assertThat(service.verifyGrant(auth, "/private-updates/releases/stable/0.4.0/installer.exe")).isFalse();
    assertThat(service.verifyGrant(auth, uri + "%2e")).isFalse();
    when(jdbcTemplate.queryForObject(contains("login_version = ?"), eq(Integer.class), eq(42L), eq("epoch-1"))).thenReturn(0);
    assertThat(service.verifyGrant(auth, uri)).isFalse();
    when(jdbcTemplate.queryForObject(contains("login_version = ?"), eq(Integer.class), eq(42L), eq("epoch-1"))).thenReturn(1);
    when(jdbcTemplate.queryForList(contains("FROM sr_client_release WHERE"), eq(1L), eq("stable/0.3.0")))
        .thenReturn(java.util.List.of(java.util.Map.of("channel", "stable", "status", "WITHDRAWN", "rollout_percentage", 100, "release_salt", "salt")));
    assertThat(service.verifyGrant(auth, uri)).isFalse();
    when(jdbcTemplate.queryForList(contains("FROM sr_client_release WHERE"), eq(1L), eq("stable/0.3.0")))
        .thenReturn(java.util.List.of(java.util.Map.of("channel", "stable", "status", "PILOT", "rollout_percentage", 0, "release_salt", "salt")));
    assertThat(service.verifyGrant(auth, uri)).isFalse();
    when(jdbcTemplate.queryForObject(contains("FROM sr_client_update_membership WHERE"), eq(Integer.class), eq(42L), eq("stable"))).thenReturn(1);
    assertThat(service.verifyGrant(auth, uri)).isTrue();
    when(values.get(any(String.class))).thenReturn("1|stable/0.3.0|42");
    assertThat(service.verifyGrant(auth, uri)).isFalse();
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
