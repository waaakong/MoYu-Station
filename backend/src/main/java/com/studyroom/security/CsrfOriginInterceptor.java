package com.studyroom.security;

import com.studyroom.common.BusinessException;
import com.studyroom.common.ErrorCode;
import com.studyroom.config.CorsOriginProperties;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;
import java.util.Set;

@Component
public class CsrfOriginInterceptor implements HandlerInterceptor {
  private static final Set<String> WRITE_METHODS = Set.of("POST", "PUT", "PATCH", "DELETE");
  private final CsrfTokenService tokenService;
  private final CorsOriginProperties originProperties;

  public CsrfOriginInterceptor(CsrfTokenService tokenService, CorsOriginProperties originProperties) {
    this.tokenService = tokenService;
    this.originProperties = originProperties;
  }

  @Override
  public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
    if (!WRITE_METHODS.contains(request.getMethod())) return true;
    if (!originProperties.isAllowedOrigin(request.getHeader("Origin"))) throw invalid();
    HttpSession session = request.getSession(false);
    if (session == null || !tokenService.matches(session, request.getHeader(CsrfTokenService.HEADER_NAME))) {
      throw invalid();
    }
    return true;
  }

  private BusinessException invalid() {
    return new BusinessException(ErrorCode.AUTH_CSRF_INVALID, "请求验证已失效，请刷新后重试。");
  }
}
