package com.studyroom.security;

import com.studyroom.common.BusinessException;
import com.studyroom.common.ErrorCode;
import com.studyroom.config.AdminSecurityProperties;
import com.studyroom.entity.User;
import com.studyroom.service.AuthService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import javax.servlet.http.HttpSession;
import java.time.Clock;
import java.util.Objects;

@Service
public class AdminReverificationService {
  static final String VERIFIED_ADMIN_ID = "STUDYROOM_VERIFIED_ADMIN_ID";
  static final String VERIFIED_LOGIN_VERSION = "STUDYROOM_VERIFIED_LOGIN_VERSION";
  static final String VERIFIED_AT = "STUDYROOM_VERIFIED_AT";

  private final AuthService authService;
  private final PasswordService passwordService;
  private final AdminSecurityProperties properties;
  private final Clock clock;

  @Autowired
  public AdminReverificationService(AuthService authService, PasswordService passwordService, AdminSecurityProperties properties) {
    this(authService, passwordService, properties, Clock.systemUTC());
  }

  AdminReverificationService(AuthService authService, PasswordService passwordService, AdminSecurityProperties properties, Clock clock) {
    this.authService = authService;
    this.passwordService = passwordService;
    this.properties = properties;
    this.clock = clock;
  }

  public long verify(String password, HttpSession session) {
    User administrator = authService.requireAdmin(session);
    if (!passwordService.matches(password, administrator.getPasswordHash())) {
      clear(session);
      throw new BusinessException(ErrorCode.PASSWORD_CURRENT_INVALID, "当前密码不正确。");
    }
    long verifiedAt = clock.millis();
    session.setAttribute(VERIFIED_ADMIN_ID, administrator.getId());
    session.setAttribute(VERIFIED_LOGIN_VERSION, administrator.getLoginVersion());
    session.setAttribute(VERIFIED_AT, verifiedAt);
    return verifiedAt + properties.getReverificationWindow().toMillis();
  }

  public User requireVerified(HttpSession session) {
    if (session == null) throw new BusinessException(ErrorCode.ADMIN_REVERIFY_REQUIRED, "请先重新验证管理员密码。");
    User administrator = authService.requireAdmin(session);
    Object verifiedId = session.getAttribute(VERIFIED_ADMIN_ID);
    Object verifiedVersion = session.getAttribute(VERIFIED_LOGIN_VERSION);
    Object verifiedAt = session.getAttribute(VERIFIED_AT);
    boolean valid = verifiedId instanceof Long
        && verifiedAt instanceof Long
        && Objects.equals(verifiedId, administrator.getId())
        && Objects.equals(verifiedVersion, administrator.getLoginVersion())
        && clock.millis() - (Long) verifiedAt >= 0
        && clock.millis() - (Long) verifiedAt <= properties.getReverificationWindow().toMillis();
    if (!valid) {
      clear(session);
      throw new BusinessException(ErrorCode.ADMIN_REVERIFY_REQUIRED, "请先重新验证管理员密码。");
    }
    return administrator;
  }

  public void clear(HttpSession session) {
    clearVerification(session);
  }

  /** A fresh login must not inherit a previous authentication context's elevated proof. */
  public static void clearVerification(HttpSession session) {
    session.removeAttribute(VERIFIED_ADMIN_ID);
    session.removeAttribute(VERIFIED_LOGIN_VERSION);
    session.removeAttribute(VERIFIED_AT);
  }
}
