package com.studyroom.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ClientVersionTest {
  @Test
  void comparesStableAndPrereleaseVersionsUsingSemverRules() {
    assertThat(ClientVersion.parse("1.0.0")).isGreaterThan(ClientVersion.parse("1.0.0-beta.9"));
    assertThat(ClientVersion.parse("1.0.0-beta.10")).isGreaterThan(ClientVersion.parse("1.0.0-beta.2"));
    assertThat(ClientVersion.parse("2.0.0")).isGreaterThan(ClientVersion.parse("1.99.99"));
  }

  @Test
  void rejectsNonCanonicalVersions() {
    assertThatThrownBy(() -> ClientVersion.parse("v1.0.0")).isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> ClientVersion.parse("1.01.0")).isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> ClientVersion.parse("1.0")).isInstanceOf(IllegalArgumentException.class);
  }
}
