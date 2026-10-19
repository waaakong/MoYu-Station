package com.studyroom.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

import com.studyroom.common.BusinessException;
import com.studyroom.common.ErrorCode;
import com.studyroom.config.PasswordProperties;
import com.studyroom.config.AuthSecurityProperties;
import com.studyroom.dto.LoginRequest;
import com.studyroom.dto.RegisterRequest;
import com.studyroom.entity.User;
import com.studyroom.mapper.UserMapper;
import com.studyroom.security.PasswordService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpSession;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {
  @Mock
  private UserMapper userMapper;
  @Mock
  private InvitationService invitationService;

  private PasswordService passwordService;
  private AuthService service;
  private AuthSecurityProperties security;

  @BeforeEach
  void setUp() {
    com.baomidou.mybatisplus.core.metadata.TableInfoHelper.initTableInfo(new org.apache.ibatis.builder.MapperBuilderAssistant(new com.baomidou.mybatisplus.core.MybatisConfiguration(),"login-cas"),User.class);
    org.mockito.Mockito.lenient().when(userMapper.update(any(User.class),any())).thenReturn(1);
    passwordService = new PasswordService(new PasswordProperties());
    security = new AuthSecurityProperties();
    service = new AuthService(userMapper, passwordService, invitationService, security);
  }

  @Test
  void currentUserReturnsNullForAnonymousSession() {
    UserHolder result = new UserHolder();

    assertThatCode(() -> result.value = service.currentUser(new MockHttpSession()))
        .doesNotThrowAnyException();
    assertThat(result.value).isNull();
  }

  @Test void concurrentLoginKeepsEpochAndLogoutOnlyInvalidatesItsOwnSession() {
    security.setConcurrentSessions(true);
    User user = user("NORMAL", passwordService.encode("correct horse battery staple")); user.setLoginVersion("epoch");
    when(userMapper.selectOne(any())).thenReturn(user); when(userMapper.selectById(user.getId())).thenReturn(user);
    when(userMapper.update(any(User.class), any())).thenReturn(1);
    MockHttpSession browser = new MockHttpSession(), desktop = new MockHttpSession();
    browser.setAttribute("STUDYROOM_VERIFIED_ADMIN_ID", 7L);
    browser.setAttribute("STUDYROOM_VERIFIED_LOGIN_VERSION", "epoch");
    browser.setAttribute("STUDYROOM_VERIFIED_AT", System.currentTimeMillis());
    service.login(loginRequest("correct horse battery staple"), browser, false);
    service.login(loginRequest("correct horse battery staple"), desktop, true);
    assertThat(service.requireActiveUser(browser)).isSameAs(user); assertThat(service.requireActiveUser(desktop)).isSameAs(user);
    assertThat(user.getLoginVersion()).isEqualTo("epoch");
    assertThat(browser.getAttribute("STUDYROOM_VERIFIED_ADMIN_ID")).isNull();
    assertThat(browser.getAttribute("STUDYROOM_VERIFIED_LOGIN_VERSION")).isNull();
    assertThat(browser.getAttribute("STUDYROOM_VERIFIED_AT")).isNull();
    service.logout(browser); assertThat(browser.isInvalid()).isTrue(); assertThat(service.requireActiveUser(desktop)).isSameAs(user);
    verify(userMapper, never()).updateById(any(User.class));
  }

  @Test void concurrentLoginFailsClosedIfResetOrBanWinsCompareAndSet() {
    security.setConcurrentSessions(true);
    User user = user("NORMAL", passwordService.encode("correct horse battery staple")); user.setLoginVersion("epoch");
    when(userMapper.selectOne(any())).thenReturn(user);
    when(userMapper.update(any(User.class),any())).thenReturn(0);
    MockHttpSession session = new MockHttpSession();
    assertThatThrownBy(() -> service.login(loginRequest("correct horse battery staple"), session))
        .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getCode()).isEqualTo("AUTH_SESSION_EXPIRED"));
    assertThat(session.getAttribute(AuthService.SESSION_USER_ID)).isNull();
  }

  @Test void revocationEpochStillInvalidatesConcurrentSessions() {
    security.setConcurrentSessions(true);
    User user = user("NORMAL", "unused"); user.setLoginVersion("rotated"); when(userMapper.selectById(user.getId())).thenReturn(user);
    MockHttpSession session = new MockHttpSession(); session.setAttribute(AuthService.SESSION_USER_ID, user.getId());
    session.setAttribute(AuthService.SESSION_LOGIN_VERSION, "old");
    assertThatThrownBy(() -> service.requireActiveUser(session)).isInstanceOfSatisfying(BusinessException.class,
        e -> assertThat(e.getCode()).isEqualTo("AUTH_SESSION_EXPIRED"));
    assertThat(session.isInvalid()).isTrue();
  }

  @Test void concurrentSessionFeatureRemainsOffByDefault() {
    assertThat(security.isConcurrentSessions()).isFalse();
    User user = user("NORMAL", passwordService.encode("correct horse battery staple"));
    when(userMapper.selectOne(any())).thenReturn(user); when(userMapper.selectById(user.getId())).thenReturn(user);
    MockHttpSession first = new MockHttpSession(), second = new MockHttpSession();
    service.login(loginRequest("correct horse battery staple"), first);
    service.login(loginRequest("correct horse battery staple"), second);
    assertThatThrownBy(() -> service.requireActiveUser(first)).isInstanceOf(com.studyroom.common.AccountLoggedInElsewhereException.class);
    assertThat(service.requireActiveUser(second)).isSameAs(user);
  }

  @Test
  void registrationDelegatesToTheInvitationTransaction() {
    RegisterRequest request = registerRequest("new-user", "correct horse battery staple");
    User user = user("NORMAL", passwordService.encode(request.getPassword()));
    when(invitationService.register(request)).thenReturn(user);

    service.register(request);

    verify(invitationService).register(request);
  }

  @Test
  void bcryptUserCanLogIn() {
    User user = user("NORMAL", passwordService.encode("correct horse battery staple"));
    when(userMapper.selectOne(any())).thenReturn(user);

    service.login(loginRequest("correct horse battery staple"), new MockHttpSession());

    verify(userMapper).update(any(User.class),any());
    verify(userMapper,never()).updateById(user);
    assertThat(user.getForcePasswordChange()).isNull();
  }

  @Test
  void browserAndRememberedDesktopSessionsUseDifferentLifetimes() {
    User user = user("NORMAL", passwordService.encode("correct horse battery staple"));
    when(userMapper.selectOne(any())).thenReturn(user);
    MockHttpSession browserSession = new MockHttpSession();
    MockHttpSession desktopSession = new MockHttpSession();

    service.login(loginRequest("correct horse battery staple"), browserSession, false);
    service.login(loginRequest("correct horse battery staple"), desktopSession, true);

    assertThat(browserSession.getMaxInactiveInterval()).isEqualTo(12 * 60 * 60);
    assertThat(browserSession.getAttribute(com.studyroom.security.SessionPolicyInterceptor.REMEMBERED_ATTRIBUTE))
        .isEqualTo(false);
    assertThat(desktopSession.getMaxInactiveInterval()).isEqualTo(30 * 24 * 60 * 60);
    assertThat(desktopSession.getAttribute(com.studyroom.security.SessionPolicyInterceptor.REMEMBERED_ATTRIBUTE))
        .isEqualTo(true);
  }

  @Test
  void bannedUserSessionIsInvalidatedWhenCloudAccessIsChecked() {
    User user = user("BANNED", passwordService.encode("correct horse battery staple"));
    when(userMapper.selectOne(any())).thenReturn(user);
    when(userMapper.selectById(user.getId())).thenReturn(user);
    MockHttpSession session = new MockHttpSession();
    service.login(loginRequest("correct horse battery staple"), session);

    assertThatThrownBy(() -> service.requireActiveUser(session))
        .isInstanceOfSatisfying(BusinessException.class, error ->
            assertThat(error.getCode()).isEqualTo(ErrorCode.AUTH_ACCOUNT_BANNED.name()));
    assertThat(session.isInvalid()).isTrue();
  }

  @Test
  void legacyAdministratorIsUpgradedOnceAndMustChangePassword() throws Exception {
    String rawPassword = "legacy-admin-password";
    User user = user("ADMIN", legacyMd5(rawPassword));
    when(userMapper.selectOne(any())).thenReturn(user);

    assertThat(service.login(loginRequest(rawPassword), new MockHttpSession()).isPasswordChangeRequired()).isTrue();
    assertThat(passwordService.isBcryptHash(user.getPasswordHash())).isTrue();
    assertThat(user.getForcePasswordChange()).isEqualTo(1);
    assertThat(user.getPasswordChangedAt()).isNotNull();

    service.login(loginRequest(rawPassword), new MockHttpSession());
    assertThat(passwordService.matches(rawPassword, user.getPasswordHash())).isTrue();
  }

  @Test
  void legacyHashIsRejectedForNonAdministrators() throws Exception {
    User user = user("NORMAL", legacyMd5("legacy-user-password"));
    when(userMapper.selectOne(any())).thenReturn(user);

    assertThatThrownBy(() -> service.login(loginRequest("legacy-user-password"), new MockHttpSession()))
        .isInstanceOfSatisfying(BusinessException.class, exception ->
            assertThat(exception.getCode()).isEqualTo(ErrorCode.AUTH_INVALID_CREDENTIALS.name()));
    verify(userMapper, never()).updateById(any(User.class));
  }

  @Test
  void wrongPasswordCannotMutateAdministratorHash() throws Exception {
    User user = user("ADMIN", legacyMd5("correct-password"));
    when(userMapper.selectOne(any())).thenReturn(user);
    String originalHash = user.getPasswordHash();

    assertThatThrownBy(() -> service.login(loginRequest("wrong-password"), new MockHttpSession()))
        .isInstanceOf(BusinessException.class);

    assertThat(user.getPasswordHash()).isEqualTo(originalHash);
    verify(userMapper, never()).updateById(any(User.class));
  }

  @Test
  void malformedHashUsesTheSameInvalidCredentialResponse() {
    User user = user("ADMIN", "not-a-supported-password-hash");
    when(userMapper.selectOne(any())).thenReturn(user);

    assertThatThrownBy(() -> service.login(loginRequest("some-password"), new MockHttpSession()))
        .isInstanceOfSatisfying(BusinessException.class, exception ->
            assertThat(exception.getCode()).isEqualTo(ErrorCode.AUTH_INVALID_CREDENTIALS.name()));
    verify(userMapper, never()).updateById(any(User.class));
  }

  private User user(String type, String hash) {
    User user = new User();
    user.setId(7L);
    user.setUsername("test-user");
    user.setNickname("Test User");
    user.setUserType(type);
    user.setPasswordHash(hash);
    user.setDeleted(0);
    return user;
  }

  private LoginRequest loginRequest(String password) {
    LoginRequest request = new LoginRequest();
    request.setUsername("test-user");
    request.setPassword(password);
    return request;
  }

  private RegisterRequest registerRequest(String username, String password) {
    RegisterRequest request = new RegisterRequest();
    request.setUsername(username);
    request.setPassword(password);
    request.setNickname(username);
    return request;
  }

  private String legacyMd5(String rawPassword) throws Exception {
    byte[] digest = MessageDigest.getInstance("MD5").digest(rawPassword.getBytes(StandardCharsets.UTF_8));
    StringBuilder result = new StringBuilder(32);
    for (byte value : digest) {
      result.append(String.format("%02x", value & 0xff));
    }
    return result.toString();
  }

  private static class UserHolder {
    private Object value;
  }
}
