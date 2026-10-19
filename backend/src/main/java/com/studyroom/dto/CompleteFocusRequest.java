package com.studyroom.dto;

import javax.validation.constraints.Min;
import javax.validation.constraints.NotNull;

public class CompleteFocusRequest {
  @NotNull
  private Long recordId;
  @Min(0)
  private Integer actualSeconds;

  public Long getRecordId() { return recordId; }
  public void setRecordId(Long recordId) { this.recordId = recordId; }
  public Integer getActualSeconds() { return actualSeconds; }
  public void setActualSeconds(Integer actualSeconds) { this.actualSeconds = actualSeconds; }
}
