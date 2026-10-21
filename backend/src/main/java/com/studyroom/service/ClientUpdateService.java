package com.studyroom.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyroom.common.BusinessException;
import com.studyroom.config.ClientUpdateProperties;
import com.studyroom.dto.ClientReleaseImportRequest;
import com.studyroom.dto.ClientReleasePolicyRequest;
import com.studyroom.dto.ClientUpdateCheckRequest;
import com.studyroom.dto.ClientUpdateMembershipRequest;
import com.studyroom.entity.User;
import org.springframework.dao.DataAccessException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;
import org.springframework.session.Session;
import org.springframework.session.SessionRepository;
import javax.servlet.http.HttpSession;
import com.studyroom.config.AuthSecurityProperties;
import com.studyroom.security.SessionPolicyInterceptor;

import java.io.IOException;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

@Service
public class ClientUpdateService {
  public static final Set<String> CHANNELS = Set.of("stable", "beta", "provider-experimental");
  public static final Set<String> RELEASE_STATUSES = Set.of("DRAFT", "PILOT", "ROLLING", "FULL", "PAUSED", "WITHDRAWN");
  public static final Set<Integer> ROLLOUT_PERCENTAGES = Set.of(0, 10, 30, 50, 100);
  private static final Pattern SAFE_SEGMENT = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$");
  private static final SecureRandom SECURE_RANDOM = new SecureRandom();
  private static final String GRANT_PREFIX = "studyroom:update:grant:";

  private final JdbcTemplate jdbcTemplate;
  private final StringRedisTemplate redisTemplate;
  private final ObjectMapper objectMapper;
  private final ClientUpdateProperties properties;
  private final ClientUpdateSocketHub socketHub;
  private final AdminAuditService adminAuditService;
  private SessionRepository<? extends Session> sessions;
  private AuthSecurityProperties sessionPolicy = new AuthSecurityProperties();
  @Autowired(required = false)
  public void setSessionRepository(SessionRepository<? extends Session> repository) { sessions = repository; }
  @Autowired
  public void setSessionPolicy(AuthSecurityProperties policy) { sessionPolicy = policy; }

  @Autowired
  public ClientUpdateService(
      JdbcTemplate jdbcTemplate,
      StringRedisTemplate redisTemplate,
      ObjectMapper objectMapper,
      ClientUpdateProperties properties,
      ClientUpdateSocketHub socketHub,
      AdminAuditService adminAuditService
  ) {
    this.jdbcTemplate = jdbcTemplate;
    this.redisTemplate = redisTemplate;
    this.objectMapper = objectMapper;
    this.properties = properties;
    this.socketHub = socketHub;
    this.adminAuditService = adminAuditService;
  }

  public ClientUpdateService(
      JdbcTemplate jdbcTemplate,
      StringRedisTemplate redisTemplate,
      ObjectMapper objectMapper,
      ClientUpdateProperties properties,
      ClientUpdateSocketHub socketHub
  ) {
    this(jdbcTemplate, redisTemplate, objectMapper, properties, socketHub, null);
  }

  public CheckResponse check(User user, ClientUpdateCheckRequest request) {
    return check(user, request, null);
  }

  public CheckResponse check(User user, ClientUpdateCheckRequest request, HttpSession session) {
    String channel = normalizeChannel(request.getChannel());
    ClientVersion currentVersion = parseVersion(request.getCurrentVersion());
    if (!"win32".equals(request.getPlatform()) || !"x64".equals(request.getArch())) {
      return CheckResponse.status("not-available", "当前平台没有可用更新。", currentVersion.toString(), channel);
    }
    if (!properties.isEnabled()) {
      return CheckResponse.status("disabled", "私有更新服务尚未启用。", currentVersion.toString(), channel);
    }
    if (!hasMembership(user.getId(), channel)) {
      return CheckResponse.status("unauthorized", "当前账号不在此更新通道白名单中。", currentVersion.toString(), channel);
    }

    ReleaseView release = eligibleReleases(channel, request.getPlatform(), request.getArch()).stream()
        .filter(candidate -> isEligibleForRollout(user, candidate))
        .max(Comparator.comparing(candidate -> parseVersion(candidate.version())))
        .orElse(null);
    if (release == null || parseVersion(release.version()).compareTo(currentVersion) <= 0) {
      return CheckResponse.status("not-available", "当前已是最新版本。", currentVersion.toString(), channel);
    }

    boolean required = release.mandatory() || (StringUtils.hasText(release.minimumSupportedVersion())
        && currentVersion.compareTo(parseVersion(release.minimumSupportedVersion())) < 0);
    String grant = issueGrant(user, release, session);
    String base = properties.getBaseUrl().replaceAll("/+$", "");
    return new CheckResponse(
        required ? "required" : "available",
        required ? "此版本包含必须安装的安全更新。" : "发现可用更新。",
        currentVersion.toString(),
        release.version(),
        channel,
        required,
        release.releaseNotes(),
        release.publishedAt(),
        releaseFeedUrl(release.manifestJson(), base + "/releases/" + release.artifactKey() + "/"),
        grant,
        Instant.now().plus(properties.getGrantTtl()).toString(),
        release.manifestJson(),
        release.manifestSignature(),
        release.manifestKeyId()
    );
  }

