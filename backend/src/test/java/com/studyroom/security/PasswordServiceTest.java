package com.studyroom.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

import com.studyroom.common.BusinessException;
import com.studyroom.common.ErrorCode;
import com.studyroom.config.PasswordProperties;
import org.junit.jupiter.api.Test;

class PasswordServiceTest {

  private final PasswordService service = new PasswordService(new PasswordProperties());

  @Test
  void encodesNewPasswordsWithConfiguredBcryptCost() {
    String hash = service.encode("correct horse battery staple");

    assertThat(hash).startsWith("$2a$11$");
    assertThat(service.matches("correct horse battery staple", hash)).isTrue();
    assertThat(service.matches("incorrect password", hash)).isFalse();
  }

  @Test
  void rejectsPasswordsOutsideCharacterOrBcryptByteLimits() {
    assertPolicyViolation("short");
    assertPolicyViolation("a".repeat(65));
    assertPolicyViolation("界".repeat(25));
  }

  @Test
  void legacyVerifierRequiresExactlyThirtyTwoHexCharacters() throws Exception {
    String digest = legacyMd5("legacy-password");

    assertThat(service.isLegacyMd5Hash(digest)).isTrue();
    assertThat(service.matchesLegacyMd5("legacy-password", digest.toUpperCase())).isTrue();
    assertThat(service.matchesLegacyMd5("wrong-password", digest)).isFalse();
    assertThat(service.isLegacyMd5Hash(digest + "0")).isFalse();
    assertThat(service.isLegacyMd5Hash("g".repeat(32))).isFalse();
  }

  @Test
  void malformedBcryptHashesAreRejectedWithoutThrowing() {
    assertThat(service.matches("correct horse battery staple", "not-bcrypt")).isFalse();
    assertThat(service.matches("correct horse battery staple", "$2a$99$invalid")).isFalse();
  }

  private void assertPolicyViolation(String password) {
    assertThatThrownBy(() -> service.encode(password))
        .isInstanceOfSatisfying(BusinessException.class, exception ->
            assertThat(exception.getCode()).isEqualTo(ErrorCode.PASSWORD_POLICY_VIOLATION.name()));
  }

  private String legacyMd5(String rawPassword) throws Exception {
    byte[] digest = MessageDigest.getInstance("MD5").digest(rawPassword.getBytes(StandardCharsets.UTF_8));
    StringBuilder result = new StringBuilder(32);
    for (byte value : digest) {
      result.append(String.format("%02x", value & 0xff));
    }
    return result.toString();
  }
}
