package com.studyroom.dto;

import org.junit.jupiter.api.Test;

import javax.validation.Validation;
import javax.validation.Validator;

import static org.assertj.core.api.Assertions.assertThat;

class SendChatMessageRequestTest {
  private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();

  @Test
  void acceptsAnAbsentClientMessageIdForLegacyClients() {
    SendChatMessageRequest request = new SendChatMessageRequest();

    assertThat(VALIDATOR.validateProperty(request, "clientMessageId")).isEmpty();
  }

  @Test
  void rejectsClientMessageIdsLongerThanTheProtocolLimit() {
    SendChatMessageRequest request = new SendChatMessageRequest();
    request.setClientMessageId("x".repeat(65));

    assertThat(VALIDATOR.validateProperty(request, "clientMessageId"))
        .singleElement()
        .satisfies(violation -> assertThat(violation.getMessage()).contains("64"));
  }
}