  @javax.annotation.PostConstruct
  public void verifyPolicySchema() {
    if (properties.isVersionedPolicyEnabled()) jdbcTemplate.queryForList("SELECT policy_version FROM sr_client_release LIMIT 0");
  }

  public boolean hasAnyMembership(Long userId) {
    return hasMembership(userId, "stable") || hasMembership(userId, "beta") || hasMembership(userId, "provider-experimental");
  }

  public boolean hasMembership(Long userId, String channel) {
    channel = normalizeChannel(channel);
    if (!properties.isEnabled() || userId == null || userId <= 0) return false;
    // Explicit revocation remains effective even for the registered stable audience.
    boolean registered = "stable".equals(channel) && properties.getAudience() == ClientUpdateProperties.Audience.REGISTERED;
    Integer count = jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM sr_user u WHERE u.id = ? AND u.deleted = 0 " +
            "AND u.user_type IN ('NORMAL','MUTED','ADMIN') AND COALESCE(u.force_password_change,0) = 0 " +
            "AND NOT EXISTS (SELECT 1 FROM sr_client_update_membership m WHERE m.user_id = u.id AND m.channel = ? AND m.enabled = 0) " +
            "AND (? = 1 OR EXISTS (SELECT 1 FROM sr_client_update_membership m WHERE m.user_id = u.id AND m.channel = ? AND m.enabled = 1))",
        Integer.class, userId, channel, registered ? 1 : 0, channel);
    return count != null && count > 0;
  }

  public boolean verifyGrant(String authorization, String originalUri) {
    if (!properties.isEnabled() || !StringUtils.hasText(authorization) || !authorization.startsWith("Bearer ")) return false;
    if (!StringUtils.hasText(originalUri) || originalUri.contains("..") || originalUri.contains("\\") || originalUri.contains("%")) return false;
    String token = authorization.substring("Bearer ".length()).trim();
    if (token.length() < 32) return false;
    try {
      String value = redisTemplate.opsForValue().get(GRANT_PREFIX + sha256(token));
      if (!StringUtils.hasText(value)) return false;
      String[] parts = value.split("\\|", 5);
      if (parts.length != 5) return false; // Old unbound grants expire closed; clients can recheck.
      Long releaseId = Long.valueOf(parts[0]);
      String artifactKey = parts[1];
      String expectedPrefix = "/private-updates/releases/" + artifactKey + "/";
      if (!originalUri.startsWith(expectedPrefix)
          || !originalUri.substring(expectedPrefix.length()).matches("^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")) return false;
      Long grantedUserId = Long.valueOf(parts[2]);
      if (!hasMembership(grantedUserId, artifactKey.split("/", 2)[0])) return false;
      String loginVersion = new String(Base64.getUrlDecoder().decode(parts[3]), StandardCharsets.UTF_8);
      String sessionId = new String(Base64.getUrlDecoder().decode(parts[4]), StandardCharsets.UTF_8);
      if (!liveGrantSession(sessionId, grantedUserId, loginVersion)) return false;
      Integer sessionCurrent = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM sr_user WHERE id = ? AND login_version = ?", Integer.class, grantedUserId, loginVersion);
      if (sessionCurrent == null || sessionCurrent != 1) return false;
      List<Map<String,Object>> releases = jdbcTemplate.queryForList(
          "SELECT channel,status,rollout_percentage,release_salt FROM sr_client_release WHERE id = ? AND artifact_key = ?", releaseId, artifactKey);
      if (releases.size() != 1) return false;
      Map<String,Object> release = releases.get(0);
      if (!(release.get("rollout_percentage") instanceof Number percentage)
          || !artifactKey.startsWith(String.valueOf(release.get("channel")) + "/")) return false;
      return rolloutAllowed(String.valueOf(release.get("status")), String.valueOf(release.get("release_salt")),
          percentage.intValue(), grantedUserId, String.valueOf(release.get("channel")));
    } catch (RuntimeException exception) {
      return false;
    }
  }

  private boolean liveGrantSession(String id, Long userId, String epoch) {
    if (sessions == null || !StringUtils.hasText(id)) return false;
    Session session = sessions.findById(id);
    if (session == null || session.isExpired() || !userId.equals(session.getAttribute(AuthService.SESSION_USER_ID))
        || !epoch.equals(session.getAttribute(AuthService.SESSION_LOGIN_VERSION))) return false;
    if (Boolean.TRUE.equals(session.getAttribute(SessionPolicyInterceptor.REMEMBERED_ATTRIBUTE))) {
      Object created = session.getAttribute(SessionPolicyInterceptor.CREATED_AT_ATTRIBUTE);
      if (!(created instanceof Number timestamp) || Instant.now().toEpochMilli() - timestamp.longValue() >= sessionPolicy.getDesktopSessionLifetime().toMillis()) return false;
    }
    return true;
  }

  public List<MembershipView> memberships() {
    return jdbcTemplate.query(
        "SELECT m.user_id, u.username, m.channel, m.enabled, m.granted_at, m.revoked_at " +
            "FROM sr_client_update_membership m JOIN sr_user u ON u.id = m.user_id " +
            "ORDER BY u.username, m.channel",
        (rs, row) -> new MembershipView(
            rs.getLong("user_id"), rs.getString("username"), rs.getString("channel"),
            rs.getBoolean("enabled"), toText(rs.getTimestamp("granted_at")), toText(rs.getTimestamp("revoked_at")))
    );
  }

  public List<ReleaseView> releases() {
    return jdbcTemplate.query(
        "SELECT * FROM sr_client_release ORDER BY created_at DESC, id DESC LIMIT 100",
        (rs, row) -> mapRelease(rs)
    );
  }

  public ReleasePage releasePage(String cursor) {
    List<ReleaseView> rows;
    if (cursor == null || cursor.isBlank()) {
      rows = jdbcTemplate.query("SELECT * FROM sr_client_release ORDER BY created_at DESC, id DESC LIMIT 31", (rs, n) -> mapRelease(rs));
    } else {
      try {
        if (!cursor.matches("[A-Za-z0-9_-]{1,160}")) throw new IllegalArgumentException();
        String[] parts = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8).split("\\|", -1);
        if (parts.length != 3 || !parts[0].equals("releases-v1")) throw new IllegalArgumentException();
        LocalDateTime time = LocalDateTime.parse(parts[1]);
        long id = Long.parseLong(parts[2]);
        if (id < 1) throw new IllegalArgumentException();
        rows = jdbcTemplate.query("SELECT * FROM sr_client_release WHERE created_at < ? OR (created_at = ? AND id < ?) ORDER BY created_at DESC, id DESC LIMIT 31",
            (rs, n) -> mapRelease(rs), time, time, id);
      } catch (IllegalArgumentException | java.time.DateTimeException error) {
        throw new BusinessException("INVALID_CURSOR", "发布列表游标无效，请刷新列表。");
      }
    }
    boolean more = rows.size() > 30;
    List<ReleaseView> items = List.copyOf(rows.subList(0, Math.min(30, rows.size())));
    ReleaseView last = items.isEmpty() ? null : items.get(items.size() - 1);
    String next = more ? Base64.getUrlEncoder().withoutPadding().encodeToString(
        ("releases-v1|" + last.createdAt() + "|" + last.id()).getBytes(StandardCharsets.UTF_8)) : null;
    return new ReleasePage(items, next, properties.isVersionedPolicyEnabled());
  }

  public ReleaseView getRelease(Long id) { return releaseById(id); }

  @Transactional
  public void updateMembership(User actor, Long userId, ClientUpdateMembershipRequest request, String ipAddress) {
    String channel = normalizeChannel(request.getChannel());
    Integer userCount = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM sr_user WHERE id = ? AND deleted = 0", Integer.class, userId);
    if (userCount == null || userCount == 0) throw new BusinessException("用户不存在。");
    Map<String, Object> before = membershipState(userId, channel);
    jdbcTemplate.update(
        "INSERT INTO sr_client_update_membership (user_id, channel, enabled, granted_by, granted_at, revoked_at) " +
            "VALUES (?, ?, ?, ?, NOW(), ?) ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), granted_by = VALUES(granted_by), " +
            "granted_at = IF(VALUES(enabled) = 1, NOW(), granted_at), revoked_at = VALUES(revoked_at)",
        userId, channel, request.getEnabled() ? 1 : 0, actor.getId(), request.getEnabled() ? null : LocalDateTime.now());
    Map<String, Object> after = membershipState(userId, channel);
    audit(actor.getId(), request.getEnabled() ? "MEMBERSHIP_GRANTED" : "MEMBERSHIP_REVOKED", "membership", userId + ":" + channel,
        before, after, request.getReason(), ipAddress);
    if (!request.getEnabled()) afterCommit(() -> socketHub.disconnectUser(userId));
  }

  @Transactional
  public void updateMembership(User actor, Long userId, ClientUpdateMembershipRequest request, AdminAuditContext context) {
    String channel = normalizeChannel(request.getChannel());
    Map<String, Object> before = membershipState(userId, channel);
    updateMembership(actor, userId, request, context.ipAddress());
    Map<String, Object> after = membershipState(userId, channel);
    adminAuditService.success(actor.getId(), request.getEnabled() ? "UPDATE_MEMBERSHIP_GRANTED" : "UPDATE_MEMBERSHIP_REVOKED",
        "update-membership", userId + ":" + channel,
        Map.of("channel", channel, "enabled", String.valueOf(before.getOrDefault("enabled", "absent"))),
        Map.of("channel", channel, "enabled", String.valueOf(after.getOrDefault("enabled", request.getEnabled()))), context);
  }

  @Transactional
  public ReleaseView updateReleasePolicy(User actor, Long releaseId, ClientReleasePolicyRequest request, String ipAddress) {
    requirePolicyTransaction(actor);
    long expected = expectedVersion(request);
    String status = request.getStatus().trim().toUpperCase(Locale.ROOT);
    if (!RELEASE_STATUSES.contains(status)) throw new BusinessException("发布状态不正确。");
    if (!ROLLOUT_PERCENTAGES.contains(request.getRolloutPercentage())) throw new BusinessException("灰度比例只允许 0、10、30、50 或 100。");
    if ("ROLLING".equals(status) && !Set.of(10, 30, 50, 100).contains(request.getRolloutPercentage())) {
      throw new BusinessException("灰度发布必须使用 10%、30%、50% 或 100%。");
    }
    if (!"ROLLING".equals(status) && request.getRolloutPercentage() != 0 && !"FULL".equals(status)) {
      throw new BusinessException("当前发布状态不能设置灰度比例。");
    }
    if (StringUtils.hasText(request.getMinimumSupportedVersion())) parseVersion(request.getMinimumSupportedVersion());
    ReleaseView before = lockedRelease(releaseId);
    if (!String.valueOf(expected).equals(before.policyVersion())) {
      throw new BusinessException("RELEASE_VERSION_CONFLICT", "发布策略已被其他操作修改，请刷新并重新确认；本次意图未提交。");
    }
    validateTransition(before.status(), status);
    jdbcTemplate.update(
        "UPDATE sr_client_release SET status = ?, rollout_percentage = ?, mandatory = ?, minimum_supported_version = ?, " +
            "release_notes = ?, policy_version = policy_version + 1, published_at = IF(? IN ('PILOT','ROLLING','FULL') AND published_at IS NULL, NOW(), published_at) WHERE id = ?",
        status,
        "FULL".equals(status) ? 100 : request.getRolloutPercentage(),
        request.getMandatory() ? 1 : 0,
        blankToNull(request.getMinimumSupportedVersion()),
        blankToNull(request.getReleaseNotes()),
        status,
        releaseId);
    ReleaseView after = releaseById(releaseId);
    audit(actor.getId(), "RELEASE_POLICY_UPDATED", "release", String.valueOf(releaseId), before, after, request.getReason(), ipAddress);
    if (Set.of("PILOT", "ROLLING", "FULL").contains(status)) afterCommit(() -> socketHub.broadcast(after.channel(), after.releaseId(), after.version()));
    afterCommit(() -> socketHub.broadcastPolicyChanged(after.channel(), after.releaseId(), after.version(), after.policyVersion()));
    return after;
  }

  @Transactional
  public ReleaseView updateReleasePolicy(User actor, Long releaseId, ClientReleasePolicyRequest request, AdminAuditContext context) {
    requirePolicyTransaction(actor);
    ReleaseView before = lockedRelease(releaseId);
    ReleaseView after = updateReleasePolicy(actor, releaseId, request, context.ipAddress());
    adminAuditService.success(actor.getId(), "RELEASE_POLICY_UPDATED", "release", releaseId,
        Map.of("releaseStatus", before.status(), "rolloutPercentage", before.rolloutPercentage(), "mandatory", before.mandatory()),
        Map.of("releaseStatus", after.status(), "rolloutPercentage", after.rolloutPercentage(), "mandatory", after.mandatory()), context);
    return after;
  }

  private void requirePolicyTransaction(User actor) {
    if (!properties.isVersionedPolicyEnabled()) throw new BusinessException("RELEASE_POLICY_UNAVAILABLE", "版本化发布管理尚未启用，禁止修改发布策略。");
    if (!TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("Release policy requires a transaction");
    // Match the authenticated generation again under the same lock used by role/password changes.
    List<Map<String,Object>> users = jdbcTemplate.queryForList("SELECT user_type, login_version, deleted FROM sr_user WHERE id = ? FOR UPDATE", actor.getId());
    if (users.isEmpty() || !"ADMIN".equals(users.get(0).get("user_type"))
        || ((Number) users.get(0).get("deleted")).intValue() != 0
        || !java.util.Objects.equals(users.get(0).get("login_version"), actor.getLoginVersion())) {
      throw new BusinessException("AUTH_SESSION_REVOKED", "管理权限或会话已变更，请重新登录。");
    }
  }

  private long expectedVersion(ClientReleasePolicyRequest request) {
    try {
      String value = request.getExpectedVersion();
      if (value == null || !value.matches("0|[1-9][0-9]{0,18}")) throw new IllegalArgumentException();
      long result = Long.parseLong(value);
      if (result == Long.MAX_VALUE) throw new IllegalArgumentException();
      return result;
    } catch (IllegalArgumentException error) {
      throw new BusinessException("RELEASE_VERSION_REQUIRED", "请使用支持版本校验的客户端刷新后操作。");
    }
  }

  private ReleaseView lockedRelease(Long id) {
    List<ReleaseView> values = jdbcTemplate.query("SELECT * FROM sr_client_release WHERE id = ? FOR UPDATE", (rs, row) -> mapRelease(rs), id);
    if (values.isEmpty()) throw new BusinessException("发布版本不存在。");
    return values.get(0);
  }

  private void afterCommit(Runnable action) {
    if (!TransactionSynchronizationManager.isSynchronizationActive()) throw new IllegalStateException("Update notifications require a transaction");
    TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
      @Override public void afterCommit() {
        // A failed delivery must not turn an already committed policy into an apparent write failure.
        try { action.run(); } catch (RuntimeException error) {
          org.slf4j.LoggerFactory.getLogger(ClientUpdateService.class).warn("Client update notification delivery failed after commit");
        }
      }
    });
  }

  @Transactional
  public ReleaseView importRelease(ClientReleaseImportRequest request, String remoteAddress, String suppliedSecret) {
    requireInternalImport(remoteAddress, suppliedSecret);
    if (!verifyManifestSignature(request.getManifestJson(), request.getSignature(), request.getKeyId())) {
      throw new BusinessException("发布清单签名无效。");
    }
    Manifest manifest = parseManifest(request.getManifestJson());
    validateManifest(manifest);
    verifyArtifacts(manifest);
    String salt = randomToken();
    try {
      jdbcTemplate.update(
          "INSERT INTO sr_client_release (release_id, channel, version, platform, arch, app_id, artifact_key, manifest_json, " +
              "manifest_signature, manifest_key_id, status, rollout_percentage, mandatory, release_salt) " +
              "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', 0, 0, ?)",
          manifest.releaseId(), manifest.channel(), manifest.version(), manifest.platform(), manifest.arch(), manifest.appId(),
          manifest.artifactKey(), request.getManifestJson(), request.getSignature(), request.getKeyId(), salt);
    } catch (DataAccessException exception) {
      throw new BusinessException("相同通道和版本已经导入，禁止覆盖发布。");
    }
    ReleaseView imported = releaseByReleaseId(manifest.releaseId());
    audit(null, "RELEASE_IMPORTED", "release", manifest.releaseId(), null, imported, "server import", remoteAddress);
    return imported;
  }

  private List<ReleaseView> eligibleReleases(String channel, String platform, String arch) {
    return jdbcTemplate.query(
        "SELECT * FROM sr_client_release WHERE channel = ? AND platform = ? AND arch = ? AND status IN ('PILOT','ROLLING','FULL')",
        (rs, row) -> mapRelease(rs), channel, platform, arch);
  }

  private ReleaseView releaseById(Long id) {
    List<ReleaseView> values = jdbcTemplate.query("SELECT * FROM sr_client_release WHERE id = ?", (rs, row) -> mapRelease(rs), id);
    if (values.isEmpty()) throw new BusinessException("发布版本不存在。");
    return values.get(0);
  }

  private ReleaseView releaseByReleaseId(String releaseId) {
    List<ReleaseView> values = jdbcTemplate.query("SELECT * FROM sr_client_release WHERE release_id = ?", (rs, row) -> mapRelease(rs), releaseId);
    if (values.isEmpty()) throw new BusinessException("发布版本不存在。");
    return values.get(0);
  }

  private ReleaseView mapRelease(java.sql.ResultSet rs) throws java.sql.SQLException {
    return new ReleaseView(
        rs.getLong("id"), rs.getString("release_id"), rs.getString("channel"), rs.getString("version"),
        rs.getString("platform"), rs.getString("arch"), rs.getString("app_id"), rs.getString("artifact_key"),
        rs.getString("status"), rs.getInt("rollout_percentage"), rs.getBoolean("mandatory"),
        rs.getString("minimum_supported_version"), rs.getString("release_notes"), rs.getString("release_salt"),
        rs.getString("manifest_json"), rs.getString("manifest_signature"), rs.getString("manifest_key_id"),
        dateTimeText(rs, "published_at"), dateTimeText(rs, "created_at"),
        properties.isVersionedPolicyEnabled() ? rs.getString("policy_version") : null
    );
  }

  private boolean isEligibleForRollout(User user, ReleaseView release) {
    return rolloutAllowed(release.status(), release.releaseSalt(), release.rolloutPercentage(), user.getId(), release.channel());
  }

  private boolean rolloutAllowed(String status, String salt, int percentage, Long userId, String channel) {
    return switch (status) {
      case "FULL" -> true;
      case "PILOT" -> explicitMembership(userId, channel);
      case "ROLLING" -> rolloutBucket(salt, userId) < percentage;
      default -> false;
    };
  }

  private boolean explicitMembership(Long userId, String channel) {
    Integer count = jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM sr_client_update_membership WHERE user_id = ? AND channel = ? AND enabled = 1",
        Integer.class, userId, channel);
    return count != null && count > 0;
  }

  int rolloutBucket(String salt, Long userId) {
    byte[] digest = digest("SHA-256", (salt + ":" + userId).getBytes(StandardCharsets.UTF_8));
    int value = ((digest[0] & 0xff) << 24) | ((digest[1] & 0xff) << 16) | ((digest[2] & 0xff) << 8) | (digest[3] & 0xff);
    return (int) (Integer.toUnsignedLong(value) % 100);
  }

  private String issueGrant(User user, ReleaseView release, HttpSession session) {
    if (!StringUtils.hasText(user.getLoginVersion())) throw new BusinessException("登录状态不可用，请重新登录。");
    if (session == null || !liveGrantSession(session.getId(), user.getId(), user.getLoginVersion())) throw new BusinessException("更新会话不可用，请重新登录。");
    String token = randomToken();
    try {
      redisTemplate.opsForValue().set(
          GRANT_PREFIX + sha256(token),
          release.id() + "|" + release.artifactKey() + "|" + user.getId() + "|" + Base64.getUrlEncoder().withoutPadding().encodeToString(user.getLoginVersion().getBytes(StandardCharsets.UTF_8)) + "|" + Base64.getUrlEncoder().withoutPadding().encodeToString(session.getId().getBytes(StandardCharsets.UTF_8)),
          properties.getGrantTtl());
      return token;
    } catch (DataAccessException exception) {
      throw new BusinessException("更新授权服务暂不可用。");
    }
  }

  private String randomToken() {
    byte[] bytes = new byte[32];
    SECURE_RANDOM.nextBytes(bytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  private String sha256(String value) {
    return Base64.getUrlEncoder().withoutPadding().encodeToString(digest("SHA-256", value.getBytes(StandardCharsets.UTF_8)));
  }

  private byte[] digest(String algorithm, byte[] value) {
    try {
      return MessageDigest.getInstance(algorithm).digest(value);
    } catch (Exception exception) {
      throw new IllegalStateException(exception);
    }
  }

  private boolean verifyManifestSignature(String manifestJson, String signatureValue, String keyId) {
    String encodedKey = properties.getManifestPublicKeys().get(keyId);
    if (!StringUtils.hasText(encodedKey)) return false;
    try {
      PublicKey publicKey = KeyFactory.getInstance("Ed25519")
          .generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(encodedKey)));
      Signature verifier = Signature.getInstance("Ed25519");
      verifier.initVerify(publicKey);
      verifier.update(manifestJson.getBytes(StandardCharsets.UTF_8));
      return verifier.verify(Base64.getDecoder().decode(signatureValue));
    } catch (Exception exception) {
      return false;
    }
  }

  private Manifest parseManifest(String manifestJson) {
    try {
      JsonNode root = objectMapper.readTree(manifestJson);
      List<ManifestFile> files = new ArrayList<>();
      root.path("files").forEach(file -> files.add(new ManifestFile(
          file.path("name").asText(), file.path("size").asLong(-1), file.path("sha512").asText(), file.path("role").asText())));
      return new Manifest(
          root.path("schemaVersion").asInt(), root.path("releaseId").asText(), root.path("channel").asText(),
          root.path("version").asText(), root.path("platform").asText(), root.path("arch").asText(),
          root.path("appId").asText(), root.path("artifactKey").asText(), root.path("publishedAt").asText(), List.copyOf(files),
          root.path("github").path("repository").asText(), root.path("github").path("tag").asText());
    } catch (JsonProcessingException exception) {
      throw new BusinessException("发布清单格式无效。");
    }
  }

  private void validateManifest(Manifest manifest) {
    if (manifest.schemaVersion() != 1 && manifest.schemaVersion() != 2) throw new BusinessException("不支持的发布清单版本。");
    if (manifest.schemaVersion() == 2) validateGithubSource(manifest);
    if (!SAFE_SEGMENT.matcher(manifest.releaseId()).matches()) throw new BusinessException("发布 ID 无效。");
    String channel = normalizeChannel(manifest.channel());
    validateChannelVersion(channel, manifest.version());
    if (!(channel + "-" + manifest.version()).equals(manifest.releaseId())) throw new BusinessException("发布 ID 与版本不匹配。");
    try {
      Instant publishedAt = Instant.parse(manifest.publishedAt());
      if (publishedAt.isAfter(Instant.now().plusSeconds(600))) throw new BusinessException("发布时间不能来自未来。");
    } catch (java.time.format.DateTimeParseException exception) {
      throw new BusinessException("发布时间格式无效。");
    }
    if (!"win32".equals(manifest.platform()) || !"x64".equals(manifest.arch())) throw new BusinessException("发布平台无效。");
    String expectedAppId = switch (channel) {
      case "stable" -> "xyz.moyustation.studyroom";
      case "beta" -> "xyz.moyustation.studyroom.beta";
      default -> "xyz.moyustation.studyroom.provider-experimental";
    };
    if (!expectedAppId.equals(manifest.appId())) throw new BusinessException("发布应用 ID 与通道不匹配。");
    if (!(channel + "/" + manifest.version()).equals(manifest.artifactKey())) throw new BusinessException("发布制品路径无效。");
    if (manifest.files().isEmpty() || manifest.files().size() > 8) throw new BusinessException("发布制品清单不完整。");
    long feeds = manifest.files().stream().filter(file -> "feed".equals(file.role())).count();
    long installers = manifest.files().stream().filter(file -> "installer".equals(file.role())).count();
    if (feeds != 1 || installers != 1) throw new BusinessException("发布必须包含一个更新清单和一个安装包。");
    Set<String> fileNames = new java.util.HashSet<>();
    for (ManifestFile file : manifest.files()) {
      if (!SAFE_SEGMENT.matcher(file.name()).matches() || file.size() < 1 || file.size() > 1024L * 1024L * 1024L) {
        throw new BusinessException("发布文件信息无效。");
      }
      if (!fileNames.add(file.name())) throw new BusinessException("发布文件名不能重复。");
      boolean roleMatches = switch (file.role()) {
        case "feed" -> "latest.yml".equals(file.name());
        case "installer" -> file.name().toLowerCase(Locale.ROOT).endsWith(".exe");
        case "blockmap" -> file.name().toLowerCase(Locale.ROOT).endsWith(".blockmap");
        default -> false;
      };
      if (!roleMatches) throw new BusinessException("发布文件类型与角色不匹配。");
      try {
        if (Base64.getDecoder().decode(file.sha512()).length != 64) throw new IllegalArgumentException();
      } catch (IllegalArgumentException exception) {
        throw new BusinessException("发布文件哈希无效。");
      }
    }
  }

  private void verifyArtifacts(Manifest manifest) {
    Path root = properties.getStorageRoot().toAbsolutePath().normalize();
    Path releaseRoot = root.resolve(manifest.channel()).resolve(manifest.version()).normalize();
    if (!releaseRoot.startsWith(root)) throw new BusinessException("发布路径越界。");
    for (ManifestFile file : manifest.files()) {
      Path target = releaseRoot.resolve(file.name()).normalize();
      if (!target.startsWith(releaseRoot) || Files.isSymbolicLink(target) || !Files.isRegularFile(target)) {
        throw new BusinessException("发布文件不存在或不安全。");
      }
      try {
        if (Files.size(target) != file.size()) throw new BusinessException("发布文件大小不匹配。");
        String actual = Base64.getEncoder().encodeToString(digestFile(target));
        if (!MessageDigest.isEqual(actual.getBytes(StandardCharsets.US_ASCII), file.sha512().getBytes(StandardCharsets.US_ASCII))) {
          throw new BusinessException("发布文件哈希不匹配。");
        }
      } catch (IOException exception) {
        throw new BusinessException("无法读取发布文件。");
      }
    }
  }

  private void validateGithubSource(Manifest manifest) {
    if (!manifest.githubRepository().matches("[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9][A-Za-z0-9._-]{0,99}")
        || !manifest.githubRepository().equals(properties.getGithubRepository())
        || !("v" + manifest.version()).equals(manifest.githubTag())) {
      throw new BusinessException("GitHub 发布来源与配置的仓库或版本不匹配。");
    }
  }

  // Package-private for contract tests; source changes never bypass the signed version binding.
  String releaseFeedUrl(String manifestJson, String serverFeed) {
    if (!properties.isGithubDownloadsEnabled()) return serverFeed;
    Manifest manifest = parseManifest(manifestJson);
    if (manifest.schemaVersion() == 1) return serverFeed;
    validateManifest(manifest);
    return "https://github.com/" + manifest.githubRepository() + "/releases/download/" + manifest.githubTag() + "/";
  }

  private byte[] digestFile(Path path) throws IOException {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-512");
      try (var input = Files.newInputStream(path)) {
        byte[] buffer = new byte[64 * 1024];
        int read;
        while ((read = input.read(buffer)) >= 0) digest.update(buffer, 0, read);
      }
      return digest.digest();
    } catch (java.security.NoSuchAlgorithmException exception) {
      throw new IllegalStateException(exception);
    }
  }

  private void requireInternalImport(String remoteAddress, String suppliedSecret) {
    try {
      if (!InetAddress.getByName(remoteAddress).isLoopbackAddress()) throw new BusinessException("发布导入只允许服务器本机调用。");
    } catch (IOException exception) {
      throw new BusinessException("无法验证发布导入来源。");
    }
    String expected = properties.getImportSecret();
    if (!StringUtils.hasText(expected) || !MessageDigest.isEqual(
        expected.getBytes(StandardCharsets.UTF_8), String.valueOf(suppliedSecret).getBytes(StandardCharsets.UTF_8))) {
      throw new BusinessException("发布导入凭据无效。");
    }
  }

  private void validateChannelVersion(String channel, String version) {
    ClientVersion parsed = parseVersion(version);
    boolean valid = switch (channel) {
      case "stable" -> parsed.isStable() || version.matches("\\d+\\.\\d+\\.\\d+-trial\\.\\d{8}\\.[1-9]\\d*");
      case "beta" -> parsed.hasPrereleasePrefix("beta");
      case "provider-experimental" -> parsed.hasPrereleasePrefix("exp");
      default -> false;
    };
    if (!valid) throw new BusinessException("版本格式与更新通道不匹配。");
  }

  private ClientVersion parseVersion(String value) {
    try {
      return ClientVersion.parse(value);
    } catch (IllegalArgumentException exception) {
      throw new BusinessException(exception.getMessage());
    }
  }

  private String normalizeChannel(String value) {
    String channel = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    if (!CHANNELS.contains(channel)) throw new BusinessException("更新通道不正确。");
    return channel;
  }

  private void validateTransition(String before, String after) {
    if ("WITHDRAWN".equals(before)) throw new BusinessException("RELEASE_WITHDRAWN", "已撤回版本不可修改或重新发布，请导入新版本。");
    if (before.equals(after)) return;
    if (Set.of("PAUSED", "WITHDRAWN").contains(after)) return;
    boolean valid = switch (before) {
      case "DRAFT" -> "PILOT".equals(after);
      case "PILOT" -> "ROLLING".equals(after) || "FULL".equals(after);
      case "ROLLING" -> "ROLLING".equals(after) || "FULL".equals(after);
      case "PAUSED" -> Set.of("PILOT", "ROLLING", "FULL", "WITHDRAWN").contains(after);
      default -> false;
    };
    if (!valid) throw new BusinessException("发布状态不能从 " + before + " 切换到 " + after + "。");
  }

  private Map<String, Object> membershipState(Long userId, String channel) {
    List<Map<String, Object>> rows = jdbcTemplate.queryForList(
        "SELECT user_id, channel, enabled, granted_by, granted_at, revoked_at FROM sr_client_update_membership WHERE user_id = ? AND channel = ?",
        userId, channel);
    return rows.isEmpty() ? Map.of() : new LinkedHashMap<>(rows.get(0));
  }

  private void audit(Long actorId, String action, String targetType, String targetId, Object before, Object after, String reason, String ipAddress) {
    try {
      jdbcTemplate.update(
          "INSERT INTO sr_client_update_audit (actor_user_id, action, target_type, target_id, before_json, after_json, reason, ip_address) " +
              "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          actorId, action, targetType, targetId,
          before == null ? null : objectMapper.writeValueAsString(before),
          after == null ? null : objectMapper.writeValueAsString(after),
          reason, ipAddress);
    } catch (JsonProcessingException exception) {
      throw new IllegalStateException("Unable to serialize update audit", exception);
    }
  }

  private String blankToNull(String value) { return StringUtils.hasText(value) ? value.trim() : null; }
  private String toText(java.sql.Timestamp value) { return value == null ? null : value.toLocalDateTime().toString(); }
  // DATETIME has no time zone: Timestamp would shift its wall clock via the JVM zone.
  private String dateTimeText(java.sql.ResultSet rs, String column) throws java.sql.SQLException {
    LocalDateTime value = rs.getObject(column, LocalDateTime.class);
    return value == null ? null : value.toString();
  }

  public record CheckResponse(
      String status, String message, String currentVersion, String availableVersion, String channel, boolean mandatory,
      String releaseNotes, String publishedAt, String feedUrl, String accessToken, String accessTokenExpiresAt,
      String manifestJson, String manifestSignature, String manifestKeyId
  ) {
    public static CheckResponse status(String status, String message, String currentVersion, String channel) {
      return new CheckResponse(status, message, currentVersion, null, channel, false, null, null, null, null, null, null, null, null);
    }
  }

  public record MembershipView(@com.fasterxml.jackson.databind.annotation.JsonSerialize(using=com.fasterxml.jackson.databind.ser.std.ToStringSerializer.class) Long userId, String username, String channel, boolean enabled, String grantedAt, String revokedAt) {}
  public record ReleaseView(
      @com.fasterxml.jackson.databind.annotation.JsonSerialize(using=com.fasterxml.jackson.databind.ser.std.ToStringSerializer.class) Long id, String releaseId, String channel, String version, String platform, String arch, String appId, String artifactKey,
      String status, int rolloutPercentage, boolean mandatory, String minimumSupportedVersion, String releaseNotes,
      String releaseSalt, String manifestJson, String manifestSignature, String manifestKeyId, String publishedAt, String createdAt, String policyVersion
  ) {}
  public record ReleasePage(List<ReleaseView> items, String nextCursor, boolean versionedPolicyEnabled) {}
  private record Manifest(
      int schemaVersion, String releaseId, String channel, String version, String platform, String arch,
      String appId, String artifactKey, String publishedAt, List<ManifestFile> files, String githubRepository, String githubTag
  ) {}
  private record ManifestFile(String name, long size, String sha512, String role) {}
}
