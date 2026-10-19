package com.studyroom.dto;

public class AdminVersionRequest {
  @javax.validation.constraints.Pattern(regexp="^(0|[1-9][0-9]{0,18})$")
  private String expectedVersion;
  public String getExpectedVersion(){return expectedVersion;}
  public void setExpectedVersion(String value){expectedVersion=value;}
}
