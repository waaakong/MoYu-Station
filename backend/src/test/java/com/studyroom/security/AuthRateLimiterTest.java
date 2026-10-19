package com.studyroom.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.studyroom.common.AuthRateLimitException;
import com.studyroom.config.AuthSecurityProperties;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.mock.web.MockHttpServletRequest;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

class AuthRateLimiterTest {
  @Test
  void redisCounterLimitsAndNeverStoresRawUsernameInTheKey() {
    StringRedisTemplate redis = mock(StringRedisTemplate.class);
    ConcurrentHashMap<String, AtomicLong> attempts = new ConcurrentHashMap<>();
    when(redis.execute(any(DefaultRedisScript.class), anyList(), any(), any())).thenAnswer(invocation -> {
      String key = invocation.getArgument(1, java.util.List.class).get(0).toString();
      assertThat(key).doesNotContain("SensitiveUser");
      long attempt = attempts.computeIfAbsent(key, ignored -> new AtomicLong()).incrementAndGet();
      return attempt > 10 ? -120_000L : attempt;
    });
    AuthRateLimiter limiter = new AuthRateLimiter(redis, new AuthSecurityProperties());
    MockHttpServletRequest request = request("203.0.113.8");

    for (int index = 0; index < 10; index++) limiter.checkLogin(request, "SensitiveUser");
    assertThat(attempts).hasSize(2);
    assertThatThrownBy(() -> limiter.checkLogin(request, "SensitiveUser"))
        .isInstanceOfSatisfying(AuthRateLimitException.class,
            error -> assertThat(error.getRetryAfterSeconds()).isEqualTo(120));
  }

  @Test
  void registrationUsesIndependentAddressAndInvitationDigests() {
    StringRedisTemplate redis = mock(StringRedisTemplate.class);
    ConcurrentHashMap<String, AtomicLong> attempts = new ConcurrentHashMap<>();
    when(redis.execute(any(DefaultRedisScript.class), anyList(), any(), any())).thenAnswer(invocation -> {
      String key = invocation.getArgument(1, java.util.List.class).get(0).toString();
      assertThat(key).doesNotContain("PrivateInviteCode");
      return attempts.computeIfAbsent(key, ignored -> new AtomicLong()).incrementAndGet();
    });
    AuthRateLimiter limiter = new AuthRateLimiter(redis, new AuthSecurityProperties());

    limiter.checkRegistration(request("203.0.113.10"), "PrivateInviteCode");

    assertThat(attempts).hasSize(2);
    assertThat(attempts.keySet()).allMatch(key -> key.startsWith("studyroom:auth-rate:register:"));
  }

  @Test
  void redisFailureUsesTheStricterBoundedFallback() {
    StringRedisTemplate redis = mock(StringRedisTemplate.class);
    when(redis.execute(any(DefaultRedisScript.class), anyList(), any(), any()))
        .thenThrow(new IllegalStateException("redis unavailable"));
    AuthSecurityProperties properties = new AuthSecurityProperties();
    properties.getLogin().setFallbackMaximumAttempts(2);
    AuthRateLimiter limiter = new AuthRateLimiter(redis, properties);
    MockHttpServletRequest request = request("203.0.113.9");

    limiter.checkLogin(request, "member");
    limiter.checkLogin(request, "member");
    assertThatThrownBy(() -> limiter.checkLogin(request, "member"))
        .isInstanceOf(AuthRateLimitException.class);
  }

  @Test
  void localLimiterNeverExceedsItsFixedCapacity() {
    BoundedLocalRateLimiter limiter = new BoundedLocalRateLimiter(
        2,
        Clock.fixed(Instant.parse("2026-09-16T00:00:00Z"), ZoneOffset.UTC)
    );
    limiter.consume("a", 5, Duration.ofMinutes(5));
    limiter.consume("b", 5, Duration.ofMinutes(5));
    BoundedLocalRateLimiter.Result overflow = limiter.consume("c", 5, Duration.ofMinutes(5));
    assertThat(limiter.size()).isEqualTo(2);
    assertThat(overflow.allowed()).isFalse();
  }

  @Test
  void forwardedAddressIsTrustedOnlyFromLoopbackProxy() {
    MockHttpServletRequest proxy = request("127.0.0.1");
    proxy.addHeader("X-Forwarded-For", "198.51.100.7, 127.0.0.1");
    assertThat(AuthRateLimiter.clientAddress(proxy)).isEqualTo("198.51.100.7");

    MockHttpServletRequest direct = request("203.0.113.2");
    direct.addHeader("X-Forwarded-For", "198.51.100.9");
    assertThat(AuthRateLimiter.clientAddress(direct)).isEqualTo("203.0.113.2");
  }

  private MockHttpServletRequest request(String remoteAddress) {
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.setRemoteAddr(remoteAddress);
    return request;
  }
}
