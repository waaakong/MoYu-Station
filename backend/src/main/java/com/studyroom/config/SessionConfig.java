package com.studyroom.config;

import com.studyroom.security.SessionPolicyInterceptor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.session.web.http.DefaultCookieSerializer;

import javax.servlet.http.HttpSession;

@Configuration
public class SessionConfig {
  public static final String COOKIE_NAME = "STUDYROOM_SESSION";

  @Bean
  public CookieSerializer cookieSerializer(AuthSecurityProperties properties) {
    DefaultCookieSerializer delegate = new DefaultCookieSerializer();
    delegate.setCookieName(COOKIE_NAME);
    delegate.setCookiePath("/");
    delegate.setUseHttpOnlyCookie(true);
    delegate.setUseSecureCookie(properties.isSecureCookie());
    delegate.setSameSite("Lax");
    return new DesktopAwareCookieSerializer(delegate, properties);
  }

  static final class DesktopAwareCookieSerializer implements CookieSerializer {
    private final DefaultCookieSerializer delegate;
    private final int rememberedMaxAge;

    private DesktopAwareCookieSerializer(DefaultCookieSerializer delegate, AuthSecurityProperties properties) {
      this.delegate = delegate;
      this.rememberedMaxAge = Math.toIntExact(properties.getDesktopSessionLifetime().toSeconds());
    }

    @Override
    public void writeCookieValue(CookieValue cookieValue) {
      if (cookieValue.getCookieMaxAge() != 0 && cookieValue.getCookieValue() != null && !cookieValue.getCookieValue().isBlank()) {
        HttpSession session = cookieValue.getRequest().getSession(false);
        cookieValue.setCookieMaxAge(session != null && Boolean.TRUE.equals(session.getAttribute(SessionPolicyInterceptor.REMEMBERED_ATTRIBUTE))
            ? rememberedMaxAge
            : -1);
      }
      delegate.writeCookieValue(cookieValue);
    }

    @Override
    public java.util.List<String> readCookieValues(javax.servlet.http.HttpServletRequest request) {
      return delegate.readCookieValues(request);
    }
  }
}
