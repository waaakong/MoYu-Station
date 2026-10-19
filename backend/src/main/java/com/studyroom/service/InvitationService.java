package com.studyroom.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.studyroom.common.BusinessException;
import com.studyroom.common.ErrorCode;
import com.studyroom.config.InvitationProperties;
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
import org.springframework.dao.DuplicateKeyException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class InvitationService {
  private static final String ACTIVE = "ACTIVE";
  private static final String DISABLED = "DISABLED";
  private static final String EXHAUSTED = "EXHAUSTED";
  private static final String EXPIRED = "EXPIRED";

  private final InvitationMapper invitationMapper;
  private final InvitationRedemptionMapper redemptionMapper;
  private final UserMapper userMapper;
  private final PasswordService passwordService;
  private final InvitationProperties properties;
  private final SecureRandom secureRandom;
  private final AdminAuditService adminAuditService;

  @Autowired
  public InvitationService(
      InvitationMapper invitationMapper,
      InvitationRedemptionMapper redemptionMapper,
      UserMapper userMapper,
      PasswordService passwordService,
      InvitationProperties properties,
      AdminAuditService adminAuditService
  ) {
    this(invitationMapper, redemptionMapper, userMapper, passwordService, properties, new SecureRandom(), adminAuditService);
  }

  public InvitationService(
      InvitationMapper invitationMapper,
      InvitationRedemptionMapper redemptionMapper,
      UserMapper userMapper,
      PasswordService passwordService,
      InvitationProperties properties
  ) {
    this(invitationMapper, redemptionMapper, userMapper, passwordService, properties, new SecureRandom(), null);
  }

  InvitationService(
      InvitationMapper invitationMapper,
      InvitationRedemptionMapper redemptionMapper,
      UserMapper userMapper,
      PasswordService passwordService,
      InvitationProperties properties,
      SecureRandom secureRandom
  ) {
    this(invitationMapper, redemptionMapper, userMapper, passwordService, properties, secureRandom, null);
  }

  InvitationService(
      InvitationMapper invitationMapper,
      InvitationRedemptionMapper redemptionMapper,
      UserMapper userMapper,
      PasswordService passwordService,
      InvitationProperties properties,
      SecureRandom secureRandom,
      AdminAuditService adminAuditService
  ) {
    this.invitationMapper = invitationMapper;
    this.redemptionMapper = redemptionMapper;
    this.userMapper = userMapper;
    this.passwordService = passwordService;
    this.properties = properties;
    this.secureRandom = secureRandom;
    this.adminAuditService = adminAuditService;
  }

  @Transactional
  public InvitationResponse create(CreateInvitationRequest request, User administrator) {
    requireConfigured();
    int maxUses = request.getMaxUses() == null ? 1 : request.getMaxUses();
    validateCreation(maxUses, request.getExpiresAt());

    String code = generateCode();
    Invitation invitation = new Invitation();
    invitation.setLabel(request.getLabel().trim());
    invitation.setCodeDigest(digest(code));
    invitation.setCodeHint(code.substring(code.length() - 4));
    invitation.setStatus(ACTIVE);
    invitation.setMaxUses(maxUses);
    invitation.setUsedCount(0);
    invitation.setExpiresAt(request.getExpiresAt());
    invitation.setCreatedBy(administrator.getId());
    invitationMapper.insert(invitation);
    return response(invitation, code);
  }

  @Transactional
  public InvitationResponse create(CreateInvitationRequest request, User administrator, AdminAuditContext context) {
    InvitationResponse response = create(request, administrator);
    adminAuditService.success(administrator.getId(), "INVITATION_CREATED", "invitation", response.getId(), Map.of(),
        Map.of("label", response.getLabel(), "maxUses", response.getMaxUses(), "expiresAt", String.valueOf(response.getExpiresAt())), context);
    return response;
  }

  public InvitationResponse replayCreated(long id, User administrator) {
    Invitation invitation=invitationMapper.selectById(id);
    if(invitation==null || !java.util.Objects.equals(invitation.getCreatedBy(),administrator.getId()))
      throw new BusinessException("CREATE_ALREADY_COMMITTED","原请求已完成，原记录现已不可用，请核对请求结果。");
    // Only the first successful response carries the raw code. Never retain it in a receipt.
    return response(invitation,null);
  }

  public List<InvitationResponse> list() {
    return invitationMapper.selectList(new LambdaQueryWrapper<Invitation>()
            .orderByDesc(Invitation::getCreatedAt))
        .stream()
        .map(invitation -> response(invitation, null))
        .collect(Collectors.toList());
  }

  public InvitationResponse get(long id) {
    Invitation value=invitationMapper.selectById(id);
    if(value==null)throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND,"邀请码不存在。");
    return response(value,null);
  }

  @Transactional
  public InvitationResponse disable(Long invitationId, User administrator) {
    Invitation invitation = invitationMapper.selectByIdForUpdate(invitationId);
    if (invitation == null) {
      throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "邀请码不存在。");
    }
    if (!DISABLED.equals(invitation.getStatus())) {
      invitation.setStatus(DISABLED);
      invitation.setDisabledBy(administrator.getId());
      invitation.setDisabledAt(LocalDateTime.now());
      invitationMapper.updateById(invitation);
    }
    return response(invitation, null);
  }

  @Transactional
  public InvitationResponse disable(Long invitationId, User administrator, AdminAuditContext context) {
    Invitation before=invitationMapper.selectByIdForUpdate(invitationId);
    if(before==null)throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND,"邀请码不存在。");
    if(DISABLED.equals(before.getStatus()))return response(before,null);
    String previousStatus=before.getStatus();
    InvitationResponse response = disable(invitationId, administrator);
    adminAuditService.success(administrator.getId(), "INVITATION_DISABLED", "invitation", invitationId,
        Map.of("status", previousStatus), Map.of("status", response.getStatus()), context);
    return response;
  }

  @Transactional
  public User register(RegisterRequest request) {
    requireConfigured();
    String rawCode = request.getInvitationCode() == null ? "" : request.getInvitationCode().trim();
    if (!StringUtils.hasText(rawCode)) {
      throw new BusinessException(ErrorCode.INVITATION_REQUIRED, "请输入邀请码。");
    }

    Invitation invitation = invitationMapper.selectByDigestForUpdate(digest(rawCode));
    validateRedeemable(invitation);

    String username = request.getUsername().trim();
    Long existing = userMapper.selectCount(new LambdaQueryWrapper<User>()
        .eq(User::getUsername, username)
        .eq(User::getDeleted, 0));
    if (existing != null && existing > 0) {
      throw new BusinessException(ErrorCode.AUTH_USERNAME_TAKEN, "用户名已存在。");
    }

    LocalDateTime now = LocalDateTime.now();
    User user = new User();
    user.setUsername(username);
    user.setPasswordHash(passwordService.encode(request.getPassword()));
    user.setForcePasswordChange(0);
    user.setPasswordChangedAt(now);
    user.setNickname(StringUtils.hasText(request.getNickname()) ? request.getNickname().trim() : username);
    user.setUserType("NORMAL");
    user.setOnlineStatus("OFFLINE");
    user.setLevel(0);
    user.setExp(0);
    user.setLoginVersion(UUID.randomUUID().toString());
    user.setDeleted(0);
    try {
      userMapper.insert(user);
    } catch (DuplicateKeyException exception) {
      throw new BusinessException(ErrorCode.AUTH_USERNAME_TAKEN, "用户名已存在。");
    }

    InvitationRedemption redemption = new InvitationRedemption();
    redemption.setInvitationId(invitation.getId());
    redemption.setUserId(user.getId());
    redemption.setRedeemedAt(now);
    redemptionMapper.insert(redemption);

    int usedCount = invitation.getUsedCount() + 1;
    invitation.setUsedCount(usedCount);
    if (usedCount >= invitation.getMaxUses()) {
      invitation.setStatus(EXHAUSTED);
    }
    invitationMapper.updateById(invitation);
    return user;
  }

  private void validateCreation(int maxUses, LocalDateTime expiresAt) {
    if (maxUses < 1 || maxUses > properties.getMaximumUses()) {
      throw new BusinessException(ErrorCode.VALIDATION_ERROR, "邀请码使用次数需要在 1 到 100 之间。");
    }
    if (expiresAt != null && !expiresAt.isAfter(LocalDateTime.now())) {
      throw new BusinessException(ErrorCode.VALIDATION_ERROR, "邀请码过期时间必须晚于当前时间。");
    }
    if (maxUses > 1 && expiresAt == null) {
      throw new BusinessException(ErrorCode.VALIDATION_ERROR, "批量邀请码必须设置过期时间。");
    }
  }

  private void validateRedeemable(Invitation invitation) {
    if (invitation == null) {
      throw new BusinessException(ErrorCode.INVITATION_INVALID, "邀请码无效。");
    }
    if (DISABLED.equals(invitation.getStatus())) {
      throw new BusinessException(ErrorCode.INVITATION_DISABLED, "邀请码已停用。");
    }
    if (invitation.getExpiresAt() != null && !invitation.getExpiresAt().isAfter(LocalDateTime.now())) {
      throw new BusinessException(ErrorCode.INVITATION_EXPIRED, "邀请码已过期。");
    }
    if (EXHAUSTED.equals(invitation.getStatus())
        || invitation.getUsedCount() == null
        || invitation.getMaxUses() == null
        || invitation.getUsedCount() >= invitation.getMaxUses()) {
      throw new BusinessException(ErrorCode.INVITATION_EXHAUSTED, "邀请码已用完。");
    }
    if (!ACTIVE.equals(invitation.getStatus())) {
      throw new BusinessException(ErrorCode.INVITATION_INVALID, "邀请码无效。");
    }
  }

  private InvitationResponse response(Invitation invitation, String oneTimeCode) {
    InvitationResponse response = new InvitationResponse();
    response.setId(invitation.getId());
    response.setLabel(invitation.getLabel());
    response.setCode(oneTimeCode);
    response.setCodeHint(invitation.getCodeHint());
    response.setStatus(resolveStatus(invitation));
    response.setMaxUses(invitation.getMaxUses());
    response.setUsedCount(invitation.getUsedCount());
    response.setExpiresAt(invitation.getExpiresAt());
    response.setCreatedBy(invitation.getCreatedBy());
    response.setDisabledBy(invitation.getDisabledBy());
    response.setDisabledAt(invitation.getDisabledAt());
    response.setCreatedAt(invitation.getCreatedAt());
    return response;
  }

  private String resolveStatus(Invitation invitation) {
    if (ACTIVE.equals(invitation.getStatus())
        && invitation.getExpiresAt() != null
        && !invitation.getExpiresAt().isAfter(LocalDateTime.now())) {
      return EXPIRED;
    }
    return invitation.getStatus();
  }

  private String generateCode() {
    int bytes = Math.max(16, properties.getCodeBytes());
    byte[] random = new byte[bytes];
    secureRandom.nextBytes(random);
    return "SR-" + Base64.getUrlEncoder().withoutPadding().encodeToString(random);
  }

  private String digest(String code) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      digest.update(properties.getPepper().getBytes(StandardCharsets.UTF_8));
      digest.update((byte) 0);
      byte[] bytes = digest.digest(code.getBytes(StandardCharsets.UTF_8));
      StringBuilder result = new StringBuilder(64);
      for (byte value : bytes) {
        result.append(String.format("%02x", value & 0xff));
      }
      return result.toString();
    } catch (NoSuchAlgorithmException exception) {
      throw new IllegalStateException("Invitation digest is unavailable", exception);
    }
  }

  private void requireConfigured() {
    int pepperBytes = properties.getPepper() == null
        ? 0
        : properties.getPepper().getBytes(StandardCharsets.UTF_8).length;
    if (pepperBytes < 32 || properties.getCodeBytes() < 16) {
      throw new BusinessException(
          ErrorCode.INVITATION_CONFIGURATION_ERROR,
          "邀请码服务尚未安全配置。"
      );
    }
  }
}
