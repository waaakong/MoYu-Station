package com.studyroom.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.studyroom.common.BusinessException;
import com.studyroom.common.ErrorCode;
import com.studyroom.config.CorsOriginProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;

import java.util.List;

class CsrfOriginInterceptorTest {
  private CsrfTokenService tokens;
  private CsrfOriginInterceptor interceptor;

  @BeforeEach
  void setUp() {
    CorsOriginProperties origins = new CorsOriginProperties();
    origins.setAllowedOriginPatterns(List.of("https://moyustation.xyz", "https://desktop.moyustation.xyz"));
    tokens = new CsrfTokenService();
    interceptor = new CsrfOriginInterceptor(tokens, origins);
  }

  @Test
  void acceptsAWriteOnlyWhenOriginAndSessionTokenMatch() {
    MockHttpSession session = new MockHttpSession();
    String token = tokens.issue(session);
    MockHttpServletRequest request = writeRequest(session, "https://moyustation.xyz", token);

    assertThat(interceptor.preHandle(request, new MockHttpServletResponse(), new Object())).isTrue();
  }

  @Test
  void rejectsMissingTokenAndUnknownOrNullOrigins() {
    MockHttpSession session = new MockHttpSession();
    String token = tokens.issue(session);

    assertCode(writeRequest(session, "https://moyustation.xyz", null));
    assertCode(writeRequest(session, "https://moyustation.xyz", "wrong-token"));
    assertCode(writeRequest(session, "https://evil.example", token));
    assertCode(writeRequest(session, "null", token));
  }

  @Test
  void readRequestsDoNotRequireCsrfToken() {
    MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/auth/me");
    assertThat(interceptor.preHandle(request, new MockHttpServletResponse(), new Object())).isTrue();
  }

  @Test
  void productionOriginsCannotContainWildcards() {
    CorsOriginProperties origins = new CorsOriginProperties();
    origins.setProductionMode(true);
    origins.setAllowedOriginPatterns(List.of("https://*.example.test"));
    assertThatThrownBy(origins::validate).isInstanceOf(IllegalStateException.class);
  }

  private MockHttpServletRequest writeRequest(MockHttpSession session, String origin, String token) {
    MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/auth/login");
    request.setSession(session);
    if (origin != null) request.addHeader("Origin", origin);
    if (token != null) request.addHeader(CsrfTokenService.HEADER_NAME, token);
    return request;
  }

  private void assertCode(MockHttpServletRequest request) {
    assertThatThrownBy(() -> interceptor.preHandle(request, new MockHttpServletResponse(), new Object()))
        .isInstanceOfSatisfying(BusinessException.class,
            error -> assertThat(error.getCode()).isEqualTo(ErrorCode.AUTH_CSRF_INVALID.name()));
  }
}
