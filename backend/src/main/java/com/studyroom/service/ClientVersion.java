package com.studyroom.service;

import java.math.BigInteger;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class ClientVersion implements Comparable<ClientVersion> {
  private static final Pattern PATTERN = Pattern.compile(
      "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?$"
  );

  private final String raw;
  private final BigInteger major;
  private final BigInteger minor;
  private final BigInteger patch;
  private final List<String> prerelease;

  private ClientVersion(String raw, BigInteger major, BigInteger minor, BigInteger patch, List<String> prerelease) {
    this.raw = raw;
    this.major = major;
    this.minor = minor;
    this.patch = patch;
    this.prerelease = prerelease;
  }

  public static ClientVersion parse(String value) {
    String normalized = value == null ? "" : value.trim();
    Matcher matcher = PATTERN.matcher(normalized);
    if (!matcher.matches()) throw new IllegalArgumentException("客户端版本必须使用 SemVer。");
    List<String> prerelease = new ArrayList<>();
    if (matcher.group(4) != null) prerelease.addAll(List.of(matcher.group(4).split("\\.")));
    return new ClientVersion(
        normalized,
        new BigInteger(matcher.group(1)),
        new BigInteger(matcher.group(2)),
        new BigInteger(matcher.group(3)),
        List.copyOf(prerelease)
    );
  }

  public boolean isStable() { return prerelease.isEmpty(); }
  public boolean hasPrereleasePrefix(String prefix) {
    return !prerelease.isEmpty() && prerelease.get(0).equals(prefix);
  }

  @Override
  public int compareTo(ClientVersion other) {
    int core = major.compareTo(other.major);
    if (core == 0) core = minor.compareTo(other.minor);
    if (core == 0) core = patch.compareTo(other.patch);
    if (core != 0) return core;
    if (prerelease.isEmpty()) return other.prerelease.isEmpty() ? 0 : 1;
    if (other.prerelease.isEmpty()) return -1;
    int length = Math.max(prerelease.size(), other.prerelease.size());
    for (int index = 0; index < length; index++) {
      if (index >= prerelease.size()) return -1;
      if (index >= other.prerelease.size()) return 1;
      String left = prerelease.get(index);
      String right = other.prerelease.get(index);
      boolean leftNumeric = left.chars().allMatch(Character::isDigit);
      boolean rightNumeric = right.chars().allMatch(Character::isDigit);
      int compared;
      if (leftNumeric && rightNumeric) compared = new BigInteger(left).compareTo(new BigInteger(right));
      else if (leftNumeric != rightNumeric) compared = leftNumeric ? -1 : 1;
      else compared = left.compareTo(right);
      if (compared != 0) return compared;
    }
    return 0;
  }

  @Override public String toString() { return raw; }
  @Override public boolean equals(Object value) { return value instanceof ClientVersion other && compareTo(other) == 0; }
  @Override public int hashCode() { return Objects.hash(major, minor, patch, prerelease); }
}
