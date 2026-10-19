package com.studyroom.controller;

import com.studyroom.common.ApiResponse;
import com.studyroom.dto.AdminReverifyRequest;
import com.studyroom.security.AdminReverificationService;
import com.studyroom.service.AdminAuditService;
import com.studyroom.service.AuthService;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpSession;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
public class AdminAuditController {
  private final AuthService authService;
  private final AdminReverificationService reverificationService;
  private final AdminAuditService auditService;

  public AdminAuditController(AuthService authService, AdminReverificationService reverificationService, AdminAuditService auditService) {
    this.authService = authService;
    this.reverificationService = reverificationService;
    this.auditService = auditService;
  }

  @PostMapping("/reverify")
  public ApiResponse<Map<String, Long>> reverify(@Validated @RequestBody AdminReverifyRequest request, HttpSession session) {
    long expiresAt = reverificationService.verify(request.getPassword(), session);
    return ApiResponse.ok(Map.of("expiresAt", expiresAt));
  }

  @GetMapping("/audits")
  public ApiResponse<AdminAuditService.PageResult> audits(
      @RequestParam(defaultValue = "1") int page,
      @RequestParam(defaultValue = "30") int size,
      @RequestParam(required = false) String action,
      @RequestParam(required = false) Long actorId,
      @RequestParam(required = false) String targetType,
      HttpSession session
  ) {
    authService.requireAdmin(session);
    return ApiResponse.ok(auditService.list(page, size, action, actorId, targetType));
  }
}
