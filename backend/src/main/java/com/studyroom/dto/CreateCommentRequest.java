package com.studyroom.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;

public class CreateCommentRequest extends ReliableCreateRequest {
  private Long parentId;
  private Long replyToUserId;

  @NotBlank(message = "评论内容不能为空")
  @Size(max = 300, message = "评论内容不能超过 300 个字符")
  private String content;

  public Long getParentId() {
    return parentId;
  }

  public void setParentId(Long parentId) {
    this.parentId = parentId;
  }

  public Long getReplyToUserId() {
    return replyToUserId;
  }

  public void setReplyToUserId(Long replyToUserId) {
    this.replyToUserId = replyToUserId;
  }

  public String getContent() {
    return content;
  }

  public void setContent(String content) {
    this.content = content;
  }
}
