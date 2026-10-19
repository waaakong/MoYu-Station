package com.studyroom.security;

import com.studyroom.config.PasswordProperties;
import com.studyroom.dto.*;
import org.junit.jupiter.api.Test;
import javax.validation.Validation;
import static org.assertj.core.api.Assertions.assertThat;

class PasswordTransportValidationTest {
  @Test void allPasswordDtosAllowValidUnicodeWithoutChangingTheServiceBudget() {
    String password = "a".repeat(60) + "\uD83D\uDE00".repeat(3);
    PasswordService service = new PasswordService(new PasswordProperties());
    service.validateNewPassword(password);
    assertThat(password.length()).isEqualTo(66);
    try (var factory = Validation.buildDefaultValidatorFactory()) {
      var validator = factory.getValidator();
      RegisterRequest registration = new RegisterRequest();
      registration.setUsername("fixture"); registration.setInvitationCode("fixture-only"); registration.setPassword(password);
      LoginRequest login = new LoginRequest(); login.setUsername("fixture"); login.setPassword(password);
      UpdateOwnPasswordRequest own = new UpdateOwnPasswordRequest(); own.setOldPassword(password); own.setNewPassword(password);
      UpdatePasswordRequest reset = new UpdatePasswordRequest(); reset.setPassword(password);
      for (Object request : new Object[]{registration, login, own, reset}) assertThat(validator.validate(request)).isEmpty();
    }
  }
}
