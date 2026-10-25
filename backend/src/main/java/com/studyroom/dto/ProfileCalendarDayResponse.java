package com.studyroom.dto;

import java.math.BigDecimal;

public class ProfileCalendarDayResponse {
  private String fishTimingBasis;
  public String getFishTimingBasis(){return fishTimingBasis;}
  public void setFishTimingBasis(String value){fishTimingBasis=value;}
  private String coverage;
  private Integer onlineMinutes,fishMinutes;
  public String getCoverage(){return coverage;}
  public void setCoverage(String value){coverage=value;}
  public Integer getOnlineMinutes(){return onlineMinutes;}
  public void setOnlineMinutes(Integer value){onlineMinutes=value;}
  public Integer getFishMinutes(){return fishMinutes;}
  public void setFishMinutes(Integer value){fishMinutes=value;}
  private String date;
  private Integer focusMinutes;
  private BigDecimal fakeEffortIndex;
  private String status;

  public String getDate() {
    return date;
  }

  public void setDate(String date) {
    this.date = date;
  }

  public Integer getFocusMinutes() {
    return focusMinutes;
  }

  public void setFocusMinutes(Integer focusMinutes) {
    this.focusMinutes = focusMinutes;
  }

  public BigDecimal getFakeEffortIndex() {
    return fakeEffortIndex;
  }

  public void setFakeEffortIndex(BigDecimal fakeEffortIndex) {
    this.fakeEffortIndex = fakeEffortIndex;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }
}

