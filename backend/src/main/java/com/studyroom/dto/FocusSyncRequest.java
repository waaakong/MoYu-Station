package com.studyroom.dto;

import javax.validation.Valid;
import javax.validation.constraints.NotEmpty;
import javax.validation.constraints.Size;
import java.util.List;

public class FocusSyncRequest {
  @Valid @NotEmpty @Size(max = 100)
  private List<FocusSyncRecordRequest> records;

  public List<FocusSyncRecordRequest> getRecords() { return records; }
  public void setRecords(List<FocusSyncRecordRequest> records) { this.records = records; }
}
