package com.studyroom.media;

import com.fasterxml.jackson.databind.*;
import com.studyroom.StudyRoomApplication;
import com.studyroom.security.PasswordService;
import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.servlet.context.ServletWebServerApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.session.MapSessionRepository;
import org.springframework.session.config.annotation.web.http.EnableSpringHttpSession;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Actual loopback HTTP/WebSocket + owned MySQL + packaged worker, not MockMvc or browser mocks.
 * Session storage is the real Spring Session filter with an isolated in-memory repository, NOT production Redis.
 */
class MediaHttpServerIT {
  @TempDir static Path root;
  static EphemeralMysql mysql;
  static ServletWebServerApplicationContext app;
  static ServerSocket unavailableRedis;
  static JdbcTemplate jdbc;
  static String origin;
  static final String PASSWORD = "local-fixture-" + UUID.randomUUID();
  static final ObjectMapper JSON = new ObjectMapper();
  static String hash;

  @BeforeAll static void start() throws Exception {
    String binary = System.getProperty("media.mysql.binary");
    assertThat(binary).as("explicit isolated mysqld binary required").isNotBlank();
    mysql = EphemeralMysql.start(root, Path.of(binary)); mysql.verifyOwnership();
    var datasource = new DriverManagerDataSource(mysql.databaseUrl, "root", ""); jdbc = new JdbcTemplate(datasource);
    Flyway.configure().dataSource(datasource).locations("classpath:db/migration", "classpath:db/media-migration").cleanDisabled(true).load().migrate();
    // Reserve our own unavailable Redis port: no chance of touching an existing Redis instance.
    unavailableRedis = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"));
    app = (ServletWebServerApplicationContext) new SpringApplicationBuilder(StudyRoomApplication.class, LocalSessions.class).run(
        "--server.address=127.0.0.1", "--server.port=0", "--spring.main.banner-mode=off", "--logging.level.root=WARN",
        "--spring.datasource.url=" + mysql.databaseUrl, "--spring.datasource.username=root", "--spring.datasource.password=",
        "--spring.datasource.hikari.maximum-pool-size=4", "--spring.datasource.hikari.minimum-idle=1",
        "--media.fixture.in-memory-session=true", "--spring.session.store-type=none", "--spring.redis.host=127.0.0.1", "--spring.redis.port=" + unavailableRedis.getLocalPort(),
        "--spring.redis.password=", "--spring.redis.timeout=100ms", "--spring.redis.connect-timeout=100ms",
        "--spring.flyway.locations=classpath:db/migration,classpath:db/media-migration",
        "--studyroom.upload-dir=" + root.resolve("uploads"), "--studyroom.media.private-root=" + root.resolve("private"),
        "--studyroom.media.enabled=true", "--studyroom.media.worker-jar=" + Path.of(System.getProperty("media.worker.jar")).toAbsolutePath(),
        "--studyroom.upload-quota.minimum-free-space=0", "--studyroom.readiness.minimum-free-space=0",
        "--studyroom.auth-security.concurrent-sessions=true", "--studyroom.auth-security.production-mode=false",
        "--studyroom.auth-security.secure-cookie=false", "--studyroom.cors.production-mode=false", "--studyroom.cors.allow-all=false",
        "--studyroom.cors.allowed-origin-patterns=http://127.0.0.1:[*],https://desktop.moyustation.xyz",
        "--studyroom.auth-security.login.maximum-attempts=100", "--studyroom.auth-security.login.fallback-maximum-attempts=100",
        "--studyroom.client-updates.enabled=false", "--studyroom.radio-relay.enabled=false");
    origin = "http://127.0.0.1:" + app.getWebServer().getPort();
    hash = app.getBean(PasswordService.class).encode(PASSWORD);
    for (int id = 1; id <= 3; id++) jdbc.update("INSERT INTO sr_user(id,username,password_hash,nickname,login_version) VALUES (?,?,?,?,?)",
        id, "http-fixture-" + id, hash, "fixture-" + id, UUID.randomUUID().toString());
  }

  @AfterAll static void stop() throws Exception {
    try { if (app != null) app.close(); }
    finally { try { if (unavailableRedis != null) unavailableRedis.close(); } finally { if (mysql != null) mysql.close(); } }
  }
  @BeforeEach void reset() throws Exception {
    mysql.verifyOwnership();
    // Only rows in this test-owned, freshly initialized instance.
    for (String table : List.of("sr_media_reference", "sr_media_publication", "sr_media_asset", "sr_chat_message_visibility", "sr_chat_message", "sr_private_conversation", "sr_post")) jdbc.update("DELETE FROM " + table);
    jdbc.update("UPDATE sr_user SET password_hash=?,user_type='NORMAL',deleted=0,force_password_change=0,login_version=UUID()", hash);
  }

