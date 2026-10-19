package com.studyroom.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;

import com.studyroom.common.BusinessException;
import com.studyroom.common.ErrorCode;
import com.studyroom.config.InvitationProperties;
import com.studyroom.config.PasswordProperties;
import com.studyroom.dto.CreateInvitationRequest;
import com.studyroom.dto.InvitationResponse;
import com.studyroom.dto.RegisterRequest;
import com.studyroom.entity.Invitation;
import com.studyroom.entity.InvitationRedemption;
import com.studyroom.entity.User;
import com.studyroom.mapper.InvitationMapper;
import com.studyroom.mapper.InvitationRedemptionMapper;
import com.studyroom.mapper.UserMapper;
import com.studyroom.security.PasswordService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DuplicateKeyException;

@ExtendWith(MockitoExtension.class)
class InvitationServiceTest {
  @Mock private InvitationMapper invitationMapper;
  @Mock private InvitationRedemptionMapper redemptionMapper;
  @Mock private UserMapper userMapper;

  private PasswordService passwordService;
  private InvitationProperties properties;
  private InvitationService service;
  private User administrator;

  @BeforeEach
  void setUp() {
    properties = new InvitationProperties();
    properties.setPepper("test-only-pepper-with-at-least-32-bytes");
    passwordService = new PasswordService(new PasswordProperties());
    service = new InvitationService(invitationMapper, redemptionMapper, userMapper, passwordService, properties);
    administrator = new User();
    administrator.setId(1L);
    administrator.setUserType("ADMIN");
    lenient().doAnswer(invocation -> {
      Invitation invitation = invocation.getArgument(0);
      invitation.setId(10L);
      return 1;
    }).when(invitationMapper).insert(any(Invitation.class));
  }

  @Test
  void creationReturnsThePlaintextOnceAndStoresOnlyDigestAndHint() {
    InvitationResponse first = service.create(createRequest(1, null), administrator);
    InvitationResponse second = service.create(createRequest(1, null), administrator);

    ArgumentCaptor<Invitation> saved = ArgumentCaptor.forClass(Invitation.class);
    verify(invitationMapper, org.mockito.Mockito.times(2)).insert(saved.capture());
    assertThat(first.getCode()).startsWith("SR-").hasSizeGreaterThanOrEqualTo(25);
    assertThat(second.getCode()).isNotEqualTo(first.getCode());
    assertThat(saved.getAllValues().get(0).getCodeDigest())
        .hasSize(64)
        .doesNotContain(first.getCode());
    assertThat(saved.getAllValues().get(0).getCodeHint()).isEqualTo(first.getCode().substring(first.getCode().length() - 4));
  }

  @Test
  void listNeverReturnsPlaintextCodes() {
    Invitation invitation = invitation("ACTIVE", 0, 1, LocalDateTime.now().plusDays(1));
    when(invitationMapper.selectList(any())).thenReturn(List.of(invitation));

    List<InvitationResponse> result = service.list();

    assertThat(result).singleElement().extracting(InvitationResponse::getCode).isNull();
    assertThat(result.get(0).getCodeHint()).isEqualTo("ABCD");
  }

  @Test
  void singleUseCodeCreatesBcryptUserAndBecomesExhausted() {
    InvitationResponse created = service.create(createRequest(1, null), administrator);
    ArgumentCaptor<Invitation> createdEntity = ArgumentCaptor.forClass(Invitation.class);
    verify(invitationMapper).insert(createdEntity.capture());
    Invitation invitation = createdEntity.getValue();
    when(invitationMapper.selectByDigestForUpdate(invitation.getCodeDigest())).thenReturn(invitation);
    when(userMapper.selectCount(any())).thenReturn(0L);
    doAnswer(invocation -> {
      User user = invocation.getArgument(0);
      user.setId(88L);
      return 1;
    }).when(userMapper).insert(any(User.class));

    User user = service.register(registerRequest("invited-user", created.getCode()));

    assertThat(passwordService.matches("invited password", user.getPasswordHash())).isTrue();
    assertThat(user.getForcePasswordChange()).isZero();
    assertThat(invitation.getUsedCount()).isEqualTo(1);
    assertThat(invitation.getStatus()).isEqualTo("EXHAUSTED");
    ArgumentCaptor<InvitationRedemption> redemption = ArgumentCaptor.forClass(InvitationRedemption.class);
    verify(redemptionMapper).insert(redemption.capture());
    assertThat(redemption.getValue().getInvitationId()).isEqualTo(invitation.getId());
    assertThat(redemption.getValue().getUserId()).isEqualTo(user.getId());
  }

