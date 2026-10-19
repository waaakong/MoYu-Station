package com.studyroom.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.studyroom.security.SessionPolicyInterceptor;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.session.web.http.CookieSerializer;

class SessionConfigTest {
  @Test
  void productionConfigurationRejectsInsecureCookies() {
    AuthSecurityProperties properties = new AuthSecurityProperties();
    properties.setProductionMode(true);
    properties.setSecureCookie(false);
    assertThatThrownBy(properties::validate).isInstanceOf(IllegalStateException.class);
  }

  @Test
  void webCookieIsSessionOnlyHttpOnlyAndSameSiteLax() {
    AuthSecurityProperties properties = new AuthSecurityProperties();
    properties.setSecureCookie(true);
    CookieSerializer serializer = new SessionConfig().cookieSerializer(properties);
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.setSession(new MockHttpSession());
    MockHttpServletResponse response = new MockHttpServletResponse();

    serializer.writeCookieValue(new CookieSerializer.CookieValue(request, response, "web-session"));

    String cookie = response.getHeader("Set-Cookie");
    assertThat(cookie)
        .contains("STUDYROOM_SESSION=")
        .contains("Path=/")
        .contains("Secure")
        .contains("HttpOnly")
        .contains("SameSite=Lax")
        .doesNotContain("Max-Age");
  }

  @Test
  void rememberedDesktopCookieHasThirtyDayMaxAge() {
    AuthSecurityProperties properties = new AuthSecurityProperties();
    CookieSerializer serializer = new SessionConfig().cookieSerializer(properties);
    MockHttpServletRequest request = new MockHttpServletRequest();
    MockHttpSession session = new MockHttpSession();
    session.setAttribute(SessionPolicyInterceptor.REMEMBERED_ATTRIBUTE, true);
    request.setSession(session);
    MockHttpServletResponse response = new MockHttpServletResponse();

    serializer.writeCookieValue(new CookieSerializer.CookieValue(request, response, "desktop-session"));

    assertThat(response.getHeader("Set-Cookie"))
        .contains("Max-Age=2592000")
        .contains("Expires=");
  }
}
