package com.studyroom.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.studyroom.common.BusinessException;
import com.studyroom.common.ErrorCode;
import com.studyroom.config.AuthSecurityProperties;
import com.studyroom.dto.LoginRequest;
import com.studyroom.dto.UserProfileResponse;
import com.studyroom.security.AuthRateLimiter;
import com.studyroom.security.CsrfTokenService;
import com.studyroom.service.AuthService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpSession;

class AuthControllerTest {
  private AuthService authService;
  private AuthRateLimiter rateLimiter;
  private CsrfTokenService csrfTokens;
  private AuthSecurityProperties properties;
  private AuthController controller;

  @BeforeEach
  void setUp() {
    authService = mock(AuthService.class);
    rateLimiter = mock(AuthRateLimiter.class);
    csrfTokens = new CsrfTokenService();
    properties = new AuthSecurityProperties();
    controller = new AuthController(authService, rateLimiter, csrfTokens, properties);
  }

  @Test
  void csrfEndpointBindsATokenToTheSession() {
    MockHttpSession session = new MockHttpSession();
    String token = controller.csrf(session).getData().get("token");
    assertThat(token).hasSizeGreaterThan(40);
    assertThat(csrfTokens.matches(session, token)).isTrue();
  }

  @Test
  void rememberedLoginRequiresTheFixedDesktopChannelAndRotatesSessionId() {
    LoginRequest login = login(true);
    MockHttpServletRequest request = new MockHttpServletRequest();
    MockHttpSession session = new MockHttpSession();
    request.setSession(session);
    request.addHeader("Origin", properties.getDesktopOrigin());
    request.addHeader(properties.getDesktopHeaderName(), properties.getDesktopHeaderValue());
    String oldSessionId = session.getId();
    String oldCsrf = csrfTokens.issue(session);
    when(authService.login(eq(login), eq(session), eq(true))).thenReturn(new UserProfileResponse());

    controller.login(login, request, session);

    verify(rateLimiter).checkLogin(request, "member");
    verify(authService).login(login, session, true);
    assertThat(session.getId()).isNotEqualTo(oldSessionId);
    assertThat(csrfTokens.matches(session, oldCsrf)).isFalse();
  }

  @Test
  void rendererCannotRequestPersistentCookieWithoutBothDesktopMarkers() {
    LoginRequest login = login(true);
    MockHttpServletRequest request = new MockHttpServletRequest();
    MockHttpSession session = new MockHttpSession();
    request.setSession(session);
    request.addHeader("Origin", "https://moyustation.xyz");

    assertThatThrownBy(() -> controller.login(login, request, session))
        .isInstanceOfSatisfying(BusinessException.class,
            error -> assertThat(error.getCode()).isEqualTo(ErrorCode.OPERATION_NOT_ALLOWED.name()));
    verify(rateLimiter).checkLogin(request, "member");
  }

  private LoginRequest login(boolean rememberMe) {
    LoginRequest request = new LoginRequest();
    request.setUsername("member");
    request.setPassword("password");
    request.setRememberMe(rememberMe);
    return request;
  }
}
