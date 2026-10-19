package com.studyroom.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.studyroom.common.BusinessException;
import com.studyroom.common.ErrorCode;
import com.studyroom.config.AdminSecurityProperties;
import com.studyroom.config.AuthSecurityProperties;
import com.studyroom.entity.User;
import com.studyroom.mapper.DailyStatMapper;
import com.studyroom.mapper.FeedbackMapper;
import com.studyroom.mapper.PostMapper;
import com.studyroom.mapper.UserMapper;
import com.studyroom.security.PasswordService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.apache.ibatis.builder.MapperBuilderAssistant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminServiceSecurityTest {
  private UserMapper userMapper;
  private FeedbackMapper feedbackMapper;
  private AdminAuditService auditService;
  private AdminSecurityProperties adminSecurity;
  private AuthSecurityProperties authSecurity;
  private AdminService service;

  @BeforeEach
  void setUp() {
    TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "test"), User.class);
    userMapper = mock(UserMapper.class);
    feedbackMapper = mock(FeedbackMapper.class);
    auditService = mock(AdminAuditService.class);
    adminSecurity = new AdminSecurityProperties();
    authSecurity = new AuthSecurityProperties();
    service = new AdminService(
        userMapper,
        mock(DailyStatMapper.class),
        mock(PostMapper.class),
        feedbackMapper,
        mock(ActiveVisitorService.class),
        mock(RedisMonitorService.class),
        mock(SystemMetricsService.class),
        mock(DatabaseMetricsService.class),
        mock(HttpMetricsService.class),
        mock(PasswordService.class),
        auditService,
        adminSecurity,
        authSecurity
    );
  }

  @Test void readingFeedbackNeverDeletesHistoricalRecords(){
    TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "test-feedback"),com.studyroom.entity.Feedback.class);
    when(feedbackMapper.selectList(any())).thenReturn(java.util.List.of());
    assertEquals(java.util.List.of(),service.feedback());
    verify(feedbackMapper,never()).delete(any());
  }

  @Test
  void refusesToDemoteOrBanCurrentAdministrator() {
    User actor = admin(7L);
    when(userMapper.selectById(7L)).thenReturn(actor);

    BusinessException exception = assertThrows(BusinessException.class,
        () -> service.updateUserType(actor, 7L, "BANNED", new AdminAuditContext("127.0.0.1", "test", "self")));

    assertEquals(ErrorCode.ADMIN_FORBIDDEN.name(), exception.getCode());
    verify(userMapper, never()).update(any(), any());
    verify(auditService, never()).success(any(), any(), any(), any(), any(), any(), any());
  }

  @Test
  void refusesToDemoteConfiguredProtectedAdministrator() {
    User actor = admin(8L);
    User protectedAdmin = admin(7L);
    adminSecurity.setProtectedAdminId(7L);
    when(userMapper.selectById(7L)).thenReturn(protectedAdmin);

    BusinessException exception = assertThrows(BusinessException.class,
        () -> service.updateUserType(actor, 7L, "NORMAL", new AdminAuditContext("127.0.0.1", "test", "protected")));

    assertEquals(ErrorCode.ADMIN_FORBIDDEN.name(), exception.getCode());
    verify(userMapper, never()).update(any(), any());
    verify(auditService, never()).success(any(), any(), any(), any(), any(), any(), any());
  }

  @Test
  void failsClosedForAdministratorDemotionWhenProductionIdIsMissing() {
    User actor = admin(8L);
    User target = admin(7L);
    authSecurity.setProductionMode(true);
    when(userMapper.selectById(7L)).thenReturn(target);

    BusinessException exception = assertThrows(BusinessException.class,
        () -> service.updateUserType(actor, 7L, "NORMAL", new AdminAuditContext("127.0.0.1", "test", "production")));

    assertEquals(ErrorCode.ADMIN_FORBIDDEN.name(), exception.getCode());
    verify(userMapper, never()).update(any(), any());
  }

  @Test
  void successfulRoleChangeWritesAuditInTheBusinessPath() {
    User actor = admin(8L);
    User target = new User();
    target.setId(9L);
    target.setUserType("NORMAL");
    target.setDeleted(0);
    AdminAuditContext context = new AdminAuditContext("127.0.0.1", "test", "moderation");
    when(userMapper.selectById(9L)).thenReturn(target);

    service.updateUserType(actor, 9L, "MUTED", context);

    verify(userMapper).update(any(), any());
    verify(auditService).success(8L, "USER_TYPE_UPDATED", "user", 9L,
        java.util.Map.of("userType", "NORMAL"), java.util.Map.of("userType", "MUTED"), context);
  }

  private User admin(long id) {
    User user = new User();
    user.setId(id);
    user.setUserType("ADMIN");
    user.setDeleted(0);
    return user;
  }
}
