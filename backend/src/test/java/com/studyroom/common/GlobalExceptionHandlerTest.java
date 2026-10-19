package com.studyroom.common;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

class GlobalExceptionHandlerTest {
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
