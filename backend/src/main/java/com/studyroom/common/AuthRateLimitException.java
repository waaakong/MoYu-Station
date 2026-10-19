package com.studyroom.common;

public class AuthRateLimitException extends BusinessException {
  private final long retryAfterSeconds;

  public AuthRateLimitException(long retryAfterSeconds) {
    super(ErrorCode.AUTH_RATE_LIMITED, "尝试次数过多，请稍后再试。");
    this.retryAfterSeconds = Math.max(1, retryAfterSeconds);
  }

  public long getRetryAfterSeconds() {
    return retryAfterSeconds;
  }
}
