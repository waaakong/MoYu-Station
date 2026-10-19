package com.studyroom.security;

import org.springframework.stereotype.Service;

import javax.servlet.http.HttpSession;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

@Service
public class CsrfTokenService {
  public static final String HEADER_NAME = "X-CSRF-Token";
  private static final String SESSION_ATTRIBUTE = "STUDYROOM_CSRF_TOKEN";
  private final SecureRandom secureRandom;

  public CsrfTokenService() {
    this(new SecureRandom());
  }

  CsrfTokenService(SecureRandom secureRandom) {
    this.secureRandom = secureRandom;
  }

  public String issue(HttpSession session) {
    Object existing = session.getAttribute(SESSION_ATTRIBUTE);
    if (existing instanceof String token && !token.isBlank()) return token;
    return rotate(session);
  }

  public String rotate(HttpSession session) {
    byte[] bytes = new byte[32];
    secureRandom.nextBytes(bytes);
    String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    session.setAttribute(SESSION_ATTRIBUTE, token);
    return token;
  }

  public boolean matches(HttpSession session, String candidate) {
    Object expected = session.getAttribute(SESSION_ATTRIBUTE);
    if (!(expected instanceof String token) || candidate == null) return false;
    return MessageDigest.isEqual(
        token.getBytes(StandardCharsets.UTF_8),
        candidate.getBytes(StandardCharsets.UTF_8)
    );
  }
}
