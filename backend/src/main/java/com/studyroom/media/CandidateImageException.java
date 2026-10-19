package com.studyroom.media;

/** Stable, non-sensitive failures for the future asset adapter. */
public final class CandidateImageException extends RuntimeException {
  private final String code;

  public CandidateImageException(String code, String message) {
    super(message);
    this.code = code;
  }

  public String code() { return code; }

  static CandidateImageException invalid() {
    return new CandidateImageException("MEDIA_INVALID_IMAGE", "图片结构或内容损坏，请重新选择。");
  }

  static CandidateImageException color() {
    return new CandidateImageException("MEDIA_COLOR_PROFILE", "请先将图片转换为标准 sRGB 候选后重新上传。");
  }

  static CandidateImageException animated() {
    return new CandidateImageException("MEDIA_ANIMATED", "此入口仅支持静态图片，不能将动图转换成单帧上传。");
  }
}
