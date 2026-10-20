package com.studyroom.controller;

import com.studyroom.common.ApiResponse;
import com.studyroom.dto.ClientUpdateCheckRequest;
import com.studyroom.entity.User;
import com.studyroom.service.AuthService;
import com.studyroom.service.ClientUpdateService;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpSession;

@RestController
@RequestMapping("/api/client-updates")
public class ClientUpdateController {
  private final AuthService authService;
  private final ClientUpdateService clientUpdateService;

  public ClientUpdateController(AuthService authService, ClientUpdateService clientUpdateService) {
    this.authService = authService;
    this.clientUpdateService = clientUpdateService;
  }

  @PostMapping("/check")
  public ApiResponse<ClientUpdateService.CheckResponse> check(
      @Validated @RequestBody ClientUpdateCheckRequest request,
      HttpSession session
  ) {
    User user = authService.requireActiveUser(session);
    return ApiResponse.ok(clientUpdateService.check(user, request, session));
  }
}
