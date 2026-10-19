package com.studyroom.controller;

import com.studyroom.common.ApiResponse;
import com.studyroom.dto.AdminDashboardResponse;
import com.studyroom.dto.AdminFeedbackResponse;
import com.studyroom.dto.AdminPostResponse;
import com.studyroom.dto.AdminUserResponse;
import com.studyroom.dto.DeletePostRequest;
import com.studyroom.dto.UpdateFeedbackStatusRequest;
import com.studyroom.dto.UpdatePasswordRequest;
import com.studyroom.dto.UpdateUserTypeRequest;
import com.studyroom.entity.User;
import com.studyroom.service.AdminService;
import com.studyroom.service.AdminAuditContext;
import com.studyroom.service.AdminDashboardStreamService;
import com.studyroom.service.AdminMetricsSnapshotService;
import com.studyroom.service.AuthService;
import com.studyroom.security.RequireRecentAdminVerification;
import org.springframework.validation.annotation.Validated;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import javax.servlet.http.HttpSession;
import javax.servlet.http.HttpServletRequest;
import java.util.List;

@RestController
@RequestMapping("/api/admin")
public class AdminController {
  private final AuthService authService;
  private final AdminService adminService;
  private final AdminMetricsSnapshotService metricsSnapshots;
  private final AdminDashboardStreamService dashboardStreams;
  @org.springframework.beans.factory.annotation.Autowired
  private com.studyroom.service.AdminRecordService records;

  public AdminController(AuthService authService, AdminService adminService, AdminMetricsSnapshotService metricsSnapshots, AdminDashboardStreamService dashboardStreams) {
    this.authService = authService;
    this.adminService = adminService;
    this.metricsSnapshots = metricsSnapshots;
    this.dashboardStreams = dashboardStreams;
  }

  @GetMapping("/dashboard")
  public ApiResponse<AdminDashboardResponse> dashboard(HttpSession session) {
    authService.requireAdmin(session);
    return ApiResponse.ok(metricsSnapshots.current());
  }

  @GetMapping(value = "/dashboard/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
  public SseEmitter dashboardStream(HttpSession session) {
    authService.requireAdmin(session);
    return dashboardStreams.connect();
  }

  @GetMapping("/users")
  public ApiResponse<List<AdminUserResponse>> users(HttpSession session) {
    authService.requireAdmin(session);
    return ApiResponse.ok(adminService.users());
  }

  @PatchMapping("/users/{id}/type")
  @RequireRecentAdminVerification(action = "USER_TYPE_UPDATED", targetType = "user", targetIdArgument = 0)
  public ApiResponse<Void> updateUserType(
      @PathVariable Long id,
      @Validated @RequestBody UpdateUserTypeRequest request,
      HttpSession session,
      HttpServletRequest servletRequest
  ) {
    User actor = authService.requireAdmin(session);
    records.role(actor, id, request.getExpectedVersion(), request.getUserType(), AdminAuditContext.from(servletRequest, null));
    return ApiResponse.ok(null);
  }

  @PatchMapping("/users/{id}/password")
  @RequireRecentAdminVerification(action = "USER_PASSWORD_RESET", targetType = "user", targetIdArgument = 0)
  public ApiResponse<Void> updatePassword(
      @PathVariable Long id,
      @Validated @RequestBody UpdatePasswordRequest request,
      HttpSession session,
      HttpServletRequest servletRequest
  ) {
    User actor = authService.requireAdmin(session);
    records.password(actor, id, request.getExpectedVersion(), request.getPassword(), AdminAuditContext.from(servletRequest, null));
    return ApiResponse.ok(null);
  }

  @GetMapping("/posts")
  public ApiResponse<List<AdminPostResponse>> posts(HttpSession session) {
    authService.requireAdmin(session);
    return ApiResponse.ok(adminService.posts());
  }

  @DeleteMapping("/posts/{id}")
  @RequireRecentAdminVerification(action = "POST_FORCE_DELETED", targetType = "post", targetIdArgument = 0)
  public ApiResponse<Void> deletePost(
      @PathVariable Long id,
      @RequestBody(required = false) DeletePostRequest request,
      HttpSession session,
      HttpServletRequest servletRequest
  ) {
    User actor = authService.requireAdmin(session);
    String reason = request == null ? null : request.getReason();
    adminService.deletePost(actor, id, reason, AdminAuditContext.from(servletRequest, reason));
    return ApiResponse.ok(null);
  }

  @GetMapping("/feedback")
  public ApiResponse<List<AdminFeedbackResponse>> feedback(HttpSession session) {
    authService.requireAdmin(session);
    return ApiResponse.ok(adminService.feedback());
  }

  @PatchMapping("/feedback/{id}/status")
  @RequireRecentAdminVerification(action = "FEEDBACK_STATUS_UPDATED", targetType = "feedback", targetIdArgument = 0)
  public ApiResponse<Void> updateFeedbackStatus(
      @PathVariable Long id,
      @Validated @RequestBody UpdateFeedbackStatusRequest request,
      HttpSession session,
      HttpServletRequest servletRequest
  ) {
    User actor = authService.requireAdmin(session);
    records.feedback(actor, id, request.getExpectedVersion(), request.getStatus(), AdminAuditContext.from(servletRequest, null));
    return ApiResponse.ok(null);
  }

  @DeleteMapping("/feedback/{id}")
  @RequireRecentAdminVerification(action = "FEEDBACK_DELETED", targetType = "feedback", targetIdArgument = 0)
  public ApiResponse<Void> deleteFeedback(@PathVariable Long id, @Validated @RequestBody com.studyroom.dto.AdminVersionRequest request, HttpSession session, HttpServletRequest servletRequest) {
    User actor = authService.requireAdmin(session);
    records.deleteFeedback(actor, id, request.getExpectedVersion(), AdminAuditContext.from(servletRequest, null));
    return ApiResponse.ok(null);
  }

  @GetMapping("/pages/{module}")
  public ApiResponse<com.studyroom.service.AdminRecordService.Page> page(@PathVariable String module,
      @org.springframework.web.bind.annotation.RequestParam(required=false) String cursor,
      @org.springframework.web.bind.annotation.RequestParam(required=false) String role,HttpSession session){
    authService.requireAdmin(session);return ApiResponse.ok(records.page(module,cursor,role));
  }
}
