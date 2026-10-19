package com.studyroom.health;

public interface ReadinessProbe {
  String name();
  void verify() throws Exception;
}
