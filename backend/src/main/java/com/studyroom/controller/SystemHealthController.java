package com.studyroom.controller;

import com.studyroom.config.ReleaseProperties;
import com.studyroom.dto.SystemHealthResponse;
import com.studyroom.service.ProductionReadinessService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/system/health")
public class SystemHealthController {
  private final ProductionReadinessService readinessService;
  private final ReleaseProperties release;

  public SystemHealthController(ProductionReadinessService readinessService, ReleaseProperties release) {
    this.readinessService = readinessService;
    this.release = release;
  }

  @GetMapping("/live")
  public SystemHealthResponse live() {
    return new SystemHealthResponse(
        "UP", release.getId(), release.getGitSha(), release.getBuiltAt(), null, Map.of());
  }

  @GetMapping("/ready")
  public ResponseEntity<SystemHealthResponse> ready() {
    SystemHealthResponse response = readinessService.current();
    HttpStatus status = "READY".equals(response.state()) ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    return ResponseEntity.status(status).body(response);
  }
}
