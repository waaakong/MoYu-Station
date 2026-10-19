package com.studyroom.controller;

import com.studyroom.common.ApiResponse;
import com.studyroom.dto.ClientReleasePolicyRequest;
import com.studyroom.dto.ClientUpdateMembershipRequest;
import com.studyroom.entity.User;
import com.studyroom.service.AuthService;
import com.studyroom.service.ClientUpdateService;
import com.studyroom.service.AdminAuditContext;
import com.studyroom.security.RequireRecentAdminVerification;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpSession;
import java.util.List;

@RestController
@RequestMapping("/api/admin/client-updates")
public class ClientUpdateAdminController {
  private final AuthService authService;
  private final ClientUpdateService clientUpdateService;
  @org.springframework.beans.factory.annotation.Autowired private com.studyroom.service.AdminAccessService access;

  public ClientUpdateAdminController(AuthService authService, ClientUpdateService clientUpdateService) {
    this.authService = authService;
    this.clientUpdateService = clientUpdateService;
  }

  @GetMapping("/members")
  public ApiResponse<List<ClientUpdateService.MembershipView>> members(HttpSession session) {
    authService.requireAdmin(session);
    return ApiResponse.ok(clientUpdateService.memberships());
  }

  @PutMapping("/members/{userId}")
  @RequireRecentAdminVerification(action = "UPDATE_MEMBERSHIP_CHANGED", targetType = "update-membership", targetIdArgument = 0)
  public ApiResponse<java.util.Map<String,Object>> updateMember(
      @PathVariable Long userId,
      @Validated @RequestBody ClientUpdateMembershipRequest request,
      HttpSession session,
      HttpServletRequest servletRequest
  ) {
    User actor = authService.requireAdmin(session);
    return ApiResponse.ok(access.changeMember(actor,userId,request,AdminAuditContext.from(servletRequest,request.getReason())));
  }

  @GetMapping("/members/page") public ApiResponse<com.studyroom.service.AdminAccessService.Page> memberPage(@org.springframework.web.bind.annotation.RequestParam(required=false) String cursor,HttpSession session){authService.requireAdmin(session);return ApiResponse.ok(access.memberPage(cursor));}
  @GetMapping("/members/{userId}") public ApiResponse<java.util.Map<String,Object>> member(@PathVariable long userId,@org.springframework.web.bind.annotation.RequestParam String channel,HttpSession session){authService.requireAdmin(session);return ApiResponse.ok(access.member(userId,channel));}

  @GetMapping("/releases")
  public ApiResponse<List<ClientUpdateService.ReleaseView>> releases(HttpSession session) {
    authService.requireAdmin(session);
    return ApiResponse.ok(clientUpdateService.releases());
  }

  @PatchMapping("/releases/{releaseId}")
  @RequireRecentAdminVerification(action = "RELEASE_POLICY_UPDATED", targetType = "release", targetIdArgument = 0)
  public ApiResponse<ClientUpdateService.ReleaseView> updateRelease(
      @PathVariable Long releaseId,
      @Validated @RequestBody ClientReleasePolicyRequest request,
      HttpSession session,
      HttpServletRequest servletRequest
  ) {
    User actor = authService.requireAdmin(session);
    return ApiResponse.ok(clientUpdateService.updateReleasePolicy(actor, releaseId, request, AdminAuditContext.from(servletRequest, request.getReason())));
  }

  @GetMapping("/releases/page")
  public ApiResponse<ClientUpdateService.ReleasePage> releasePage(
      @org.springframework.web.bind.annotation.RequestParam(required = false) String cursor, HttpSession session) {
    authService.requireAdmin(session);
    return ApiResponse.ok(clientUpdateService.releasePage(cursor));
  }

  @GetMapping("/releases/{releaseId}")
  public ApiResponse<ClientUpdateService.ReleaseView> release(@PathVariable Long releaseId, HttpSession session) {
    authService.requireAdmin(session);
    return ApiResponse.ok(clientUpdateService.getRelease(releaseId));
  }
}
