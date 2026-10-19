package com.studyroom.dto;

public class HeartbeatRequest {
  private Integer activityVersion;
  public Integer getActivityVersion(){return activityVersion;}
  public void setActivityVersion(Integer value){activityVersion=value;}
  private String onlineStatus;

  public String getOnlineStatus() {
    return onlineStatus;
  }

  public void setOnlineStatus(String onlineStatus) {
    this.onlineStatus = onlineStatus;
  }
}
