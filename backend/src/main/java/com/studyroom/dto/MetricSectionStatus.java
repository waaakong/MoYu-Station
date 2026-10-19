package com.studyroom.dto;

public class MetricSectionStatus {
  private String status;
  private String sampledAt;
  private String errorCode;

  public MetricSectionStatus() {
  }

  public MetricSectionStatus(String status, String sampledAt, String errorCode) {
    this.status = status;
    this.sampledAt = sampledAt;
    this.errorCode = errorCode;
  }

  public String getStatus() { return status; }
  public void setStatus(String status) { this.status = status; }
  public String getSampledAt() { return sampledAt; }
  public void setSampledAt(String sampledAt) { this.sampledAt = sampledAt; }
  public String getErrorCode() { return errorCode; }
  public void setErrorCode(String errorCode) { this.errorCode = errorCode; }
}
