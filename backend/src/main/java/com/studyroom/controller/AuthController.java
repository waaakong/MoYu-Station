package com.studyroom.controller;

import com.studyroom.common.ApiResponse;
import com.studyroom.common.BusinessException;
import com.studyroom.common.ErrorCode;
import com.studyroom.config.AuthSecurityProperties;
import com.studyroom.dto.LoginRequest;
import com.studyroom.dto.RegisterRequest;
import com.studyroom.dto.UserProfileResponse;
import com.studyroom.service.AuthService;
import com.studyroom.security.AuthRateLimiter;
import com.studyroom.security.CsrfTokenService;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpSession;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
  private final AuthService authService;
  private final AuthRateLimiter rateLimiter;
  private final CsrfTokenService csrfTokenService;
  private final AuthSecurityProperties securityProperties;

  public AuthController(
      AuthService authService,
      AuthRateLimiter rateLimiter,
      CsrfTokenService csrfTokenService,
      AuthSecurityProperties securityProperties
  ) {
    this.authService = authService;
    this.rateLimiter = rateLimiter;
    this.csrfTokenService = csrfTokenService;
    this.securityProperties = securityProperties;
  }

  @GetMapping("/csrf")
  public ApiResponse<Map<String, String>> csrf(HttpSession session) {
    return ApiResponse.ok(Map.of("token", csrfTokenService.issue(session)));
  }

  @PostMapping("/login")
  public ApiResponse<UserProfileResponse> login(
      @Validated @RequestBody LoginRequest request,
      HttpServletRequest servletRequest,
      HttpSession session
  ) {
    rateLimiter.checkLogin(servletRequest, request.getUsername());
    boolean desktop = isDesktopRequest(servletRequest);
    if (request.isRememberMe() && !desktop) {
      throw new BusinessException(ErrorCode.OPERATION_NOT_ALLOWED, "保持登录仅适用于桌面客户端。");
    }
    UserProfileResponse profile = authService.login(request, session, request.isRememberMe() && desktop);
    servletRequest.changeSessionId();
    csrfTokenService.rotate(session);
    return ApiResponse.ok(profile);
  }

  @PostMapping("/register")
  public ApiResponse<UserProfileResponse> register(
      @Validated @RequestBody RegisterRequest request,
      HttpServletRequest servletRequest
  ) {
    rateLimiter.checkRegistration(servletRequest, request.getInvitationCode());
    return ApiResponse.ok(authService.register(request));
  }

  @GetMapping("/me")
  public ApiResponse<UserProfileResponse> me(HttpSession session) {
    return ApiResponse.ok(authService.currentUser(session));
  }

  @PostMapping("/logout")
  public ApiResponse<Void> logout(HttpSession session) {
    authService.logout(session);
    return ApiResponse.ok(null);
  }

  private boolean isDesktopRequest(HttpServletRequest request) {
    return securityProperties.getDesktopHeaderValue().equals(request.getHeader(securityProperties.getDesktopHeaderName()))
        && securityProperties.getDesktopOrigin().equals(request.getHeader("Origin"));
  }
}
