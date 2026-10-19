package com.studyroom.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.studyroom.common.BusinessException;
import com.studyroom.common.ErrorCode;
import com.studyroom.config.PasswordProperties;
import com.studyroom.dto.UpdateOwnPasswordRequest;
import com.studyroom.entity.User;
import com.studyroom.mapper.DailyStatMapper;
import com.studyroom.mapper.FeedbackMapper;
import com.studyroom.mapper.PostMapper;
import com.studyroom.mapper.UserMapper;
import com.studyroom.security.PasswordService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpSession;

@ExtendWith(MockitoExtension.class)
class ProfileServicePasswordTest {
  @Mock private AuthService authService;
  @Mock private UserMapper userMapper;
  @Mock private DailyStatMapper dailyStatMapper;
  @Mock private PostMapper postMapper;
  @Mock private FeedbackMapper feedbackMapper;
  @Mock private ImageStorageService imageStorageService;

  private PasswordService passwordService;
  private ProfileService profileService;

  @BeforeEach
  void setUp() {
    com.baomidou.mybatisplus.core.metadata.TableInfoHelper.initTableInfo(new org.apache.ibatis.builder.MapperBuilderAssistant(new com.baomidou.mybatisplus.core.MybatisConfiguration(),"profile-password-cas"),User.class);
    passwordService = new PasswordService(new PasswordProperties());
    profileService = new ProfileService(
        authService,
        userMapper,
        dailyStatMapper,
        postMapper,
        feedbackMapper,
        imageStorageService,
        passwordService
    );
  }

  @Test
  void changingOwnPasswordRotatesLoginVersionAndKeepsCurrentSession() {
    User user = userWithPassword("current password");
    String previousLoginVersion = user.getLoginVersion();
    MockHttpSession session = new MockHttpSession();
    session.setAttribute(AuthService.SESSION_LOGIN_VERSION, previousLoginVersion);
    org.mockito.Mockito.when(userMapper.update(org.mockito.ArgumentMatchers.isNull(),org.mockito.ArgumentMatchers.any())).thenReturn(1);

    profileService.updateOwnPassword(user, request("current password", "new secure password"), session);

    verify(userMapper).update(org.mockito.ArgumentMatchers.isNull(),org.mockito.ArgumentMatchers.any());
    verify(userMapper,never()).updateById(user);
    assertThat(passwordService.matches("new secure password", user.getPasswordHash())).isTrue();
    assertThat(passwordService.matches("current password", user.getPasswordHash())).isFalse();
    assertThat(user.getForcePasswordChange()).isZero();
    assertThat(user.getPasswordChangedAt()).isNotNull();
    assertThat(user.getLoginVersion()).isNotEqualTo(previousLoginVersion);
    assertThat(session.getAttribute(AuthService.SESSION_LOGIN_VERSION)).isEqualTo(user.getLoginVersion());
  }

  @Test
  void wrongCurrentPasswordCannotChangeStoredCredentials() {
    User user = userWithPassword("current password");
    String previousHash = user.getPasswordHash();

    assertThatThrownBy(() -> profileService.updateOwnPassword(
        user,
        request("wrong password", "new secure password"),
        new MockHttpSession()
    )).isInstanceOfSatisfying(BusinessException.class, exception ->
        assertThat(exception.getCode()).isEqualTo(ErrorCode.PASSWORD_CURRENT_INVALID.name()));

    assertThat(user.getPasswordHash()).isEqualTo(previousHash);
    verify(userMapper, never()).updateById(user);
  }

  @Test void concurrentResetDoesNotChangeTheSessionOrMutateTheOldSnapshot(){
    User user=userWithPassword("current password");String hash=user.getPasswordHash();var session=new MockHttpSession();session.setAttribute(AuthService.SESSION_LOGIN_VERSION,user.getLoginVersion());
    assertThatThrownBy(()->profileService.updateOwnPassword(user,request("current password","new secure password"),session)).isInstanceOfSatisfying(BusinessException.class,e->assertThat(e.getCode()).isEqualTo("AUTH_SESSION_EXPIRED"));
    assertThat(user.getPasswordHash()).isEqualTo(hash);assertThat(session.getAttribute(AuthService.SESSION_LOGIN_VERSION)).isEqualTo("previous-login-version");
  }

  private User userWithPassword(String password) {
    User user = new User();
    user.setId(17L);
    user.setPasswordHash(passwordService.encode(password));
    user.setForcePasswordChange(1);
    user.setLoginVersion("previous-login-version");
    return user;
  }

  private UpdateOwnPasswordRequest request(String oldPassword, String newPassword) {
    UpdateOwnPasswordRequest request = new UpdateOwnPasswordRequest();
    request.setOldPassword(oldPassword);
    request.setNewPassword(newPassword);
    return request;
  }
}
