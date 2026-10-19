package com.studyroom.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.studyroom.common.BusinessException;
import com.studyroom.common.ErrorCode;
import com.studyroom.config.AuthSecurityProperties;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

class SessionPolicyInterceptorTest {
  private static final long NOW = Instant.parse("2026-09-16T12:00:00Z").toEpochMilli();

  @Test
  void springSelectsTheProductionConstructor() {
    try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
      context.register(AuthSecurityProperties.class, SessionPolicyInterceptor.class);
      context.refresh();
      assertThat(context.getBean(SessionPolicyInterceptor.class)).isNotNull();
    }
  }

  @Test
  void rememberedDesktopSessionRotatesAfterTwentyFourHours() {
    AuthSecurityProperties properties = new AuthSecurityProperties();
    SessionPolicyInterceptor interceptor = new SessionPolicyInterceptor(
        properties,
        Clock.fixed(Instant.ofEpochMilli(NOW), ZoneOffset.UTC)
    );
    MockHttpSession session = rememberedSession(NOW - properties.getDesktopCookieRefresh().toMillis() - 1);
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.setSession(session);
    String previousId = session.getId();

    assertThat(interceptor.preHandle(request, new MockHttpServletResponse(), new Object())).isTrue();
    assertThat(session.getId()).isNotEqualTo(previousId);
    assertThat(session.getAttribute(SessionPolicyInterceptor.COOKIE_REFRESHED_AT_ATTRIBUTE)).isEqualTo(NOW);
  }

  @Test
  void absoluteLifetimeCannotBeExtendedByActivity() {
    AuthSecurityProperties properties = new AuthSecurityProperties();
    SessionPolicyInterceptor interceptor = new SessionPolicyInterceptor(
        properties,
        Clock.fixed(Instant.ofEpochMilli(NOW), ZoneOffset.UTC)
    );
    MockHttpSession session = rememberedSession(NOW - properties.getDesktopSessionLifetime().toMillis());
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.setSession(session);

    assertThatThrownBy(() -> interceptor.preHandle(request, new MockHttpServletResponse(), new Object()))
        .isInstanceOfSatisfying(BusinessException.class,
            error -> assertThat(error.getCode()).isEqualTo(ErrorCode.AUTH_SESSION_EXPIRED.name()));
    assertThat(session.isInvalid()).isTrue();
  }

  private MockHttpSession rememberedSession(long createdAt) {
    MockHttpSession session = new MockHttpSession();
    session.setAttribute(SessionPolicyInterceptor.REMEMBERED_ATTRIBUTE, true);
    session.setAttribute(SessionPolicyInterceptor.CREATED_AT_ATTRIBUTE, createdAt);
    session.setAttribute(SessionPolicyInterceptor.COOKIE_REFRESHED_AT_ATTRIBUTE, createdAt);
    return session;
  }
}
