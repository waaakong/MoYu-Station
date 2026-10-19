package com.studyroom.security;

import com.studyroom.common.BusinessException;
import com.studyroom.config.AdminSecurityProperties;
import com.studyroom.entity.User;
import com.studyroom.service.AuthService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpSession;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AdminReverificationServiceTest {
  private AuthService authService;
  private PasswordService passwordService;
  private AdminSecurityProperties properties;
  private User administrator;

  @BeforeEach
  void setUp() {
    authService = mock(AuthService.class);
    passwordService = mock(PasswordService.class);
    properties = new AdminSecurityProperties();
    properties.setReverificationWindow(Duration.ofMinutes(10));
    administrator = new User(); administrator.setId(7L); administrator.setUserType("ADMIN"); administrator.setLoginVersion("login-v1"); administrator.setPasswordHash("bcrypt");
  }

  @Test
  void verificationIsBoundToTheCurrentSessionAdministratorAndLoginVersion() {
    MockHttpSession session = new MockHttpSession();
    when(authService.requireAdmin(session)).thenReturn(administrator);
    when(passwordService.matches("correct-password", "bcrypt")).thenReturn(true);
    AdminReverificationService service = serviceAt("2026-09-17T00:00:00Z");

    long expiresAt = service.verify("correct-password", session);

    assertThat(service.requireVerified(session)).isSameAs(administrator);
    assertThat(expiresAt).isEqualTo(Instant.parse("2026-09-17T00:10:00Z").toEpochMilli());
    administrator.setLoginVersion("login-v2");
    assertThatThrownBy(() -> service.requireVerified(session)).isInstanceOf(BusinessException.class).hasMessageContaining("重新验证");
  }

  @Test
  void expiredAndCrossSessionVerificationAreRejected() {
    MockHttpSession verified = new MockHttpSession();
    MockHttpSession other = new MockHttpSession();
    when(authService.requireAdmin(verified)).thenReturn(administrator);
    when(authService.requireAdmin(other)).thenReturn(administrator);
    when(passwordService.matches("correct-password", "bcrypt")).thenReturn(true);
    serviceAt("2026-09-17T00:00:00Z").verify("correct-password", verified);

    assertThatThrownBy(() -> serviceAt("2026-09-17T00:11:00Z").requireVerified(verified)).isInstanceOf(BusinessException.class);
    assertThatThrownBy(() -> serviceAt("2026-09-17T00:01:00Z").requireVerified(other)).isInstanceOf(BusinessException.class);
  }

  @Test
  void wrongPasswordClearsAnyPreviousVerification() {
    MockHttpSession session = new MockHttpSession();
    when(authService.requireAdmin(session)).thenReturn(administrator);
    when(passwordService.matches("wrong-password", "bcrypt")).thenReturn(false);
    session.setAttribute(AdminReverificationService.VERIFIED_ADMIN_ID, 7L);

    assertThatThrownBy(() -> serviceAt("2026-09-17T00:00:00Z").verify("wrong-password", session))
        .isInstanceOf(BusinessException.class).hasMessageContaining("不正确");
    assertThat(session.getAttribute(AdminReverificationService.VERIFIED_ADMIN_ID)).isNull();
  }

  private AdminReverificationService serviceAt(String instant) {
    return new AdminReverificationService(authService, passwordService, properties, Clock.fixed(Instant.parse(instant), ZoneOffset.UTC));
  }
}