  @Test void webAndDesktopCanStayLoggedInAndLogoutRevokesOnlyItsOwnHttpAndSocket() throws Exception {
    Client web = login(1, false), desktop = login(1, true);
    assertThat(web.me().statusCode()).isEqualTo(200); assertThat(desktop.me().statusCode()).isEqualTo(200);
    assertThat(web.cookie()).isNotEqualTo(desktop.cookie());
    try (Socket w = web.socket(); Socket d = desktop.socket()) {
      w.await("CONNECTED"); d.await("CONNECTED");
      assertThat(web.json("POST", "/api/auth/logout", Map.of()).statusCode()).isEqualTo(200);
      try { w.send("PING", Map.of()); }
      catch (ExecutionException alreadyClosedByAnOutboundFrame) {
        assertThat(alreadyClosedByAnOutboundFrame.getCause()).isInstanceOf(java.io.IOException.class);
      }
      assertThat(w.closed.get(8, TimeUnit.SECONDS)).isEqualTo(1008);
      d.send("PING", Map.of()); d.await("PONG");
      assertThat(desktop.me().statusCode()).isEqualTo(200);
      assertThat(web.get("/api/chat/hall/messages").statusCode()).isEqualTo(401);
    }
  }

  @Test void realPrivatePublicationIsIdempotentAndNotifiesBothSenderSessionsAndRecipientOnly() throws Exception {
    Client sender = login(1, false), senderDesktop = login(1, true), recipient = login(2, false), outsider = login(3, false);
    try (Socket a = sender.socket(); Socket same = senderDesktop.socket(); Socket b = recipient.socket(); Socket c = outsider.socket()) {
      a.await("CONNECTED"); same.await("CONNECTED"); b.await("CONNECTED"); c.await("CONNECTED");
      String uploadId = UUID.randomUUID().toString();
      var uploaded = sender.request("POST", "/api/media/assets?clientUploadId=" + uploadId, ImageFixtures.WEBP_LOSSLESS, "image/webp", sender.token, sender.requestOrigin);
      assertThat(uploaded.statusCode()).isEqualTo(200);
      String id = tree(uploaded).at("/data/asset/id").asText(); assertThat(id).isNotBlank();
      String resource = "/api/media/assets/" + id + "/clear";
      assertThat(recipient.get(resource).statusCode()).isEqualTo(404);
      assertThat(senderDesktop.get(resource).statusCode()).isEqualTo(200);
      assertThat(tree(sender.get("/api/media/uploads/" + uploadId)).at("/data/status").asText()).isEqualTo("ready");
      var command = command("PRIVATE", 2L, List.of(id), "private-caption");
      assertThat(sender.request("POST", "/api/media/publications", JSON.writeValueAsBytes(command), "application/json", null, sender.requestOrigin).statusCode()).isEqualTo(403);
      assertThat(sender.request("POST", "/api/media/publications", JSON.writeValueAsBytes(command), "application/json", sender.token, "https://untrusted.invalid").statusCode()).isEqualTo(403);
      var published = sender.json("POST", "/api/media/publications", command); assertThat(published.statusCode()).isEqualTo(200);
      a.await("MEDIA_PUBLICATION_COMMITTED"); same.await("MEDIA_PUBLICATION_COMMITTED"); b.await("MEDIA_PUBLICATION_COMMITTED");
      c.send("PING", Map.of()); c.await("PONG"); // Drain ordered frames before the non-recipient assertion.
      assertThat(c.messages.stream().noneMatch(message -> message.path("type").asText().equals("MEDIA_PUBLICATION_COMMITTED"))).isTrue();
      assertThat(sender.json("POST", "/api/media/publications", command).body()).isEqualTo(published.body());
      assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_chat_message", Integer.class)).isEqualTo(1);
      assertThat(recipient.get(resource).statusCode()).isEqualTo(200); assertThat(outsider.get(resource).statusCode()).isEqualTo(404);
      var thumb = recipient.get("/api/media/assets/" + id + "/thumb");
      assertThat(thumb.statusCode()).isEqualTo(200); assertThat(thumb.headers().firstValue("content-type")).contains("image/png");
      assertThat(thumb.headers().firstValue("cache-control").orElse("")).contains("no-store");
      assertThat(thumb.headers().firstValue("x-content-type-options")).contains("nosniff");
      assertThat(tree(recipient.get("/api/chat/private/1/messages")).path("data").toString()).contains(id, "private-caption");
    }
  }

