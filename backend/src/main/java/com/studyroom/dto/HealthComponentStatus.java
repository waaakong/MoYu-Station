package com.studyroom.dto;

public record HealthComponentStatus(String state, String errorCode) {
  public static HealthComponentStatus up() {
    return new HealthComponentStatus("UP", null);
  }

  public static HealthComponentStatus down(String errorCode) {
    return new HealthComponentStatus("DOWN", errorCode);
  }
}
