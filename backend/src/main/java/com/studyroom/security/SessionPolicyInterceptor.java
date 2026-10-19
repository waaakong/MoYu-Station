package com.studyroom.security;

import com.studyroom.common.BusinessException;
import com.studyroom.common.ErrorCode;
import com.studyroom.config.AuthSecurityProperties;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;
import java.time.Clock;

@Component
public class SessionPolicyInterceptor implements HandlerInterceptor {
  public static final String REMEMBERED_ATTRIBUTE = "STUDYROOM_DESKTOP_REMEMBERED";
  public static final String CREATED_AT_ATTRIBUTE = "STUDYROOM_SESSION_CREATED_AT";
  public static final String COOKIE_REFRESHED_AT_ATTRIBUTE = "STUDYROOM_COOKIE_REFRESHED_AT";
  private final AuthSecurityProperties properties;
  private final Clock clock;

  @Autowired
  public SessionPolicyInterceptor(AuthSecurityProperties properties) {
    this(properties, Clock.systemUTC());
  }

  SessionPolicyInterceptor(AuthSecurityProperties properties, Clock clock) {
    this.properties = properties;
    this.clock = clock;
  }

  @Override
  public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
    HttpSession session = request.getSession(false);
    if (session == null || !Boolean.TRUE.equals(session.getAttribute(REMEMBERED_ATTRIBUTE))) return true;
    long now = clock.millis();
    long createdAt = readLong(session.getAttribute(CREATED_AT_ATTRIBUTE), now);
    if (now - createdAt >= properties.getDesktopSessionLifetime().toMillis()) {
      session.invalidate();
      throw new BusinessException(ErrorCode.AUTH_SESSION_EXPIRED, "登录已过期，请重新登录。");
    }
    long refreshedAt = readLong(session.getAttribute(COOKIE_REFRESHED_AT_ATTRIBUTE), createdAt);
    if (now - refreshedAt >= properties.getDesktopCookieRefresh().toMillis()) {
      request.changeSessionId();
      session.setAttribute(COOKIE_REFRESHED_AT_ATTRIBUTE, now);
    }
    return true;
  }

  private long readLong(Object value, long fallback) {
    return value instanceof Number number ? number.longValue() : fallback;
  }
}