  @Test void publicPostSurvivesIgnoredReplyAndKeepsImageOrderWithoutDuplicateRows() throws Exception {
    Client web = login(1, false), desktop = login(1, true), other = login(2, false);
    String first = upload(web), second = upload(web); var command = command("POST", null, List.of(second, first), "ordered-post");
    // Discard the response as a client with a lost receipt would, then query/replay the original immutable request.
    assertThat(web.json("POST", "/api/media/publications", command).statusCode()).isEqualTo(200);
    var lookup = desktop.get("/api/media/publications/" + command.get("requestId"));
    assertThat(tree(lookup).at("/data/status").asText()).isEqualTo("committed");
    assertThat(desktop.json("POST", "/api/media/publications", command).statusCode()).isEqualTo(200);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_post", Integer.class)).isEqualTo(1);
    var images = tree(other.get("/api/feed/posts")).at("/data/0/imageUrls");
    assertThat(images.get(0).asText()).contains(second); assertThat(images.get(1).asText()).contains(first);
    assertThat(other.get(images.get(0).asText()).statusCode()).isEqualTo(200);
  }

  @Test void passwordChangeRetainsCurrentHttpSessionButRevokesOtherSessionsAndOldSockets() throws Exception {
    Client web = login(1, false), desktop = login(1, true), peer = login(2, false);
    try (Socket old = desktop.socket(); Socket other = peer.socket()) {
      old.await("CONNECTED"); other.await("CONNECTED");
      assertThat(web.json("POST", "/api/profile/password", Map.of("oldPassword", PASSWORD, "newPassword", PASSWORD + "-new")).statusCode()).isEqualTo(200);
      assertThat(web.me().statusCode()).isEqualTo(200); assertThat(desktop.me().statusCode()).isEqualTo(401);
      // Inbound traffic from an unrelated account causes a broadcast; stale sockets must not receive its content.
      other.send("HALL_MESSAGE_SEND", Map.of("messageType", "TEXT", "content", "must-not-leak"));
      assertThat(old.closed.get(8, TimeUnit.SECONDS)).isEqualTo(1008);
      assertThat(old.messages.stream().noneMatch(message -> message.toString().contains("must-not-leak"))).isTrue();
    }
  }

  @Test void simultaneousLoginsKeepTheSameEpochAndBothSessionsUsable() throws Exception {
    var pool = Executors.newFixedThreadPool(2);
    try {
      String epoch = jdbc.queryForObject("SELECT login_version FROM sr_user WHERE id=1", String.class);
      var barrier = new CyclicBarrier(2);
      var web = pool.submit(() -> { barrier.await(); return login(1, false); });
      var desktop = pool.submit(() -> { barrier.await(); return login(1, true); });
      assertThat(web.get(15, TimeUnit.SECONDS).me().statusCode()).isEqualTo(200);
      assertThat(desktop.get(15, TimeUnit.SECONDS).me().statusCode()).isEqualTo(200);
      assertThat(jdbc.queryForObject("SELECT login_version FROM sr_user WHERE id=1", String.class)).isEqualTo(epoch);
    } finally { pool.shutdownNow(); }
  }

  @Test void expiredStoredSessionCannotReceiveBroadcastEvenWithAnOpenSocket() throws Exception {
    Client expired = login(1, false), peer = login(2, false);
    try (Socket old = expired.socket(); Socket other = peer.socket()) {
      old.await("CONNECTED"); other.await("CONNECTED");
      String cookie = expired.cookies.getCookieStore().getCookies().stream().filter(c -> c.getName().equals("STUDYROOM_SESSION")).findFirst().orElseThrow().getValue();
      String sessionId = new String(Base64.getDecoder().decode(cookie), java.nio.charset.StandardCharsets.UTF_8);
      var repository = app.getBean(MapSessionRepository.class); var stored = repository.findById(sessionId);
      assertThat(stored).isNotNull(); stored.setMaxInactiveInterval(Duration.ofSeconds(1)); stored.setLastAccessedTime(java.time.Instant.now().minusSeconds(10)); repository.save(stored);
      other.send("HALL_MESSAGE_SEND", Map.of("messageType", "TEXT", "content", "expired-must-not-leak"));
      assertThat(old.closed.get(8, TimeUnit.SECONDS)).isEqualTo(1008);
      assertThat(old.messages.stream().noneMatch(message -> message.toString().contains("expired-must-not-leak"))).isTrue();
      assertThat(expired.get("/api/chat/hall/messages").statusCode()).isEqualTo(401);
      assertThat(peer.me().statusCode()).isEqualTo(200);
    }
  }

