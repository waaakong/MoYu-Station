package com.studyroom.media;

import com.studyroom.StudyRoomApplication;
import com.studyroom.security.PasswordService;
import io.lettuce.core.RedisClient;
import io.lettuce.core.RedisURI;
import java.net.*;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.servlet.context.ServletWebServerApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.session.SessionRepository;
import static org.assertj.core.api.Assertions.*;

/** Explicit local browser fixture. All services/data are new and owned; never accepts a DB/Redis URL. */
class MediaBrowserServerIT {
  @TempDir Path scratch;

  @Test void realBrowserAndElectronAgainstOwnedRedisTlsServer() throws Exception {
    ((ch.qos.logback.classic.Logger) org.slf4j.LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME)).setLevel(ch.qos.logback.classic.Level.WARN);
    Path evidence = Path.of(required("media.browser.evidence")).toRealPath();
    Path redisBinary = Path.of(required("media.redis.binary")).toRealPath();
    Path node = Path.of(required("media.browser.node")).toRealPath();
    Path script = Path.of(required("media.browser.script")).toRealPath();
    assertThat(redisBinary.getFileName().toString()).matches("redis-server(\\.exe)?");
    String redisPassword = UUID.randomUUID().toString();
    int redisPort;
    try (var reservation = new ServerSocket(0, 1, InetAddress.getLoopbackAddress())) { redisPort = reservation.getLocalPort(); }
    Path redisRun = Files.createDirectory(scratch.resolve("redis"));
    Path config = redisRun.resolve("redis.conf");
    Files.writeString(config, "bind 127.0.0.1\nprotected-mode yes\nport " + redisPort
        + "\nrequirepass " + redisPassword + "\nsave \"\"\nappendonly no\nmaxmemory 64mb\nmaxmemory-policy noeviction\nnotify-keyspace-events Ex\n");
    Process redis = new ProcessBuilder(redisBinary.toString(), config.getFileName().toString())
        .directory(redisRun.toFile()).redirectErrorStream(true).redirectOutput(evidence.resolve("redis.log").toFile()).start();
    Process[] ownedRedis = { redis };
    RedisClient probe = RedisClient.create(RedisURI.builder().withHost("127.0.0.1").withPort(redisPort)
        .withPassword(redisPassword.toCharArray()).withTimeout(Duration.ofSeconds(1)).build());
    ServletWebServerApplicationContext app = null;
    Process browser = null;
    EphemeralMysql mysql = null;
    try {
      mysql = EphemeralMysql.start(scratch, Path.of(required("media.mysql.binary")));
      mysql.verifyOwnership();
      long deadline = System.nanoTime() + Duration.ofSeconds(15).toNanos();
      String serverInfo = null;
      while (System.nanoTime() < deadline && redis.isAlive()) {
        try (var connection = probe.connect()) { assertThat(connection.sync().ping()).isEqualTo("PONG"); serverInfo = connection.sync().info("server"); break; }
        catch (RuntimeException unavailable) { Thread.sleep(100); }
      }
      assertThat(redis.isAlive()).isTrue(); assertThat(serverInfo).contains("redis_version:", "run_id:");
      Files.writeString(evidence.resolve("redis-server-info.txt"), serverInfo);
      app = (ServletWebServerApplicationContext) new SpringApplicationBuilder(StudyRoomApplication.class, FrontendRoutes.class).run(
          "--media.fixture.frontend=true", "--media.fixture.in-memory-session=false",
          "--server.address=127.0.0.1", "--server.port=0", "--spring.main.banner-mode=off", "--logging.level.root=WARN",
          "--server.ssl.enabled=true", "--server.ssl.key-store=" + evidence.resolve("tls.p12").toUri(),
          "--server.ssl.key-store-type=PKCS12", "--server.ssl.key-store-password=local-fixture-only",
          "--spring.datasource.url=" + mysql.databaseUrl, "--spring.datasource.username=root", "--spring.datasource.password=",
          "--spring.datasource.hikari.maximum-pool-size=4", "--spring.datasource.hikari.minimum-idle=1",
          "--spring.session.store-type=redis", "--spring.redis.host=127.0.0.1", "--spring.redis.port=" + redisPort,
          "--spring.redis.password=" + redisPassword, "--spring.session.redis.namespace=media-browser:" + UUID.randomUUID(),
          "--spring.flyway.locations=classpath:db/migration,classpath:db/media-migration",
          "--spring.web.resources.static-locations=" + evidence.resolve("frontend/dist").toUri() + "/",
          "--studyroom.upload-dir=" + scratch.resolve("uploads"), "--studyroom.media.private-root=" + scratch.resolve("private"),
          "--studyroom.media.enabled=true", "--studyroom.stickers.enabled=true", "--studyroom.community.enabled=true", "--studyroom.scenes.enabled=true", "--studyroom.media.worker-jar=" + Path.of(required("media.worker.jar")).toAbsolutePath(),
          "--studyroom.upload-quota.minimum-free-space=0", "--studyroom.readiness.minimum-free-space=0",
          "--studyroom.auth-security.concurrent-sessions=true", "--studyroom.auth-security.secure-cookie=true",
          "--studyroom.auth-security.login.maximum-attempts=" + (Boolean.getBoolean("media.browser.matrix") || Boolean.getBoolean("media.browser.responses") ? 30 : 10),
          "--studyroom.auth-security.production-mode=false", "--studyroom.cors.production-mode=false", "--studyroom.cors.allow-all=false",
          "--studyroom.cors.allowed-origin-patterns=https://127.0.0.1:[*],https://desktop.moyustation.xyz",
          "--studyroom.admin.versioned-access-enabled="+Boolean.getBoolean("media.browser.adminAccess"),
          "--studyroom.activity.enabled="+Boolean.getBoolean("media.browser.feedback"),
          "--studyroom.admin.versioned-records-enabled="+Boolean.getBoolean("media.browser.adminAccess"),
          "--studyroom.client-updates.versioned-policy-enabled="+Boolean.getBoolean("media.browser.adminAccess"),
          "--studyroom.reliable-create.enabled="+(Boolean.getBoolean("media.browser.adminAccess")||Boolean.getBoolean("media.browser.feedback")),
          "--studyroom.invitation.pepper="+UUID.randomUUID(),
          "--studyroom.client-updates.enabled=false", "--studyroom.radio-relay.enabled=false");
      assertThat(app.getBean(SessionRepository.class).getClass().getName()).contains("Redis");
      String password = "local-" + UUID.randomUUID();
      var jdbc = app.getBean(JdbcTemplate.class);
      String hash = app.getBean(PasswordService.class).encode(password);
      for (int id = 1; id <= 3; id++) jdbc.update("INSERT INTO sr_user(id,username,password_hash,nickname,login_version) VALUES (?,?,?,?,?)",
          id, "live-fixture-" + id, hash, "联调成员" + id, UUID.randomUUID().toString());
      if(Boolean.getBoolean("media.browser.adminAccess")){
        jdbc.update("UPDATE sr_user SET user_type='ADMIN' WHERE id=1");
        for(int id=100;id<135;id++)jdbc.update("INSERT INTO sr_invitation(id,label,code_digest,code_hint,created_by,created_at) VALUES(?,? ,?,'test',1,'2026-09-29 10:00:00')",id,"分页样本-"+id,String.format("%064d",id));
      }
      if (Boolean.getBoolean("media.browser.redisOnly")) {
        MediaRedisLifecycleProbe.verify(app, probe, ownedRedis, redisBinary, config, evidence);
        return;
      }
      var builder = new ProcessBuilder(node.toString(), script.toString()).directory(evidence.toFile())
          .redirectErrorStream(true).redirectOutput(evidence.resolve("browser.log").toFile());
      Files.write(evidence.resolve("qualified-input.gif"), AnimatedGifProcessorTest.fixture(1024,512,4,7,0));
      builder.environment().put("MEDIA_FIXTURE_ORIGIN", "https://127.0.0.1:" + app.getWebServer().getPort());
      builder.environment().put("MEDIA_FIXTURE_PASSWORD", password);
      builder.environment().put("MEDIA_FIXTURE_EVIDENCE",evidence.toString());
      Path control = Files.createDirectory(scratch.resolve("control"));
      builder.environment().put("MEDIA_FIXTURE_CONTROL", control.toString());
      builder.environment().put("MEDIA_FAILURE_MATRIX", Boolean.getBoolean("media.browser.matrix") ? "1" : "0");
      builder.environment().put("MEDIA_RESPONSE_MATRIX", Boolean.getBoolean("media.browser.responses") ? "1" : "0");
      builder.environment().put("MEDIA_LAYOUT_MATRIX", Boolean.getBoolean("media.browser.layout") ? "1" : "0");
      browser = builder.start();
      long browserDeadline = System.nanoTime() + Duration.ofMinutes(Boolean.getBoolean("media.browser.layout") ? 12 : 6).toNanos();
      while (browser.isAlive() && System.nanoTime() < browserDeadline) {
        processFixtureCommand(control, app);
        browser.waitFor(100, TimeUnit.MILLISECONDS);
      }
      assertThat(!browser.isAlive()).as("browser deadline; inspect external browser.log").isTrue();
      assertThat(browser.exitValue()).as("browser/Electron QA; inspect external browser.log").isZero();
      mysql.verifyOwnership();
      assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_media_publication", Integer.class)).isGreaterThanOrEqualTo(2);
      if(Boolean.getBoolean("media.browser.feedback")){
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_activity_interval WHERE user_id=1",Integer.class)).isPositive();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_activity_day WHERE user_id=1 AND online_ms>0",Integer.class)).isPositive();
        assertThat(jdbc.queryForObject("SELECT COUNT(DISTINCT session_id) FROM sr_activity_stream WHERE user_id=1",Integer.class)).isGreaterThanOrEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_chat_message WHERE message_type='IMAGE' AND ((sender_id=1 AND receiver_id=2) OR (sender_id=2 AND receiver_id=1))",Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_post_like",Integer.class)).isPositive();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_post_comment",Integer.class)).isPositive();
        Files.writeString(evidence.resolve("database-result.json"),"{\"activity\":true,\"likes\":true,\"comments\":true,\"mediaPublications\":"+jdbc.queryForObject("SELECT COUNT(*) FROM sr_media_publication",Integer.class)+"}");
      }else if(Boolean.getBoolean("media.browser.adminAccess")){
        assertThat(jdbc.queryForObject("SELECT enabled FROM sr_client_update_membership WHERE user_id=3 AND channel='stable'",Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT admin_version FROM sr_client_update_membership WHERE user_id=3 AND channel='stable'",Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_admin_audit WHERE action_code IN ('UPDATE_MEMBERSHIP_GRANTED','UPDATE_MEMBERSHIP_REVOKED')",Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_invitation WHERE label='真实双端邀请码' AND status='DISABLED' AND admin_version=1",Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_admin_audit WHERE action_code='INVITATION_DISABLED'",Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_media_reference",Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_media_asset WHERE unreferenced_at_ms IS NOT NULL AND retired_at_ms IS NULL",Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_post WHERE deleted_by_user=1 OR deleted_by_admin=1",Integer.class)).isEqualTo(2);
        Files.writeString(evidence.resolve("database-result.json"),"{\"passed\":true,\"memberVersion\":2,\"memberAudits\":2,\"disabledInvitations\":1,\"references\":0,\"assetsInGrace\":2,\"deletedPosts\":2}");
      } else for (String content : List.of("可靠文字桌面验收", "可靠文字网页验收")) {
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_chat_message WHERE sender_id=1 AND receiver_id=2 AND content=? AND client_message_id IS NOT NULL", Integer.class, content)).isEqualTo(1);
      }
    } finally {
      try { if (browser != null && browser.isAlive()) stopOwned(browser); }
      finally {
        try { if (app != null) { app.getBean(FixtureNetworkGate.class).responses.releaseAll(); app.close(); } }
        finally {
          try { if (mysql != null) mysql.close(); }
          finally { try { probe.shutdown(); } finally { stopOwned(ownedRedis[0]); } }
        }
      }
    }
  }

  private static String required(String key) {
    String value = System.getProperty(key); assertThat(value).as(key + " must be explicit").isNotBlank(); return value;
  }
  @SuppressWarnings({"rawtypes", "unchecked"})
  private static void processFixtureCommand(Path control, ServletWebServerApplicationContext app) throws Exception {
    Path request = control.resolve("request.json");
    if (!Files.exists(request)) return;
    var json = new com.fasterxml.jackson.databind.ObjectMapper();
    var command = json.readTree(Files.readString(request));
    String operation = command.path("operation").asText();
    if (operation.startsWith("response-")) {
      writeFixtureResponse(control, app.getBean(FixtureNetworkGate.class).responses.command(command, app));
      return;
    }
    assertThat(Set.of("expire-web-idle", "expire-desktop-absolute", "disconnect-socket", "interrupt-session-network", "restore-session-network")).contains(operation);
    String id = command.path("sessionId").asText();
    assertThat(id).matches("[a-f0-9-]{36}");
    SessionRepository repository = app.getBean(SessionRepository.class);
    org.springframework.session.Session session = repository.findById(id);
    assertThat(session).as("fixture session must exist before expiry injection").isNotNull();
    assertThat((Long) session.getAttribute(com.studyroom.service.AuthService.SESSION_USER_ID))
        .isEqualTo(command.path("userId").asLong());
    boolean networkCommand = operation.equals("disconnect-socket") || operation.equals("interrupt-session-network") || operation.equals("restore-session-network");
    if (operation.equals("restore-session-network")) {
      assertThat(app.getBean(FixtureNetworkGate.class).blocked.remove(id)).isTrue();
    } else if (networkCommand) {
      if (operation.equals("interrupt-session-network")) app.getBean(FixtureNetworkGate.class).blocked.add(id);
      var closed = new java.util.concurrent.atomic.AtomicInteger();
      app.getBean(com.studyroom.service.ChatSocketHub.class).sendToUserIf(command.path("userId").asLong(), "UNUSED", null, socket -> {
        if (id.equals(socket.getAttributes().get(com.studyroom.security.SocketSessionGuard.SESSION_ID))) {
          try { socket.close(org.springframework.web.socket.CloseStatus.GOING_AWAY); closed.incrementAndGet(); }
          catch (java.io.IOException error) { throw new IllegalStateException(error); }
        }
        return false;
      });
      assertThat(closed.get()).as("must disconnect at least one actual owned socket").isPositive();
    } else if (operation.equals("expire-web-idle")) {
      session.setMaxInactiveInterval(Duration.ofSeconds(1));
      session.setLastAccessedTime(java.time.Instant.now().minusSeconds(120));
    } else {
      assertThat((Boolean) session.getAttribute(com.studyroom.security.SessionPolicyInterceptor.REMEMBERED_ATTRIBUTE)).isTrue();
      session.setAttribute(com.studyroom.security.SessionPolicyInterceptor.CREATED_AT_ATTRIBUTE, System.currentTimeMillis() - Duration.ofDays(31).toMillis());
    }
    if (!networkCommand) repository.save(session);
    if (operation.equals("expire-web-idle")) assertThat(repository.findById(id)).as("Redis must treat the injected idle deadline as expired").isNull();
    writeFixtureResponse(control, Map.of("operation", operation, "applied", true));
  }
  private static void writeFixtureResponse(Path control, Map<String, ?> result) throws Exception {
    Files.delete(control.resolve("request.json"));
    Path response = control.resolve("response.tmp");
    Files.writeString(response, new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(result));
    Files.move(response, control.resolve("response.json"), StandardCopyOption.REPLACE_EXISTING);
  }
  @org.springframework.boot.test.context.TestConfiguration
  @org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name = "media.fixture.frontend", havingValue = "true")
  static class FrontendRoutes {
    @org.springframework.context.annotation.Bean
    FixtureNetworkGate fixtureNetworkGate() { return new FixtureNetworkGate(); }

    @org.springframework.context.annotation.Bean
    org.springframework.boot.web.servlet.FilterRegistrationBean<FixtureNetworkGate> fixtureNetworkFilter(FixtureNetworkGate gate) {
      var registration = new org.springframework.boot.web.servlet.FilterRegistrationBean<>(gate);
      // Runs after Spring Session; only present in this explicit local fixture.
      registration.setOrder(org.springframework.core.Ordered.LOWEST_PRECEDENCE);
      return registration;
    }
    @org.springframework.context.annotation.Bean
    org.springframework.web.servlet.config.annotation.WebMvcConfigurer localFrontendRoutes() {
      return new org.springframework.web.servlet.config.annotation.WebMvcConfigurer() {
        @Override public void addViewControllers(org.springframework.web.servlet.config.annotation.ViewControllerRegistry routes) {
          for (String path : List.of("/login", "/feed", "/chat", "/profile", "/scene", "/admin", "/sound", "/focus")) routes.addViewController(path).setViewName("forward:/index.html");
        }
      };
    }
  }
  static class FixtureNetworkGate extends org.springframework.web.filter.OncePerRequestFilter {
    final Set<String> blocked = java.util.concurrent.ConcurrentHashMap.newKeySet();
    final MediaResponseFaults responses = new MediaResponseFaults();
    @Override protected void doFilterInternal(javax.servlet.http.HttpServletRequest request,
        javax.servlet.http.HttpServletResponse response, javax.servlet.FilterChain chain)
        throws javax.servlet.ServletException, java.io.IOException {
      var session = request.getSession(false);
      if (session != null && blocked.contains(session.getId())) {
        response.setStatus(503);
        response.setHeader("Cache-Control", "no-store");
        return;
      }
      responses.filter(request, response, chain);
    }
  }
  static void stopOwned(Process process) throws InterruptedException {
    if (!process.isAlive()) return;
    var children = process.descendants().toList();
    children.forEach(ProcessHandle::destroy); process.destroy();
    if (!process.waitFor(5, TimeUnit.SECONDS)) process.destroyForcibly();
    for (var child : children) if (child.isAlive()) child.destroyForcibly();
    assertThat(process.waitFor(5, TimeUnit.SECONDS)).isTrue();
  }
}
