package com.studyroom.media;

import com.studyroom.common.ApiResponse;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.*;

@Order(-10)
@RestControllerAdvice(assignableTypes = {MediaAssetController.class, MediaPublicationController.class, StickerFavoriteController.class, CustomSceneController.class})
public class MediaApiAdvice {
  @ExceptionHandler(MediaApiException.class)
  public ResponseEntity<ApiResponse<Void>> api(MediaApiException error) {
    var response = ResponseEntity.status(error.status());
    if (error.status() == 503 || error.status() == 429) response.header("Retry-After", "3");
    return response.body(ApiResponse.fail(error.code(), error.getMessage()));
  }
  @ExceptionHandler(CandidateImageException.class)
  public ResponseEntity<ApiResponse<Void>> candidate(CandidateImageException error) {
    return ResponseEntity.status(error.code().equals("MEDIA_TOO_LARGE") ? 413 : 422)
        .body(ApiResponse.fail(error.code(), error.getMessage()));
  }
  @ExceptionHandler(MissingServletRequestParameterException.class)
  public ResponseEntity<ApiResponse<Void>> missingParameter(MissingServletRequestParameterException error) {
    return ResponseEntity.badRequest().body(ApiResponse.fail("MEDIA_INVALID_ID", "缺少上传 ID。"));
  }
}