  @ParameterizedTest @ValueSource(strings = {"password", "ban", "epoch"})
  void loginCompareAndSetCannotOverwriteConcurrentSecurityChanges(String change) throws Exception {
    var passwords = spy(app.getBean(PasswordService.class));
    var checked = new CountDownLatch(1); var release = new CountDownLatch(1);
    doAnswer(call -> { boolean valid = (boolean) call.callRealMethod(); checked.countDown();
      if (!release.await(8, TimeUnit.SECONDS)) throw new IllegalStateException("fixture gate timed out"); return valid;
    }).when(passwords).matches(anyString(), anyString());
    var auth = new com.studyroom.service.AuthService(app.getBean(com.studyroom.mapper.UserMapper.class), passwords,
        app.getBean(com.studyroom.service.InvitationService.class), app.getBean(com.studyroom.config.AuthSecurityProperties.class));
    var request = new com.studyroom.dto.LoginRequest(); request.setUsername("http-fixture-1"); request.setPassword(PASSWORD);
    var session = new org.springframework.mock.web.MockHttpSession(); var pool = Executors.newSingleThreadExecutor();
    try {
      var pending = pool.submit(() -> auth.login(request, session)); assertThat(checked.await(8, TimeUnit.SECONDS)).isTrue();
      switch (change) {
        case "password" -> jdbc.update("UPDATE sr_user SET password_hash=? WHERE id=1", hash + "-reset-fixture");
        case "ban" -> jdbc.update("UPDATE sr_user SET user_type='BANNED' WHERE id=1");
        case "epoch" -> jdbc.update("UPDATE sr_user SET login_version='revoked-fixture' WHERE id=1");
        default -> throw new AssertionError();
      }
      release.countDown();
      assertThatThrownBy(() -> pending.get(8, TimeUnit.SECONDS)).isInstanceOf(ExecutionException.class)
          .hasCauseInstanceOf(com.studyroom.common.BusinessException.class);
      assertThat(session.getAttribute(com.studyroom.service.AuthService.SESSION_USER_ID)).isNull();
      switch (change) {
        case "password" -> assertThat(jdbc.queryForObject("SELECT password_hash FROM sr_user WHERE id=1", String.class)).isEqualTo(hash + "-reset-fixture");
        case "ban" -> assertThat(jdbc.queryForObject("SELECT user_type FROM sr_user WHERE id=1", String.class)).isEqualTo("BANNED");
        case "epoch" -> assertThat(jdbc.queryForObject("SELECT login_version FROM sr_user WHERE id=1", String.class)).isEqualTo("revoked-fixture");
      }
    } finally { release.countDown(); pool.shutdownNow(); }
  }

  static String upload(Client client) throws Exception {
    var response = client.request("POST", "/api/media/assets?clientUploadId=" + UUID.randomUUID(), ImageFixtures.WEBP_LOSSLESS, "image/webp", client.token, client.requestOrigin);
    assertThat(response.statusCode()).isEqualTo(200); return tree(response).at("/data/asset/id").asText();
  }
  static Map<String, Object> command(String kind, Long recipient, List<String> assets, String content) {
    var command = new LinkedHashMap<String, Object>(); command.put("requestId", UUID.randomUUID().toString()); command.put("kind", kind);
    command.put("recipient", recipient); command.put("content", content); command.put("scene", kind.equals("POST") ? "default" : null); command.put("assets", assets); return command;
  }
  static Client login(int user, boolean desktop) throws Exception {
    Client client = new Client(desktop); client.csrf();
    var response = client.json("POST", "/api/auth/login", Map.of("username", "http-fixture-" + user, "password", PASSWORD, "rememberMe", desktop));
    assertThat(response.statusCode()).as("fixture login status").isEqualTo(200); client.csrf(); return client;
  }
  static JsonNode tree(HttpResponse<byte[]> response) throws Exception { return JSON.readTree(response.body()); }

