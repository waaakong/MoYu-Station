package com.studyroom.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.studyroom.common.AccountLoggedInElsewhereException;
import com.studyroom.common.BusinessException;
import com.studyroom.common.ErrorCode;
import com.studyroom.dto.LoginRequest;
import com.studyroom.dto.RegisterRequest;
import com.studyroom.dto.UserProfileResponse;
import com.studyroom.entity.User;
import com.studyroom.mapper.UserMapper;
import com.studyroom.security.PasswordService;
import com.studyroom.security.AdminReverificationService;
import com.studyroom.security.SessionPolicyInterceptor;
import com.studyroom.config.AuthSecurityProperties;
import org.springframework.stereotype.Service;

import javax.servlet.http.HttpSession;
import java.time.LocalDateTime;
import java.util.Objects;
import java.util.UUID;

@Service
public class AuthService {
  public static final String SESSION_USER_ID = "STUDYROOM_USER_ID";
  public static final String SESSION_LOGIN_VERSION = "STUDYROOM_LOGIN_VERSION";

  private final UserMapper userMapper;
  private final PasswordService passwordService;
  private final InvitationService invitationService;
  private final AuthSecurityProperties securityProperties;

  public AuthService(
      UserMapper userMapper,
      PasswordService passwordService,
      InvitationService invitationService,
      AuthSecurityProperties securityProperties
  ) {
    this.userMapper = userMapper;
    this.passwordService = passwordService;
    this.invitationService = invitationService;
    this.securityProperties = securityProperties;
  }

  public User requireCurrentUser(HttpSession session) {
    Object userId = session.getAttribute(SESSION_USER_ID);
    Object sessionLoginVersion = session.getAttribute(SESSION_LOGIN_VERSION);
    if (!(userId instanceof Long) || !(sessionLoginVersion instanceof String)) {
      throw new BusinessException(ErrorCode.AUTH_REQUIRED, "请先登录。");
    }

    User user = userMapper.selectById((Long) userId);
    if (user == null || Integer.valueOf(1).equals(user.getDeleted())) {
      session.invalidate();
      throw new BusinessException(ErrorCode.AUTH_REQUIRED, "请先登录。");
    }

    if (!Objects.equals(user.getLoginVersion(), sessionLoginVersion)) {
      session.invalidate();
      throw staleSession();
    }

    return user;
  }

  public User requireActiveUser(HttpSession session) {
    User user = requireCurrentUser(session);
    if ("BANNED".equalsIgnoreCase(user.getUserType())) {
      session.invalidate();
      throw new BusinessException(ErrorCode.AUTH_ACCOUNT_BANNED, "账号已被封禁，无法使用后续功能。");
    }
    return user;
  }

  public User requireAdmin(HttpSession session) {
    User user = requireActiveUser(session);
    if (!"ADMIN".equalsIgnoreCase(user.getUserType())) {
      throw new BusinessException(ErrorCode.AUTH_FORBIDDEN, "没有管理员权限。");
    }
    return user;
  }

  public UserProfileResponse login(LoginRequest request, HttpSession session) {
    return login(request, session, false);
  }

  public UserProfileResponse login(LoginRequest request, HttpSession session, boolean rememberedDesktopSession) {
    User user = userMapper.selectOne(new LambdaQueryWrapper<User>()
        .eq(User::getUsername, request.getUsername())
        .eq(User::getDeleted, 0)
        .last("LIMIT 1"));
    if (user == null) {
      throw invalidCredentials();
    }

    boolean legacyAdministratorUpgrade = false;
    if (!passwordService.matches(request.getPassword(), user.getPasswordHash())) {
      legacyAdministratorUpgrade = "ADMIN".equalsIgnoreCase(user.getUserType())
          && passwordService.isLegacyMd5Hash(user.getPasswordHash())
          && passwordService.matchesLegacyMd5(request.getPassword(), user.getPasswordHash());
      if (!legacyAdministratorUpgrade) {
        throw invalidCredentials();
      }
    }

    String previousHash = user.getPasswordHash();
    String previousVersion = user.getLoginVersion();
    String loginVersion = securityProperties.isConcurrentSessions() && !legacyAdministratorUpgrade
        && previousVersion != null && !previousVersion.isBlank() ? previousVersion : UUID.randomUUID().toString();
    LocalDateTime now = LocalDateTime.now();
    if (legacyAdministratorUpgrade) {
      user.setPasswordHash(passwordService.encodeLegacyUpgrade(request.getPassword()));
      user.setForcePasswordChange(1);
      user.setPasswordChangedAt(now);
    }
    user.setLastLoginAt(now);
    user.setLastActiveAt(now);
    user.setOnlineStatus("IDLE");
    user.setLoginVersion(loginVersion);
    {
      // Narrow compare-and-set: a concurrent reset/ban must not be overwritten by a stale login snapshot.
      var condition = new LambdaUpdateWrapper<User>().eq(User::getId, user.getId())
          .eq(User::getDeleted, 0).eq(User::getPasswordHash, previousHash).eq(User::getUserType, user.getUserType());
      if (previousVersion == null) condition.isNull(User::getLoginVersion);
      else condition.eq(User::getLoginVersion, previousVersion);
      var patch = new User();
      patch.setLastLoginAt(now); patch.setLastActiveAt(now); patch.setOnlineStatus("IDLE"); patch.setLoginVersion(loginVersion);
      if (legacyAdministratorUpgrade) {
        patch.setPasswordHash(user.getPasswordHash()); patch.setForcePasswordChange(1); patch.setPasswordChangedAt(now);
      }
      if (userMapper.update(patch, condition) != 1) throw new BusinessException(ErrorCode.AUTH_SESSION_EXPIRED, "账号状态已变化，请重新登录。");
    }
    AdminReverificationService.clearVerification(session);
    session.setAttribute(SESSION_USER_ID, user.getId());
    session.setAttribute(SESSION_LOGIN_VERSION, loginVersion);
    long nowMillis = System.currentTimeMillis();
    session.setAttribute(SessionPolicyInterceptor.REMEMBERED_ATTRIBUTE, rememberedDesktopSession);
    session.setAttribute(SessionPolicyInterceptor.CREATED_AT_ATTRIBUTE, nowMillis);
    session.setAttribute(SessionPolicyInterceptor.COOKIE_REFRESHED_AT_ATTRIBUTE, nowMillis);
    session.setMaxInactiveInterval(Math.toIntExact((rememberedDesktopSession
        ? securityProperties.getDesktopSessionLifetime()
        : securityProperties.getWebSessionIdle()).toSeconds()));

    return toProfileResponse(user);
  }

