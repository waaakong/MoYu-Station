package com.studyroom.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;

public class FeedbackRequest extends ReliableCreateRequest {
  private String feedbackType = "SUGGESTION";

  @NotBlank(message = "请输入反馈标题")
  @Size(max = 100, message = "反馈标题不能超过 100 个字符")
  private String title;

  @NotBlank(message = "请输入反馈内容")
  @Size(max = 360, message = "反馈内容不能超过 360 个字符")
  private String content;

  public String getFeedbackType() {
    return feedbackType;
  }

  public void setFeedbackType(String feedbackType) {
    this.feedbackType = feedbackType;
  }

  public String getTitle() {
    return title;
  }

  public void setTitle(String title) {
    this.title = title;
  }

  public String getContent() {
    return content;
  }

  public void setContent(String content) {
    this.content = content;
  }
}

