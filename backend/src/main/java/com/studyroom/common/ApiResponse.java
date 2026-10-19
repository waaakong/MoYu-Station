package com.studyroom.common;

public class ApiResponse<T> {
  private boolean success;
  private String code;
  private String message;
  private T data;

  public ApiResponse() {
  }

  public ApiResponse(boolean success, String message, T data) {
    this(success, success ? ErrorCode.OK.name() : ErrorCode.BUSINESS_RULE_VIOLATION.name(), message, data);
  }

  public ApiResponse(boolean success, String code, String message, T data) {
    this.success = success;
    this.code = code;
    this.message = message;
    this.data = data;
  }

  public static <T> ApiResponse<T> ok(T data) {
    return new ApiResponse<>(true, ErrorCode.OK.name(), "ok", data);
  }

  public static <T> ApiResponse<T> fail(String message) {
    return fail(ErrorCode.BUSINESS_RULE_VIOLATION, message);
  }

  public static <T> ApiResponse<T> fail(ErrorCode code, String message) {
    return new ApiResponse<>(false, code.name(), message, null);
  }

  public static <T> ApiResponse<T> fail(String code, String message) {
    return new ApiResponse<>(false, code, message, null);
  }

  public boolean isSuccess() {
    return success;
  }

  public void setSuccess(boolean success) {
    this.success = success;
  }

  public String getCode() {
    return code;
  }

  public void setCode(String code) {
    this.code = code;
  }

  public String getMessage() {
    return message;
  }

  public void setMessage(String message) {
    this.message = message;
  }

  public T getData() {
    return data;
  }

  public void setData(T data) {
    this.data = data;
  }
}
