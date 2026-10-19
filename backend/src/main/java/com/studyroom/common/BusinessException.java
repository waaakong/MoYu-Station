package com.studyroom.common;

public class BusinessException extends RuntimeException {
  private final String code;

  public BusinessException(String message) {
    this(ErrorCode.BUSINESS_RULE_VIOLATION, message);
  }

  public BusinessException(ErrorCode code, String message) {
    this(code.name(), message);
  }

  public BusinessException(String code, String message) {
    super(message);
    this.code = code;
  }

  public String getCode() {
    return code;
  }
}
