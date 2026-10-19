package com.studyroom.media;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyroom.service.AuthService;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.*;
import javax.servlet.*;
import javax.servlet.http.*;
import org.springframework.context.ApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.session.SessionRepository;
import org.springframework.web.util.ContentCachingRequestWrapper;
import org.springframework.web.util.ContentCachingResponseWrapper;
import static org.assertj.core.api.Assertions.*;

/** Owned integration-test faults only. No production bean or network control endpoint. */
final class MediaResponseFaults {
  private final Map<String, Fault> faults = new ConcurrentHashMap<>();
  private final ObjectMapper json = new ObjectMapper();

  Map<String, Object> command(JsonNode input, ApplicationContext app) {
    String operation = input.path("operation").asText();
    assertThat(Set.of("response-arm", "response-status", "response-release", "response-verify")).contains(operation);
    String id = input.path("faultId").asText(), sessionId = input.path("sessionId").asText();
    assertThat(id).matches("[a-f0-9-]{36}");
    assertThat(sessionId).matches("[a-f0-9-]{36}");
    long owner = input.path("userId").asLong();
    if (operation.equals("response-arm")) {
      var session = app.getBean(SessionRepository.class).findById(sessionId);
      assertThat(session).isNotNull();
      assertThat((Long) session.getAttribute(AuthService.SESSION_USER_ID)).isEqualTo(owner);
      String mode = input.path("mode").asText();
      assertThat(Set.of("late-upload", "lost-publication")).contains(mode);
      assertThat(faults.putIfAbsent(id, new Fault(sessionId, owner, mode))).isNull();
    }
    Fault fault = faults.get(id);
    assertThat(fault).isNotNull();
    assertThat(fault.sessionId).isEqualTo(sessionId);
    assertThat(fault.owner).isEqualTo(owner);
    if (operation.equals("response-release")) {
      assertThat(fault.state).isEqualTo("held");
      fault.release.countDown();
    }
    var result = new LinkedHashMap<String, Object>();
    result.put("operation", operation); result.put("applied", true);
    result.put("state", fault.state); result.put("originalStatus", fault.originalStatus);
    result.put("requestId", fault.requestId); result.put("assetId", fault.assetId);
    result.put("targetId", fault.targetId);
    if (operation.equals("response-verify")) {
      assertThat(fault.state).isEqualTo("finished");
      assertThat(fault.originalStatus).isEqualTo(200);
      var jdbc = app.getBean(JdbcTemplate.class);
      if (fault.mode.equals("late-upload")) {
        assertThat(app.getBean(SessionRepository.class).findById(sessionId)).as("late response must not revive logged-out session").isNull();
        int owners = jdbc.queryForObject("SELECT COUNT(*) FROM sr_media_asset WHERE client_upload_id=? AND owner_id=?", Integer.class, fault.requestId, owner);
        int others = jdbc.queryForObject("SELECT COUNT(*) FROM sr_media_asset WHERE client_upload_id=? AND owner_id<>?", Integer.class, fault.requestId, owner);
        int refs = jdbc.queryForObject("SELECT COUNT(*) FROM sr_media_reference WHERE asset_id=?", Integer.class, fault.assetId);
        assertThat(owners).isEqualTo(1); assertThat(others).isZero(); assertThat(refs).isZero();
        result.put("ownerAssets", owners); result.put("otherAssets", others); result.put("references", refs);
      } else {
        int publications = jdbc.queryForObject("SELECT COUNT(*) FROM sr_media_publication WHERE owner_id=? AND request_id=? AND target_id=?", Integer.class, owner, fault.requestId, fault.targetId);
        int posts = jdbc.queryForObject("SELECT COUNT(*) FROM sr_post WHERE user_id=? AND content=?", Integer.class, owner, fault.content);
        assertThat(publications).isEqualTo(1); assertThat(posts).isEqualTo(1);
        result.put("publications", publications); result.put("posts", posts);
      }
    }
    return result;
  }

  void filter(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
    var session = request.getSession(false);
    Fault selected = null;
    if (session != null && request.getMethod().equals("POST")) {
      for (Fault fault : faults.values()) {
        String path = fault.mode.equals("late-upload") ? "/api/media/assets" : "/api/media/publications";
        if (fault.sessionId.equals(session.getId()) && path.equals(request.getRequestURI())) {
          synchronized (fault) { if (fault.state.equals("armed")) { fault.state = "processing"; selected = fault; break; } }
        }
      }
    }
    if (selected == null) { chain.doFilter(request, response); return; }
    Fault fault = selected;
    var cachedRequest = new ContentCachingRequestWrapper(request, 16 * 1024);
    var cachedResponse = new ContentCachingResponseWrapper(response);
    try {
      chain.doFilter(cachedRequest, cachedResponse);
      fault.originalStatus = cachedResponse.getStatus();
      JsonNode envelope = json.readTree(cachedResponse.getContentAsByteArray());
      if (fault.originalStatus != 200 || !envelope.path("success").asBoolean()) throw new IOException("Fixture expected successful real response");
      if (fault.mode.equals("late-upload")) {
        fault.requestId = request.getParameter("clientUploadId");
        fault.assetId = envelope.path("data").path("asset").path("id").asText();
        assertThat(fault.assetId).matches("[a-f0-9-]{36}");
      } else {
        JsonNode command = json.readTree(cachedRequest.getContentAsByteArray());
        fault.requestId = command.path("requestId").asText();
        fault.content = command.path("content").asText();
        fault.targetId = envelope.path("data").path("targetId").asLong();
        assertThat(fault.targetId).isPositive();
      }
      fault.state = "held";
      if (!fault.release.await(75, TimeUnit.SECONDS)) throw new IOException("Owned response fault was not released");
      if (fault.mode.equals("lost-publication")) {
        // The actual transaction has committed. Discard its successful body like a failing gateway.
        response.resetBuffer(); response.setStatus(502); response.setHeader("Cache-Control", "no-store");
        response.setContentLength(0);
      } else cachedResponse.copyBodyToResponse();
    } catch (InterruptedException error) { Thread.currentThread().interrupt(); throw new IOException(error); }
    finally { fault.state = "finished"; }
  }

  void releaseAll() { faults.values().forEach(fault -> fault.release.countDown()); }
  private static final class Fault {
    final String sessionId, mode;
    final long owner;
    final CountDownLatch release = new CountDownLatch(1);
    volatile String state = "armed", requestId = "", assetId = "", content = "";
    volatile int originalStatus;
    volatile long targetId;
    Fault(String sessionId, long owner, String mode) { this.sessionId = sessionId; this.owner = owner; this.mode = mode; }
  }
}
