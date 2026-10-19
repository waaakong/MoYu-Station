package com.studyroom.controller;

import com.studyroom.common.ApiResponse;
import com.studyroom.common.BusinessException;
import com.studyroom.service.AuthService;
import com.studyroom.service.ReliableCreateService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import javax.servlet.http.HttpSession;
import java.util.Map;

@RestController
@RequestMapping("/api/operations")
public class ReliableCreateController {
  private final AuthService auth;
  private ReliableCreateService reliable;
  public ReliableCreateController(AuthService auth) { this.auth=auth; }
  @Autowired(required=false) public void setReliable(ReliableCreateService reliable) { this.reliable=reliable; }

  @GetMapping("/capabilities") public ApiResponse<Map<String,Boolean>> capabilities(HttpSession session) {
    auth.requireActiveUser(session);
    return ApiResponse.ok(Map.of("reliableCreate",reliable!=null));
  }

  @GetMapping("/{kind}/{requestId}") public ApiResponse<Map<String,String>> result(@PathVariable String kind,@PathVariable String requestId,HttpSession session) {
    ReliableCreateService.Kind operation;
    try { operation=ReliableCreateService.Kind.valueOf(kind); }
    catch(IllegalArgumentException invalid) { throw new BusinessException("CREATE_REQUEST_INVALID","操作类型无效。"); }
    var user=operation==ReliableCreateService.Kind.INVITATION?auth.requireAdmin(session):auth.requireActiveUser(session);
    return ApiResponse.ok(ReliableCreateService.required(reliable).result(user.getId(),operation,requestId));
  }
}
