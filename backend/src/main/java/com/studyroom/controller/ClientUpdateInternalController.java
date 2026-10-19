package com.studyroom.controller;

import com.studyroom.common.ApiResponse;
import com.studyroom.dto.ClientReleaseImportRequest;
import com.studyroom.service.ClientUpdateService;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;

@RestController
@RequestMapping("/api/internal/client-updates")
public class ClientUpdateInternalController {
  private final ClientUpdateService clientUpdateService;

  public ClientUpdateInternalController(ClientUpdateService clientUpdateService) {
    this.clientUpdateService = clientUpdateService;
  }

  @GetMapping("/access")
  public ResponseEntity<Void> verifyAccess(
      @RequestHeader(value = "Authorization", required = false) String authorization,
      @RequestHeader(value = "X-Original-URI", required = false) String originalUri
  ) {
    return clientUpdateService.verifyGrant(authorization, originalUri)
        ? ResponseEntity.noContent().build()
        : ResponseEntity.status(401).build();
  }

  @PostMapping("/import")
  public ApiResponse<ClientUpdateService.ReleaseView> importRelease(
      @Validated @RequestBody ClientReleaseImportRequest request,
      @RequestHeader(value = "X-StudyRoom-Import-Secret", required = false) String importSecret,
      HttpServletRequest servletRequest
  ) {
    return ApiResponse.ok(clientUpdateService.importRelease(request, servletRequest.getRemoteAddr(), importSecret));
  }
}
