package com.studyroom.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;

public class ClientReleasePolicyRequest {
  @NotBlank private String status;
  @javax.validation.constraints.Pattern(regexp = "^(0|[1-9][0-9]{0,18})$")
  private String expectedVersion;
  @NotNull private Integer rolloutPercentage;
  @NotNull private Boolean mandatory;
  @Size(max = 100) private String minimumSupportedVersion;
  @Size(max = 1000) private String releaseNotes;
  @NotBlank @Size(max = 300) private String reason;

  public String getStatus() { return status; }
  public String getExpectedVersion() { return expectedVersion; }
  public void setExpectedVersion(String value) { expectedVersion = value; }
  public void setStatus(String status) { this.status = status; }
  public Integer getRolloutPercentage() { return rolloutPercentage; }
  public void setRolloutPercentage(Integer rolloutPercentage) { this.rolloutPercentage = rolloutPercentage; }
  public Boolean getMandatory() { return mandatory; }
  public void setMandatory(Boolean mandatory) { this.mandatory = mandatory; }
  public String getMinimumSupportedVersion() { return minimumSupportedVersion; }
  public void setMinimumSupportedVersion(String minimumSupportedVersion) { this.minimumSupportedVersion = minimumSupportedVersion; }
  public String getReleaseNotes() { return releaseNotes; }
  public void setReleaseNotes(String releaseNotes) { this.releaseNotes = releaseNotes; }
  public String getReason() { return reason; }
  public void setReason(String reason) { this.reason = reason; }
}
