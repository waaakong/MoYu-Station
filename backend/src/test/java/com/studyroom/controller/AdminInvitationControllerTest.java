package com.studyroom.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;

import com.studyroom.common.GlobalExceptionHandler;
import com.studyroom.dto.InvitationResponse;
import com.studyroom.entity.User;
import com.studyroom.service.AuthService;
import com.studyroom.service.InvitationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@ExtendWith(MockitoExtension.class)
class AdminInvitationControllerTest {
  @Mock private AuthService authService;
  @Mock private InvitationService invitationService;

  private MockMvc mockMvc;
  private User administrator;

  @BeforeEach
  void setUp() {
    administrator = new User();
    administrator.setId(1L);
    administrator.setUserType("ADMIN");
    mockMvc = MockMvcBuilders
        .standaloneSetup(new AdminInvitationController(authService, invitationService))
        .setControllerAdvice(new GlobalExceptionHandler())
        .build();
  }

  @Test
  void createReturnsTheOneTimeCode() throws Exception {
    InvitationResponse response = response("SR-one-time-code");
    when(authService.requireAdmin(any())).thenReturn(administrator);
    when(invitationService.create(any(), any(), any())).thenReturn(response);

    mockMvc.perform(post("/api/admin/invitations")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"label\":\"Pilot member\",\"maxUses\":1}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.code").value("OK"))
        .andExpect(jsonPath("$.data.code").value("SR-one-time-code"));
  }

  @Test
  void listOmitsThePlaintextCodeField() throws Exception {
    when(authService.requireAdmin(any())).thenReturn(administrator);
    when(invitationService.list()).thenReturn(List.of(response(null)));

    mockMvc.perform(get("/api/admin/invitations"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data[0].code").doesNotExist())
        .andExpect(jsonPath("$.data[0].codeHint").value("ABCD"));
  }

  private InvitationResponse response(String code) {
    InvitationResponse response = new InvitationResponse();
    response.setId(10L);
    response.setLabel("Pilot member");
    response.setCode(code);
    response.setCodeHint("ABCD");
    response.setStatus("ACTIVE");
    response.setMaxUses(1);
    response.setUsedCount(0);
    return response;
  }
}
