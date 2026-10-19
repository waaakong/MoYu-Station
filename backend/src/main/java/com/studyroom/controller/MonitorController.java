package com.studyroom.controller;

import com.studyroom.common.ApiResponse;
import com.studyroom.dto.HeartbeatRequest;
import com.studyroom.service.ActiveVisitorService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpSession;

@RestController
@RequestMapping("/api/monitor")
public class MonitorController {
  private com.studyroom.activity.ActivityLedger activity;
  private com.studyroom.service.AuthService auth;
  @org.springframework.beans.factory.annotation.Autowired(required=false)
  public void setActivity(com.studyroom.activity.ActivityLedger value,com.studyroom.service.AuthService authentication){activity=value;auth=authentication;}
  private final ActiveVisitorService activeVisitorService;

  public MonitorController(ActiveVisitorService activeVisitorService) {
    this.activeVisitorService = activeVisitorService;
  }

  @PostMapping("/heartbeat")
  public ApiResponse<Void> heartbeat(@RequestBody(required = false) HeartbeatRequest request, HttpSession session) {
    activeVisitorService.heartbeat(session, request == null ? null : request.getOnlineStatus());
    if(activity!=null && (request==null || !Integer.valueOf(2).equals(request.getActivityVersion())))
      activity.markPartial(auth.requireActiveUser(session).getId(),java.time.LocalDate.now(com.studyroom.activity.ActivityLedger.ZONE));
    return ApiResponse.ok(null);
  }
}
