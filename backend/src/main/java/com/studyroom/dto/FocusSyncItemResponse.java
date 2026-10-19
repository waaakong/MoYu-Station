package com.studyroom.dto;

public class FocusSyncItemResponse {
  private String clientRecordId;
  private String status;
  @com.fasterxml.jackson.databind.annotation.JsonSerialize(using=com.fasterxml.jackson.databind.ser.std.ToStringSerializer.class)
  private Long cloudRecordId;
  private String message;

  public static FocusSyncItemResponse of(String clientRecordId, String status, Long cloudRecordId, String message) {
    FocusSyncItemResponse response = new FocusSyncItemResponse();
    response.clientRecordId = clientRecordId;
    response.status = status;
    response.cloudRecordId = cloudRecordId;
    response.message = message;
    return response;
  }

  public String getClientRecordId() { return clientRecordId; }
  public String getStatus() { return status; }
  public Long getCloudRecordId() { return cloudRecordId; }
  public String getMessage() { return message; }
}
