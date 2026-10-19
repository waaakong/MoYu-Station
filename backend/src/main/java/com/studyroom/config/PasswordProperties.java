package com.studyroom.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "studyroom.password")
public class PasswordProperties {
  private int bcryptStrength = 11;
  private int minimumCharacters = 8;
  private int maximumCharacters = 64;
  private int maximumUtf8Bytes = 72;

  public int getBcryptStrength() {
    return bcryptStrength;
  }

  public void setBcryptStrength(int bcryptStrength) {
    this.bcryptStrength = bcryptStrength;
  }

  public int getMinimumCharacters() {
    return minimumCharacters;
  }

  public void setMinimumCharacters(int minimumCharacters) {
    this.minimumCharacters = minimumCharacters;
  }

  public int getMaximumCharacters() {
    return maximumCharacters;
  }

  public void setMaximumCharacters(int maximumCharacters) {
    this.maximumCharacters = maximumCharacters;
  }

  public int getMaximumUtf8Bytes() {
    return maximumUtf8Bytes;
  }

  public void setMaximumUtf8Bytes(int maximumUtf8Bytes) {
    this.maximumUtf8Bytes = maximumUtf8Bytes;
  }
}
