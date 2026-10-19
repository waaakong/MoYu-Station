package com.studyroom.service;

final class FocusLevelCalculator {
  private FocusLevelCalculator() {
  }

  static LevelProgress addExperience(Integer currentLevel, Integer currentExp, int addedExp) {
    int level = Math.max(0, currentLevel == null ? 0 : currentLevel);
    int exp = Math.max(0, currentExp == null ? 0 : currentExp) + Math.max(0, addedExp);
    while (exp >= nextLevelExp(level)) {
      exp -= nextLevelExp(level);
      level += 1;
    }
    return new LevelProgress(level, exp, nextLevelExp(level));
  }

  static int nextLevelExp(Integer currentLevel) {
    int level = Math.max(0, currentLevel == null ? 0 : currentLevel);
    if (level >= 30) {
      return 1 << 30;
    }
    return 1 << level;
  }

  record LevelProgress(int level, int exp, int nextLevelExp) {
  }
}
