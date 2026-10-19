package com.studyroom.controller;

import com.studyroom.config.RadioRelayProperties;
import com.studyroom.service.RadioRelayService;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class RadioControllerTest {
  @Test
  void relayIsNotExposedWhenDefaultDisabled() throws Exception {
    RadioRelayProperties properties = new RadioRelayProperties();
    RadioRelayService service = new RadioRelayService(properties);
    MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new RadioController(service)).build();

    mockMvc.perform(get("/api/radio/stations/somafm-groove-salad/stream"))
        .andExpect(status().isNotFound());
    mockMvc.perform(get("/api/radio/stations/unknown/stream"))
        .andExpect(status().isNotFound());
  }

  @Test
  void connectionBudgetCannotExceedTen() {
    RadioRelayProperties properties = new RadioRelayProperties();
    properties.setMaxConnections(99);
    org.junit.jupiter.api.Assertions.assertEquals(10, properties.getMaxConnections());
  }
}
