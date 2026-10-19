package com.studyroom.security;

import com.studyroom.config.AuthSecurityProperties;
import com.studyroom.service.AuthService;
import com.studyroom.service.ChatService;
import java.time.Clock;
import java.util.Objects;
import java.util.function.Function;
import javax.servlet.http.HttpSession;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;
import org.springframework.session.Session;
import org.springframework.session.SessionRepository;
import org.springframework.web.socket.WebSocketSession;

/** Checks live session storage AND account revocation epoch on every incoming/outgoing frame. */
@Component
public class SocketSessionGuard {
  public static final String HTTP_SESSION = SocketSessionGuard.class.getName() + ".http";
  public static final String SESSION_ID = SocketSessionGuard.class.getName() + ".id";
  private final ObjectProvider<SessionRepository> repositories;
  private final ChatService accounts;
  private final AuthSecurityProperties properties;
  private final Clock clock = Clock.systemUTC();

  public SocketSessionGuard(ObjectProvider<SessionRepository> repositories, ChatService accounts, AuthSecurityProperties properties) {
    this.repositories = repositories; this.accounts = accounts; this.properties = properties;
  }

  public void check(WebSocketSession socket) {
    var attributes = socket.getAttributes();
    Object id = attributes.get(SESSION_ID);
    if (!(id instanceof String sessionId)) throw new IllegalStateException("SOCKET_SESSION_ENDED");
    Function<String, Object> read;
    SessionRepository repository = repositories.getIfAvailable();
    if (repository != null) {
      Session session = repository.findById(sessionId);
      if (session == null || session.isExpired()) throw new IllegalStateException("SOCKET_SESSION_ENDED");
      read = session::getAttribute;
    } else {
      // Servlet-only local mode; never use this fallback when a configured repository is unavailable.
      Object reference = attributes.get(HTTP_SESSION);
      if (!(reference instanceof HttpSession session) || !sessionId.equals(session.getId())) throw new IllegalStateException("SOCKET_SESSION_ENDED");
      session.getCreationTime(); // Throws on invalidation, including explicit logout.
      if (session.getMaxInactiveInterval() > 0 && clock.millis() - session.getLastAccessedTime() >= session.getMaxInactiveInterval() * 1000L) {
        throw new IllegalStateException("SOCKET_SESSION_EXPIRED");
      }
      read = session::getAttribute;
    }
    Object user = read.apply(AuthService.SESSION_USER_ID), version = read.apply(AuthService.SESSION_LOGIN_VERSION);
    if (!(user instanceof Long userId) || !(version instanceof String loginVersion)
        || !Objects.equals(user, attributes.get(AuthService.SESSION_USER_ID))
        || !Objects.equals(version, attributes.get(AuthService.SESSION_LOGIN_VERSION))) throw new IllegalStateException("SOCKET_SESSION_ENDED");
    if (Boolean.TRUE.equals(read.apply(SessionPolicyInterceptor.REMEMBERED_ATTRIBUTE))) {
      Object created = read.apply(SessionPolicyInterceptor.CREATED_AT_ATTRIBUTE);
      if (!(created instanceof Number timestamp) || clock.millis() - timestamp.longValue() >= properties.getDesktopSessionLifetime().toMillis()) {
        throw new IllegalStateException("SOCKET_SESSION_EXPIRED");
      }
    }
    accounts.requireSocketUser(userId, loginVersion);
  }
}