  public UserProfileResponse register(RegisterRequest request) {
    return toProfileResponse(invitationService.register(request));
  }

  public UserProfileResponse currentUser(HttpSession session) {
    Object userId = session.getAttribute(SESSION_USER_ID);
    Object sessionLoginVersion = session.getAttribute(SESSION_LOGIN_VERSION);
    if (!(userId instanceof Long) || !(sessionLoginVersion instanceof String)) {
      return null;
    }

    User user = userMapper.selectById((Long) userId);
    if (user == null || Integer.valueOf(1).equals(user.getDeleted())) {
      session.invalidate();
      return null;
    }

    if (!Objects.equals(user.getLoginVersion(), sessionLoginVersion)) {
      session.invalidate();
      throw staleSession();
    }

    return toProfileResponse(user);
  }

  public void logout(HttpSession session) {
    Object userId = session.getAttribute(SESSION_USER_ID);
    if (userId instanceof Long && !securityProperties.isConcurrentSessions()) {
      userMapper.update(null, new LambdaUpdateWrapper<User>()
          .eq(User::getId, userId)
          .set(User::getOnlineStatus, "OFFLINE")
          .set(User::getLastActiveAt, null));
    }
    session.invalidate();
  }

  private RuntimeException staleSession() {
    return securityProperties.isConcurrentSessions()
        ? new BusinessException(ErrorCode.AUTH_SESSION_EXPIRED, "账号安全状态已变化，请重新登录。")
        : new AccountLoggedInElsewhereException();
  }

  public UserProfileResponse toProfileResponse(User user) {
    UserProfileResponse response = new UserProfileResponse();
    response.setId(user.getId());
    response.setUsername(user.getUsername());
    response.setNickname(user.getNickname());
    response.setAvatarUrl(user.getAvatarUrl());
    response.setUserType(user.getUserType());
    response.setOnlineStatus(user.getOnlineStatus());
    response.setBanReason(user.getBanReason());
    response.setLevel(nullToZero(user.getLevel()));
    int exp = nullToZero(user.getExp());
    int nextLevelExp = FocusLevelCalculator.nextLevelExp(nullToZero(user.getLevel()));
    int currentLevelExp = Math.max(0, Math.min(exp, nextLevelExp));
    response.setExp(exp);
    response.setCurrentLevelExp(currentLevelExp);
    response.setNextLevelExp(nextLevelExp);
    response.setLevelProgress(nextLevelExp <= 0 ? 0 : Math.max(0, Math.min(100, Math.round(currentLevelExp * 100f / nextLevelExp))));
    response.setCreatedAt(user.getCreatedAt() == null ? "" : user.getCreatedAt().toLocalDate().toString());
    response.setPrivacy("所有上传内容仅自己可见，存储在浏览器或账户中，不主动清除不丢失。");
    response.setPasswordChangeRequired(Integer.valueOf(1).equals(user.getForcePasswordChange()));
    return response;
  }

  private BusinessException invalidCredentials() {
    return new BusinessException(ErrorCode.AUTH_INVALID_CREDENTIALS, "用户名或密码不正确。");
  }

  private int nullToZero(Integer value) {
    return value == null ? 0 : value;
  }

}
