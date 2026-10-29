package com.studyroom.common;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import javax.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@RestControllerAdvice
public class GlobalExceptionHandler {
  private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

  @ExceptionHandler(AccountLoggedInElsewhereException.class)
  @ResponseStatus(HttpStatus.UNAUTHORIZED)
  public ApiResponse<Void> handleAccountLoggedInElsewhereException(AccountLoggedInElsewhereException exception) {
    return ApiResponse.fail(AccountLoggedInElsewhereException.CODE, exception.getMessage());
  }

  @ExceptionHandler(BusinessException.class)
  public ResponseEntity<ApiResponse<Void>> handleBusinessException(BusinessException exception) {
    HttpStatus status = switch (exception.getCode()) {
      case "AUTH_REQUIRED", "AUTH_SESSION_EXPIRED" -> HttpStatus.UNAUTHORIZED;
      case "AUTH_FORBIDDEN", "AUTH_ACCOUNT_BANNED", "AUTH_CSRF_INVALID" -> HttpStatus.FORBIDDEN;
      case "AUTH_RATE_LIMITED" -> HttpStatus.TOO_MANY_REQUESTS;
      default -> HttpStatus.BAD_REQUEST;
    };
    ResponseEntity.BodyBuilder response = ResponseEntity.status(status);
    if (exception instanceof AuthRateLimitException limited) {
      response.header("Retry-After", Long.toString(limited.getRetryAfterSeconds()));
    }
    return response.body(ApiResponse.fail(exception.getCode(), exception.getMessage()));
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  @ResponseStatus(HttpStatus.BAD_REQUEST)
  public ApiResponse<Void> handleValidationException(MethodArgumentNotValidException exception) {
    String message = exception.getBindingResult().getFieldErrors().stream()
        .findFirst()
        .map(error -> error.getDefaultMessage() == null ? "参数不正确" : error.getDefaultMessage())
        .orElse("参数不正确");
    return ApiResponse.fail(ErrorCode.VALIDATION_ERROR, message);
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<ApiResponse<Void>> handleException(Exception exception, HttpServletResponse response) {
    if (ClientDisconnects.isDisconnected(exception)) {
      log.debug("Client connection closed: {}", exception.getClass().getSimpleName());
      return null;
    }
    log.error("Unhandled request failure", exception);
    // A stream or other committed response cannot accept a second JSON body.
    if (response.isCommitted()) return null;
    String contentType = response.getContentType();
    if (contentType != null && contentType.split(";", 2)[0].trim().equalsIgnoreCase("text/event-stream")) {
      response.setStatus(HttpStatus.INTERNAL_SERVER_ERROR.value());
      return null;
    }
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
        .body(ApiResponse.fail(ErrorCode.INTERNAL_ERROR, "服务暂时不可用，请稍后再试。"));
  }
}