  @Test
  void batchCodeRequiresAFutureExpiry() {
    assertThatThrownBy(() -> service.create(createRequest(3, null), administrator))
        .isInstanceOfSatisfying(BusinessException.class, exception ->
            assertThat(exception.getCode()).isEqualTo(ErrorCode.VALIDATION_ERROR.name()));
    assertThatThrownBy(() -> service.create(createRequest(3, LocalDateTime.now().minusMinutes(1)), administrator))
        .isInstanceOf(BusinessException.class);
    verify(invitationMapper, never()).insert(any(Invitation.class));
  }

  @Test
  void disabledExpiredAndExhaustedCodesHaveStableErrors() {
    assertRedemptionError(invitation("DISABLED", 0, 1, null), ErrorCode.INVITATION_DISABLED);
    assertRedemptionError(invitation("ACTIVE", 0, 1, LocalDateTime.now().minusSeconds(1)), ErrorCode.INVITATION_EXPIRED);
    assertRedemptionError(invitation("EXHAUSTED", 1, 1, null), ErrorCode.INVITATION_EXHAUSTED);
  }

  @Test
  void userInsertFailureDoesNotReachRedemptionOrConsumption() {
    Invitation invitation = invitation("ACTIVE", 0, 1, null);
    when(invitationMapper.selectByDigestForUpdate(any())).thenReturn(invitation);
    when(userMapper.selectCount(any())).thenReturn(0L);
    when(userMapper.insert(any(User.class))).thenThrow(new DuplicateKeyException("duplicate"));

    assertThatThrownBy(() -> service.register(registerRequest("duplicate-user", "SR-valid-looking-code")))
        .isInstanceOfSatisfying(BusinessException.class, exception ->
            assertThat(exception.getCode()).isEqualTo(ErrorCode.AUTH_USERNAME_TAKEN.name()));

    verify(redemptionMapper, never()).insert(any(InvitationRedemption.class));
    verify(invitationMapper, never()).updateById(any(Invitation.class));
    assertThat(invitation.getUsedCount()).isZero();
  }

  @Test
  void missingPepperFailsClosedWithoutGeneratingAnInvitation() {
    properties.setPepper("");

    assertThatThrownBy(() -> service.create(createRequest(1, null), administrator))
        .isInstanceOfSatisfying(BusinessException.class, exception ->
            assertThat(exception.getCode()).isEqualTo(ErrorCode.INVITATION_CONFIGURATION_ERROR.name()));
    verify(invitationMapper, never()).insert(any(Invitation.class));
  }

  private void assertRedemptionError(Invitation invitation, ErrorCode errorCode) {
    when(invitationMapper.selectByDigestForUpdate(any())).thenReturn(invitation);
    assertThatThrownBy(() -> service.register(registerRequest("test-user", "SR-valid-looking-code")))
        .isInstanceOfSatisfying(BusinessException.class, exception ->
            assertThat(exception.getCode()).isEqualTo(errorCode.name()));
  }

  private CreateInvitationRequest createRequest(int maxUses, LocalDateTime expiresAt) {
    CreateInvitationRequest request = new CreateInvitationRequest();
    request.setLabel("Circle member");
    request.setMaxUses(maxUses);
    request.setExpiresAt(expiresAt);
    return request;
  }

  private RegisterRequest registerRequest(String username, String code) {
    RegisterRequest request = new RegisterRequest();
    request.setUsername(username);
    request.setNickname(username);
    request.setPassword("invited password");
    request.setInvitationCode(code);
    return request;
  }

  private Invitation invitation(String status, int usedCount, int maxUses, LocalDateTime expiresAt) {
    Invitation invitation = new Invitation();
    invitation.setId(10L);
    invitation.setLabel("Test");
    invitation.setCodeHint("ABCD");
    invitation.setCodeDigest("a".repeat(64));
    invitation.setStatus(status);
    invitation.setUsedCount(usedCount);
    invitation.setMaxUses(maxUses);
    invitation.setExpiresAt(expiresAt);
    invitation.setCreatedBy(1L);
    return invitation;
  }
}
