package com.studyroom.controller;

import com.studyroom.common.ApiResponse;
import com.studyroom.dto.CreateInvitationRequest;
import com.studyroom.dto.InvitationResponse;
import com.studyroom.entity.User;
import com.studyroom.service.AuthService;
import com.studyroom.service.InvitationService;
import com.studyroom.service.AdminAuditContext;
import com.studyroom.security.RequireRecentAdminVerification;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpSession;
import javax.servlet.http.HttpServletRequest;
import java.util.List;

@RestController
@RequestMapping("/api/admin/invitations")
public class AdminInvitationController {
  private final AuthService authService;
  private final InvitationService invitationService;
  @org.springframework.beans.factory.annotation.Autowired private com.studyroom.service.AdminAccessService access;
  private com.studyroom.service.ReliableCreateService reliable;
  @org.springframework.beans.factory.annotation.Autowired(required=false)
  public void setReliable(com.studyroom.service.ReliableCreateService reliable){this.reliable=reliable;}

  public AdminInvitationController(AuthService authService, InvitationService invitationService) {
    this.authService = authService;
    this.invitationService = invitationService;
  }

  @PostMapping
  @RequireRecentAdminVerification(action = "INVITATION_CREATED", targetType = "invitation")
  public ApiResponse<InvitationResponse> create(
      @Validated @RequestBody CreateInvitationRequest request,
      HttpSession session,
      HttpServletRequest servletRequest
  ) {
    User administrator = authService.requireAdmin(session);
    if(request.getClientRequestId()==null) return ApiResponse.ok(invitationService.create(request, administrator, AdminAuditContext.from(servletRequest, null)));
    return ApiResponse.ok(com.studyroom.service.ReliableCreateService.required(reliable).execute(administrator,
        com.studyroom.service.ReliableCreateService.Kind.INVITATION,request.getClientRequestId(),
        java.util.Arrays.asList(request.getLabel(),request.getMaxUses(),request.getExpiresAt()==null?null:request.getExpiresAt().toString()),
        ()->invitationService.create(request,administrator,AdminAuditContext.from(servletRequest,null)),
        InvitationResponse::getId,target->invitationService.replayCreated(target,administrator)));
  }

  @GetMapping
  public ApiResponse<List<InvitationResponse>> list(HttpSession session) {
    authService.requireAdmin(session);
    return ApiResponse.ok(invitationService.list());
  }

  @PostMapping("/{id}/disable")
  @RequireRecentAdminVerification(action = "INVITATION_DISABLED", targetType = "invitation", targetIdArgument = 0)
  public ApiResponse<java.util.Map<String,Object>> disable(@PathVariable Long id, @Validated @RequestBody com.studyroom.dto.AdminVersionRequest request, HttpSession session, HttpServletRequest servletRequest) {
    User administrator = authService.requireAdmin(session);
    return ApiResponse.ok(access.disable(administrator,id,request.getExpectedVersion(),AdminAuditContext.from(servletRequest,null)));
  }

  @GetMapping("/page") public ApiResponse<com.studyroom.service.AdminAccessService.Page> page(@org.springframework.web.bind.annotation.RequestParam(required=false) String cursor,HttpSession session){authService.requireAdmin(session);return ApiResponse.ok(access.invitationPage(cursor));}
  @GetMapping("/{id}") public ApiResponse<java.util.Map<String,Object>> get(@PathVariable long id,HttpSession session){authService.requireAdmin(session);return ApiResponse.ok(access.invitation(id));}
}
