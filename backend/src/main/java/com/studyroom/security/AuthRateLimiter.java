package com.studyroom.security;

import com.studyroom.common.AuthRateLimitException;
import com.studyroom.config.AuthSecurityProperties;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

import javax.servlet.http.HttpServletRequest;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;

@Service
public class AuthRateLimiter {
  private static final String PREFIX = "studyroom:auth-rate:";
  private static final DefaultRedisScript<Long> CONSUME_SCRIPT = new DefaultRedisScript<>("""
      local attempts = redis.call('INCR', KEYS[1])
      local window = tonumber(ARGV[1])
      local maximum = tonumber(ARGV[2])
      if attempts == 1 then
        redis.call('PEXPIRE', KEYS[1], window)
      end
      if attempts > maximum then
        local ttl = redis.call('PTTL', KEYS[1])
        if ttl < 1 then
          ttl = window
          redis.call('PEXPIRE', KEYS[1], window)
        end
        return -ttl
      end
      return attempts
      """, Long.class);
  private final StringRedisTemplate redisTemplate;
  private final AuthSecurityProperties properties;
  private final BoundedLocalRateLimiter localFallback;

  public AuthRateLimiter(StringRedisTemplate redisTemplate, AuthSecurityProperties properties) {
    this.redisTemplate = redisTemplate;
    this.properties = properties;
    this.localFallback = new BoundedLocalRateLimiter(properties.getLocalFallbackCapacity());
  }

  public void checkLogin(HttpServletRequest request, String username) {
    check("login", clientAddress(request), normalize(username), properties.getLogin());
  }

  public void checkRegistration(HttpServletRequest request, String invitationCode) {
    check("register", clientAddress(request), invitationCode == null ? "" : invitationCode.trim(), properties.getRegistration());
  }

  private void check(String scope, String address, String identifier, AuthSecurityProperties.Limit limit) {
    String[] keys = {
        PREFIX + scope + ":address:" + sha256(address),
        PREFIX + scope + ":identifier:" + sha256(identifier)
    };
    try {
      for (String key : keys) consumeRedis(key, limit);
    } catch (AuthRateLimitException limited) {
      throw limited;
    } catch (RuntimeException redisUnavailable) {
      for (String key : keys) {
        BoundedLocalRateLimiter.Result result = localFallback.consume(
            key,
            limit.getFallbackMaximumAttempts(),
            limit.getWindow()
        );
        if (!result.allowed()) throw new AuthRateLimitException(result.retryAfterSeconds());
      }
    }
  }

  private void consumeRedis(String key, AuthSecurityProperties.Limit limit) {
    Long result = redisTemplate.execute(
        CONSUME_SCRIPT,
        List.of(key),
        Long.toString(limit.getWindow().toMillis()),
        Integer.toString(limit.getMaximumAttempts())
    );
    if (result == null) throw new IllegalStateException("Redis did not return an auth rate counter");
    if (result < 0) {
      long retryAfterSeconds = Math.max(1, (-result + 999) / 1000);
      throw new AuthRateLimitException(retryAfterSeconds);
    }
  }

  static String clientAddress(HttpServletRequest request) {
    String remote = request.getRemoteAddr();
    if (isLoopback(remote)) {
      String forwarded = request.getHeader("X-Forwarded-For");
      if (forwarded != null) {
        String candidate = forwarded.split(",", 2)[0].trim();
        if (isAddress(candidate)) return candidate;
      }
    }
    return remote == null || remote.isBlank() ? "unknown" : remote;
  }

  private static boolean isLoopback(String address) {
    try {
      return address != null && InetAddress.getByName(address).isLoopbackAddress();
    } catch (Exception ignored) {
      return false;
    }
  }

  private static boolean isAddress(String address) {
    if (address == null || address.isBlank() || address.length() > 64) return false;
    if (!address.matches("[0-9A-Fa-f:.]+")) return false;
    try {
      InetAddress.getByName(address);
      return true;
    } catch (Exception ignored) {
      return false;
    }
  }

  private static String normalize(String value) {
    return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
  }

  private static String sha256(String value) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
          .digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException impossible) {
      throw new IllegalStateException("SHA-256 is unavailable", impossible);
    }
  }
}
