package com.studyroom.security;

import com.studyroom.common.BusinessException;
import com.studyroom.entity.User;
import com.studyroom.service.AdminAuditContext;
import com.studyroom.service.AdminAuditService;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpSession;

@Aspect
@Component
public class RecentAdminVerificationAspect {
  private final AdminReverificationService reverificationService;
  private final AdminAuditService auditService;

  public RecentAdminVerificationAspect(AdminReverificationService reverificationService, AdminAuditService auditService) {
    this.reverificationService = reverificationService;
    this.auditService = auditService;
  }

  @Around("@annotation(requirement)")
  public Object verify(ProceedingJoinPoint joinPoint, RequireRecentAdminVerification requirement) throws Throwable {
    HttpSession session = findSession(joinPoint.getArgs());
    User actor = reverificationService.requireVerified(session);
    try {
      return joinPoint.proceed();
    } catch (Throwable error) {
      String code = error instanceof BusinessException ? ((BusinessException) error).getCode() : "INTERNAL_ERROR";
      Object targetId = requirement.targetIdArgument() >= 0 && requirement.targetIdArgument() < joinPoint.getArgs().length
          ? joinPoint.getArgs()[requirement.targetIdArgument()] : "-";
      HttpServletRequest request = currentRequest();
      try {
        auditService.failure(actor.getId(), requirement.action(), requirement.targetType(), targetId, code, AdminAuditContext.from(request, null));
      } catch (RuntimeException ignored) {
        // The original mutation has already failed. Do not replace its stable error with a secondary audit error.
      }
      throw error;
    }
  }

  private HttpSession findSession(Object[] arguments) {
    for (Object argument : arguments) if (argument instanceof HttpSession) return (HttpSession) argument;
    HttpServletRequest request = currentRequest();
    if (request != null) return request.getSession(false);
    throw new BusinessException("ADMIN_REVERIFY_REQUIRED", "请先重新验证管理员密码。");
  }

  private HttpServletRequest currentRequest() {
    if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes) {
      return ((ServletRequestAttributes) RequestContextHolder.getRequestAttributes()).getRequest();
    }
    return null;
  }
}
