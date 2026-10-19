package com.studyroom.media;

import com.studyroom.service.AuthService;
import io.lettuce.core.RedisClient;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.KeyStore;
import java.time.*;
import java.util.*;
import javax.net.ssl.*;
import org.springframework.boot.web.servlet.context.ServletWebServerApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.session.*;
import static org.assertj.core.api.Assertions.*;

/** Separate fixture mode: actual owned Redis process stop/restart, not HTTP route mocking. */
final class MediaRedisLifecycleProbe {
  @SuppressWarnings({"rawtypes", "unchecked"})
  static void verify(ServletWebServerApplicationContext app, RedisClient probe, Process[] owned,
      Path binary, Path config, Path evidence) throws Exception {
    SessionRepository repository = app.getBean(SessionRepository.class);
    List<String> checks = new ArrayList<>();
    Path result = evidence.resolve("redis-lifecycle-result.json");
    var json = new com.fasterxml.jackson.databind.ObjectMapper();
    Files.writeString(result, json.writeValueAsString(Map.of("passed", false, "status", "running")));
    try {
      Session session = repository.createSession();
      session.setAttribute(AuthService.SESSION_USER_ID, 1L);
      session.setAttribute(AuthService.SESSION_LOGIN_VERSION,
          app.getBean(JdbcTemplate.class).queryForObject("SELECT login_version FROM sr_user WHERE id=1", String.class));
      repository.save(session);
      var client = tlsClient(evidence);
      String cookie = "STUDYROOM_SESSION=" + Base64.getEncoder().encodeToString(session.getId().getBytes(StandardCharsets.UTF_8));
      // /auth/me intentionally returns 200 + null for guests; use an actually protected resource.
      URI endpoint = URI.create("https://127.0.0.1:" + app.getWebServer().getPort() + "/api/chat/hall/messages");
      assertThat(status(client, endpoint, cookie)).isEqualTo(200);
      Session inFlight = repository.findById(session.getId());
      inFlight.setAttribute(AuthService.SESSION_USER_ID, 1L);
      inFlight.setAttribute(AuthService.SESSION_LOGIN_VERSION, session.getAttribute(AuthService.SESSION_LOGIN_VERSION));
      inFlight.setLastAccessedTime(Instant.now());
      repository.deleteById(session.getId());
      try { repository.save(inFlight); }
      catch (IllegalStateException explicitlyRejected) { checks.add("late save explicitly rejected"); }
      assertThat(repository.findById(session.getId())).as("logout must not resurrect an in-flight session").isNull();
      assertThat(status(client, endpoint, cookie)).isEqualTo(401);
      checks.add("delete versus stale authenticated save: revoked session remains absent and HTTP rejects");

      Session live = repository.createSession(); live.setAttribute(AuthService.SESSION_USER_ID, 1L);
      live.setAttribute(AuthService.SESSION_LOGIN_VERSION, session.getAttribute(AuthService.SESSION_LOGIN_VERSION)); repository.save(live);
      String liveCookie = "STUDYROOM_SESSION=" + Base64.getEncoder().encodeToString(live.getId().getBytes(StandardCharsets.UTF_8));
      assertThat(status(client, endpoint, liveCookie)).isEqualTo(200);
      MediaBrowserServerIT.stopOwned(owned[0]);
      assertThatThrownBy(() -> repository.findById(live.getId())).isInstanceOf(RuntimeException.class);
      assertThat(status(client, endpoint, liveCookie)).as("outage cannot fall back to anonymous success").isBetween(500, 599);
      checks.add("actual Redis process stopped: repository errors and authenticated HTTP fails closed");
      owned[0] = new ProcessBuilder(binary.toString(), config.getFileName().toString()).directory(config.getParent().toFile())
          .redirectErrorStream(true).redirectOutput(evidence.resolve("redis-restart.log").toFile()).start();
      long deadline = System.nanoTime() + Duration.ofSeconds(15).toNanos(); boolean ready = false;
      while (System.nanoTime() < deadline && owned[0].isAlive()) {
        try (var connection = probe.connect()) { if ("PONG".equals(connection.sync().ping())) { ready = true; break; } }
        catch (RuntimeException unavailable) { Thread.sleep(100); }
      }
      assertThat(ready).isTrue();
      assertThat(repository.findById(live.getId())).isNull();
      assertThat(status(client, endpoint, liveCookie)).isEqualTo(401);
      checks.add("owned non-persistent Redis restarted: lost sessions stay invalid, no anonymous fallback");
      Files.writeString(result, json.writerWithDefaultPrettyPrinter().writeValueAsString(Map.of("passed", true, "checks", checks,
          "limits", List.of("Windows community Redis, not Linux", "restart without persistence; durable crash recovery remains unverified"))));
    } catch (Throwable failure) {
      Files.writeString(result, json.writerWithDefaultPrettyPrinter().writeValueAsString(Map.of("passed", false, "checks", checks,
          "failure", failure.getClass().getSimpleName() + ": " + failure.getMessage())));
      throw failure;
    }
  }
  private static int status(HttpClient client, URI endpoint, String cookie) throws Exception {
    return client.send(HttpRequest.newBuilder(endpoint).timeout(Duration.ofSeconds(12)).header("Cookie", cookie).GET().build(),
        HttpResponse.BodyHandlers.discarding()).statusCode();
  }
  private static HttpClient tlsClient(Path evidence) throws Exception {
    KeyStore keys = KeyStore.getInstance("PKCS12");
    try (var stream = Files.newInputStream(evidence.resolve("tls.p12"))) { keys.load(stream, "local-fixture-only".toCharArray()); }
    var trust = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()); trust.init(keys);
    SSLContext ssl = SSLContext.getInstance("TLS"); ssl.init(null, trust.getTrustManagers(), null);
    return HttpClient.newBuilder().sslContext(ssl).connectTimeout(Duration.ofSeconds(3)).build();
  }
}