  static final class Client {
    final CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
    final HttpClient http = HttpClient.newBuilder().cookieHandler(cookies).connectTimeout(Duration.ofSeconds(3)).build();
    final String requestOrigin; final boolean desktop; String token;
    Client(boolean desktop) { this.desktop = desktop; requestOrigin = desktop ? "https://desktop.moyustation.xyz" : origin; }
    void csrf() throws Exception { token = tree(get("/api/auth/csrf")).at("/data/token").asText(); assertThat(token).isNotBlank(); }
    HttpResponse<byte[]> me() throws Exception { return get("/api/auth/me"); }
    HttpResponse<byte[]> get(String path) throws Exception { return request("GET", path, null, null, null, requestOrigin); }
    HttpResponse<byte[]> json(String method, String path, Object body) throws Exception { return request(method, path, JSON.writeValueAsBytes(body), "application/json", token, requestOrigin); }
    HttpResponse<byte[]> request(String method, String path, byte[] body, String mime, String csrf, String source) throws Exception {
      var request = HttpRequest.newBuilder(URI.create(origin + path)).timeout(Duration.ofSeconds(25)).header("Origin", source);
      if (desktop) request.header("X-StudyRoom-Client", "desktop-v1");
      if (mime != null) request.header("Content-Type", mime); if (csrf != null) request.header("X-CSRF-Token", csrf);
      return http.send(request.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofByteArray(body)).build(), HttpResponse.BodyHandlers.ofByteArray());
    }
    String cookie() { return cookies.getCookieStore().getCookies().stream().filter(c -> !c.hasExpired()).map(c -> c.getName() + "=" + c.getValue()).reduce((a,b) -> a + "; " + b).orElse(""); }
    Socket socket() throws Exception {
      Socket listener = new Socket(); listener.connection = http.newWebSocketBuilder().header("Origin", requestOrigin)
          .buildAsync(URI.create(origin.replace("http:", "ws:") + "/ws/chat"), listener).get(8, TimeUnit.SECONDS); return listener;
    }
  }
  static final class Socket implements WebSocket.Listener, AutoCloseable {
    WebSocket connection; final List<JsonNode> messages = new CopyOnWriteArrayList<>(); final BlockingQueue<JsonNode> queue = new LinkedBlockingQueue<>();
    final CompletableFuture<Integer> closed = new CompletableFuture<>(); final StringBuilder buffer = new StringBuilder();
    @Override public void onOpen(WebSocket socket) { socket.request(1); }
    @Override public CompletionStage<?> onText(WebSocket socket, CharSequence text, boolean last) {
      buffer.append(text); if (last) { try { var message = JSON.readTree(buffer.toString()); messages.add(message); queue.add(message); } catch (Exception e) { closed.completeExceptionally(e); } buffer.setLength(0); }
      socket.request(1); return null;
    }
    @Override public CompletionStage<?> onClose(WebSocket socket, int status, String reason) { closed.complete(status); return null; }
    @Override public void onError(WebSocket socket, Throwable error) { closed.completeExceptionally(error); }
    void send(String type, Object payload) throws Exception { connection.sendText(JSON.writeValueAsString(Map.of("type", type, "payload", payload)), true).get(5, TimeUnit.SECONDS); }
    JsonNode await(String type) throws Exception {
      long end = System.nanoTime() + TimeUnit.SECONDS.toNanos(8);
      while (System.nanoTime() < end) { var message = queue.poll(100, TimeUnit.MILLISECONDS); if (message != null && message.path("type").asText().equals(type)) return message; }
      throw new AssertionError("Missing socket event: " + type);
    }
    @Override public void close() {
      if (connection == null) return;
      try {
        if (!connection.isOutputClosed()) connection.sendClose(WebSocket.NORMAL_CLOSURE, "fixture complete").get(3, TimeUnit.SECONDS);
        closed.get(3, TimeUnit.SECONDS);
      } catch (Exception alreadyClosedOrUnresponsive) { /* Owned fixture connection is aborted below. */ }
      finally { connection.abort(); }
    }
  }

  @org.springframework.boot.test.context.TestConfiguration
  @org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name = "media.fixture.in-memory-session", havingValue = "true")
  @EnableSpringHttpSession
  static class LocalSessions {
    @Bean MapSessionRepository sessionRepository() { return new MapSessionRepository(new ConcurrentHashMap<>()); }
  }
}
