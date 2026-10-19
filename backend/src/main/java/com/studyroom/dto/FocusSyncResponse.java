package com.studyroom.dto;

import java.util.List;

public class FocusSyncResponse {
  private final List<FocusSyncItemResponse> results;

  public FocusSyncResponse(List<FocusSyncItemResponse> results) { this.results = results; }
  public List<FocusSyncItemResponse> getResults() { return results; }
}
