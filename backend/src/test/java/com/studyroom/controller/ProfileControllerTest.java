package com.studyroom.controller;

import com.studyroom.dto.UserProfileResponse;
import com.studyroom.entity.User;
import com.studyroom.service.AuthService;
import com.studyroom.service.ProfileService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class ProfileControllerTest {
  @Mock
  private AuthService authService;
  @Mock
  private ProfileService profileService;
  private MockMvc mockMvc;

  @BeforeEach
  void setUp() {
    mockMvc = MockMvcBuilders.standaloneSetup(new ProfileController(authService, profileService)).build();
  }

  @Test
  void retiredCustomSceneRoutesAreNotMapped() throws Exception {
    MockMultipartFile image = new MockMultipartFile("file", "scene.webp", "image/webp", new byte[]{1});

    mockMvc.perform(get("/api/profile/custom-scene")).andExpect(status().isNotFound());
    mockMvc.perform(post("/api/profile/custom-scene/name")
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"sceneName\":\"旧场景\"}"))
        .andExpect(status().isNotFound());
    mockMvc.perform(multipart("/api/profile/custom-scene/images/morning").file(image))
        .andExpect(status().isNotFound());
    mockMvc.perform(delete("/api/profile/custom-scene/images/morning"))
        .andExpect(status().isNotFound());
  }

  @Test
  void profileOverviewRouteRemainsMapped() throws Exception {
    when(authService.requireActiveUser(any())).thenReturn(new User());
    when(profileService.profile(any())).thenReturn(new UserProfileResponse());

    mockMvc.perform(get("/api/profile/me")).andExpect(status().isOk());
  }
}
