package com.studyroom.security;

import com.studyroom.common.BusinessException;
import com.studyroom.common.ErrorCode;
import com.studyroom.config.PasswordProperties;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Locale;
import java.util.regex.Pattern;

@Service
public class PasswordService {
  private static final Pattern BCRYPT_HASH = Pattern.compile("^\\$2[aby]\\$\\d{2}\\$[./A-Za-z0-9]{53}$");
  private static final Pattern LEGACY_MD5_HASH = Pattern.compile("^[0-9a-fA-F]{32}$");

  private final PasswordProperties properties;
  private final BCryptPasswordEncoder encoder;

  public PasswordService(PasswordProperties properties) {
    this.properties = properties;
    this.encoder = new BCryptPasswordEncoder(properties.getBcryptStrength());
  }

  public String encode(String rawPassword) {
    validateNewPassword(rawPassword);
    return encoder.encode(rawPassword);
  }

  public String encodeLegacyUpgrade(String rawPassword) {
    if (!StringUtils.hasText(rawPassword) || !isLoginCandidateAllowed(rawPassword)) {
      throw policyViolation();
    }
    return encoder.encode(rawPassword);
  }

  public boolean matches(String rawPassword, String encodedPassword) {
    if (!isLoginCandidateAllowed(rawPassword) || !isBcryptHash(encodedPassword)) {
      return false;
    }
    return encoder.matches(rawPassword, encodedPassword);
  }

  public boolean isBcryptHash(String encodedPassword) {
    return encodedPassword != null && BCRYPT_HASH.matcher(encodedPassword).matches();
  }

  public boolean isLegacyMd5Hash(String encodedPassword) {
    return encodedPassword != null && LEGACY_MD5_HASH.matcher(encodedPassword).matches();
  }

  public boolean matchesLegacyMd5(String rawPassword, String encodedPassword) {
    if (!isLoginCandidateAllowed(rawPassword) || !isLegacyMd5Hash(encodedPassword)) {
      return false;
    }
    byte[] actual = legacyMd5(rawPassword).getBytes(StandardCharsets.US_ASCII);
    byte[] expected = encodedPassword.toLowerCase(Locale.ROOT).getBytes(StandardCharsets.US_ASCII);
    return MessageDigest.isEqual(actual, expected);
  }

  public void validateNewPassword(String rawPassword) {
    if (!StringUtils.hasText(rawPassword)) {
      throw policyViolation();
    }
    int characters = rawPassword.codePointCount(0, rawPassword.length());
    int bytes = rawPassword.getBytes(StandardCharsets.UTF_8).length;
    if (characters < properties.getMinimumCharacters()
        || characters > properties.getMaximumCharacters()
        || bytes > properties.getMaximumUtf8Bytes()) {
      throw policyViolation();
    }
  }

  private boolean isLoginCandidateAllowed(String rawPassword) {
    if (rawPassword == null) {
      return false;
    }
    int characters = rawPassword.codePointCount(0, rawPassword.length());
    return characters <= properties.getMaximumCharacters()
        && rawPassword.getBytes(StandardCharsets.UTF_8).length <= properties.getMaximumUtf8Bytes();
  }

  private BusinessException policyViolation() {
    return new BusinessException(
        ErrorCode.PASSWORD_POLICY_VIOLATION,
        "密码需要为 8-64 个字符，且 UTF-8 编码不能超过 72 字节。"
    );
  }

  private String legacyMd5(String rawPassword) {
    try {
      byte[] bytes = MessageDigest.getInstance("MD5").digest(rawPassword.getBytes(StandardCharsets.UTF_8));
      StringBuilder result = new StringBuilder(32);
      for (byte value : bytes) {
        result.append(String.format("%02x", value & 0xff));
      }
      return result.toString();
    } catch (NoSuchAlgorithmException exception) {
      throw new IllegalStateException("Legacy password verifier is unavailable", exception);
    }
  }
}
