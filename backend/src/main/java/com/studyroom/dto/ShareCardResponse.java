package com.studyroom.dto;

import java.math.BigDecimal;

public class ShareCardResponse {
  private String coverage;
  public String getCoverage(){return coverage;}
  public void setCoverage(String value){coverage=value;}
  private String statDate;
  private String timeZone;
  public String getStatDate(){return statDate;}
  public void setStatDate(String value){statDate=value;}
  public String getTimeZone(){return timeZone;}
  public void setTimeZone(String value){timeZone=value;}
  private String title;
  private Integer focusMinutes;
  private Integer fishMinutes;
  private BigDecimal fakeEffortIndex;
  private String favoriteScene;
  private String quote;

  public String getTitle() {
    return title;
  }

  public void setTitle(String title) {
    this.title = title;
  }

  public Integer getFocusMinutes() {
    return focusMinutes;
  }

  public void setFocusMinutes(Integer focusMinutes) {
    this.focusMinutes = focusMinutes;
  }

  public Integer getFishMinutes() {
    return fishMinutes;
  }

  public void setFishMinutes(Integer fishMinutes) {
    this.fishMinutes = fishMinutes;
  }

  public BigDecimal getFakeEffortIndex() {
    return fakeEffortIndex;
  }

  public void setFakeEffortIndex(BigDecimal fakeEffortIndex) {
    this.fakeEffortIndex = fakeEffortIndex;
  }

  public String getFavoriteScene() {
    return favoriteScene;
  }

  public void setFavoriteScene(String favoriteScene) {
    this.favoriteScene = favoriteScene;
  }

  public String getQuote() {
    return quote;
  }

  public void setQuote(String quote) {
    this.quote = quote;
  }
}

