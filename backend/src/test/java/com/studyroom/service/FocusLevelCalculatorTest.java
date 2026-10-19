package com.studyroom.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class FocusLevelCalculatorTest {
  @Test
  void addExperienceLevelsUpAndCarriesOverflowWithinCurrentLevel() {
    FocusLevelCalculator.LevelProgress firstCheckin = FocusLevelCalculator.addExperience(0, 0, 1);
    assertThat(firstCheckin.level()).isEqualTo(1);
    assertThat(firstCheckin.exp()).isEqualTo(0);
    assertThat(firstCheckin.nextLevelExp()).isEqualTo(2);

    FocusLevelCalculator.LevelProgress secondLevelProgress = FocusLevelCalculator.addExperience(1, 1, 1);
    assertThat(secondLevelProgress.level()).isEqualTo(2);
    assertThat(secondLevelProgress.exp()).isEqualTo(0);
    assertThat(secondLevelProgress.nextLevelExp()).isEqualTo(4);

    FocusLevelCalculator.LevelProgress overflow = FocusLevelCalculator.addExperience(2, 3, 3);
    assertThat(overflow.level()).isEqualTo(3);
    assertThat(overflow.exp()).isEqualTo(2);
    assertThat(overflow.nextLevelExp()).isEqualTo(8);
  }
}
