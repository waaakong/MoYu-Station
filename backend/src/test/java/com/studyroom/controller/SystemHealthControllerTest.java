package com.studyroom.controller;

import com.studyroom.config.ReleaseProperties;
import com.studyroom.dto.HealthComponentStatus;
import com.studyroom.dto.SystemHealthResponse;
import com.studyroom.service.ProductionReadinessService;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.Map;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class SystemHealthControllerTest {
  @Test
  void livenessExposesOnlyReleaseIdentity() throws Exception {
    ProductionReadinessService service = mock(ProductionReadinessService.class);
    MockMvc mvc = mvc(service);
    mvc.perform(get("/api/system/health/live"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.state").value("UP"))
        .andExpect(jsonPath("$.releaseId").value("phase12-test"))
        .andExpect(jsonPath("$.components").isEmpty());
  }

  @Test
  void readinessUses503WithoutReturningDependencyDetails() throws Exception {
    ProductionReadinessService service = mock(ProductionReadinessService.class);
    when(service.current()).thenReturn(new SystemHealthResponse(
        "NOT_READY", "phase12-test", "0123456789abcdef", "2026-09-17T02:00:00Z", "2026-09-17T02:01:00Z",
        Map.of("database", HealthComponentStatus.down("READINESS_DATABASE_UNAVAILABLE"))));
    mvc(service).perform(get("/api/system/health/ready"))
        .andExpect(status().isServiceUnavailable())
        .andExpect(jsonPath("$.components.database.errorCode").value("READINESS_DATABASE_UNAVAILABLE"))
        .andExpect(jsonPath("$.components.database.details").doesNotExist());
  }

  private MockMvc mvc(ProductionReadinessService service) {
    ReleaseProperties release = new ReleaseProperties();
    release.setId("phase12-test");
    release.setGitSha("0123456789abcdef");
    release.setBuiltAt("2026-09-17T02:00:00Z");
    return MockMvcBuilders.standaloneSetup(new SystemHealthController(service, release)).build();
  }
}
