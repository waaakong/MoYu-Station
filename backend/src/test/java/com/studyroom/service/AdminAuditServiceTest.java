package com.studyroom.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyroom.entity.AdminAudit;
import com.studyroom.mapper.AdminAuditMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class AdminAuditServiceTest {
  @Test
  void auditUsesAnAllowlistAndHashesTheUserAgent() {
    AdminAuditMapper mapper = mock(AdminAuditMapper.class);
    AdminAuditService service = new AdminAuditService(mapper, new ObjectMapper());

    service.success(1L, "USER_TYPE_UPDATED", "user", 9L,
        Map.of("userType", "NORMAL", "password", "must-not-leak"),
        Map.of("userType", "ADMIN", "token", "must-not-leak"),
        new AdminAuditContext("127.0.0.1", "test-agent", "approved role change"));

    ArgumentCaptor<AdminAudit> captor = ArgumentCaptor.forClass(AdminAudit.class);
    verify(mapper).insert(captor.capture());
    AdminAudit audit = captor.getValue();
    assertThat(audit.getBeforeJson()).isEqualTo("{\"userType\":\"NORMAL\"}");
    assertThat(audit.getAfterJson()).isEqualTo("{\"userType\":\"ADMIN\"}");
    assertThat(audit.getBeforeJson() + audit.getAfterJson()).doesNotContain("password", "token", "must-not-leak");
    assertThat(audit.getUserAgentHash()).hasSize(64).doesNotContain("test-agent");
  }
}
