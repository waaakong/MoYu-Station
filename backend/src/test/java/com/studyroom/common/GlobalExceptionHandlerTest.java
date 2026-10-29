package com.studyroom.common;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletResponse;
import java.io.IOException;
import javax.servlet.http.HttpServletResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class GlobalExceptionHandlerTest {
  @RestController
  static class StreamController {
    @GetMapping("/test-stream")
    void stream(HttpServletResponse response) throws IOException {
      response.setContentType("text/event-stream");
      response.getWriter().write("data: ready\n\n");
      response.flushBuffer();
      throw new IOException("Broken pipe");
    }
  }

  @Test
  void mvcDoesNotAppendJsonToCommittedEventStream() throws Exception {
    MockMvcBuilders.standaloneSetup(new StreamController())
        .setControllerAdvice(new GlobalExceptionHandler()).build()
        .perform(get("/test-stream"))
        .andExpect(status().isOk())
        .andExpect(content().string("data: ready\n\n"));
  }
  @Test
  void disconnectedStreamDoesNotWriteJsonOrForce500() {
    MockHttpServletResponse response = new MockHttpServletResponse();
    response.setContentType("text/event-stream");
    response.setCommitted(true);
    assertThat(new GlobalExceptionHandler().handleException(new IOException("Broken pipe"), response)).isNull();
    assertThat(response.getStatus()).isEqualTo(200);
    assertThat(response.getContentAsByteArray()).isEmpty();
  }

  @Test
  void committedBusinessFailureDoesNotWriteSecondBody() {
    MockHttpServletResponse response = new MockHttpServletResponse();
    response.setContentType("text/event-stream");
    response.setCommitted(true);
    assertThat(new GlobalExceptionHandler().handleException(new IllegalStateException("sampling failed"), response)).isNull();
    assertThat(response.getContentAsByteArray()).isEmpty();
  }

  @Test
  void uncommittedStreamFailureUsesEmpty500InsteadOfJsonForSseConverter() {
    MockHttpServletResponse response = new MockHttpServletResponse();
    response.setContentType("text/event-stream;charset=UTF-8");
    assertThat(new GlobalExceptionHandler().handleException(new IllegalStateException("stream failed"), response)).isNull();
    assertThat(response.getStatus()).isEqualTo(500);
    assertThat(response.getContentAsByteArray()).isEmpty();
  }

  @Test
  void ordinaryFailureKeepsJson500() {
    ResponseEntity<ApiResponse<Void>> response = new GlobalExceptionHandler()
        .handleException(new IOException("metrics file unavailable"), new MockHttpServletResponse());
    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
    assertThat(response.getBody().getCode()).isEqualTo(ErrorCode.INTERNAL_ERROR.name());
  }
  @Test
  void rateLimitResponseUses429AndRetryAfter() {
    ResponseEntity<ApiResponse<Void>> response = new GlobalExceptionHandler()
        .handleBusinessException(new AuthRateLimitException(37));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
    assertThat(response.getHeaders().getFirst("Retry-After")).isEqualTo("37");
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().getCode()).isEqualTo(ErrorCode.AUTH_RATE_LIMITED.name());
  }
}
