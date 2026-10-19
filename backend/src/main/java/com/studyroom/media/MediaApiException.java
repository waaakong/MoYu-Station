package com.studyroom.media;

public final class MediaApiException extends RuntimeException {
  private final int status;
  private final String code;

  public MediaApiException(int status, String code, String message) {
    super(message); this.status = status; this.code = code;
  }
  public int status() { return status; }
  public String code() { return code; }
  static MediaApiException unavailable() { return new MediaApiException(503, "MEDIA_UNAVAILABLE", "图片服务暂时不可用，请查询上传状态后重试。"); }
  static MediaApiException notFound() { return new MediaApiException(404, "MEDIA_NOT_FOUND", "图片不存在或不可访问。"); }
  static MediaApiException expired() { return new MediaApiException(410, "MEDIA_EXPIRED", "暂存图片已过期，请移除后重新添加。"); }
}
