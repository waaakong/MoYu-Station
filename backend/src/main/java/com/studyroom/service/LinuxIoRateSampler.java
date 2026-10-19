package com.studyroom.service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.function.LongSupplier;
import java.util.stream.Stream;

/** Device-level Linux rates, never synthetic process throughput. */
final class LinuxIoRateSampler {
  record Rates(String diskRead, String diskWrite, String receive, String transmit) {}
  private record Counters(long first, long second) {}
  private record Sample(Map<String, Counters> devices, long nanos) {}
  private record Pair(String first, String second) {}
  private static final Pair UNAVAILABLE = new Pair("UNAVAILABLE", "UNAVAILABLE");
  private final Path proc;
  private final Path sys;
  private final LongSupplier clock;
  private Sample disk;
  private Sample network;

  LinuxIoRateSampler() { this(Path.of("/proc"), Path.of("/sys"), System::nanoTime); }
  LinuxIoRateSampler(Path proc, Path sys, LongSupplier clock) {
    this.proc = proc; this.sys = sys; this.clock = clock;
  }

  synchronized Rates sample() {
    Pair diskRates = UNAVAILABLE, networkRates = UNAVAILABLE;
    try {
      Sample next = new Sample(readDisks(), clock.getAsLong());
      diskRates = delta(disk, next);
      if (shouldAdvance(disk, next)) disk = next;
    } catch (IOException | RuntimeException ignored) { disk = null; }
    try {
      Sample next = new Sample(readNetwork(), clock.getAsLong());
      networkRates = delta(network, next);
      if (shouldAdvance(network, next)) network = next;
    } catch (IOException | RuntimeException ignored) { network = null; }
    return new Rates(diskRates.first(), diskRates.second(), networkRates.first(), networkRates.second());
  }

  private boolean shouldAdvance(Sample before, Sample after) {
    return before == null || after.nanos() <= before.nanos() || after.nanos() - before.nanos() >= 100_000_000L
        || !before.devices().keySet().equals(after.devices().keySet());
  }

  private Pair delta(Sample before, Sample after) {
    if (before == null || after.devices().isEmpty() || !before.devices().keySet().equals(after.devices().keySet())) return UNAVAILABLE;
    long elapsed = after.nanos() - before.nanos();
    if (elapsed < 100_000_000L) return UNAVAILABLE;
    double first = 0, second = 0;
    for (var entry : after.devices().entrySet()) {
      Counters old = before.devices().get(entry.getKey()), now = entry.getValue();
      if (now.first() < old.first() || now.second() < old.second()) return UNAVAILABLE;
      first += now.first() - old.first(); second += now.second() - old.second();
    }
    return new Pair(format(first / (elapsed / 1_000_000_000.0)), format(second / (elapsed / 1_000_000_000.0)));
  }

  private Map<String, Counters> readDisks() throws IOException {
    Map<String, Boolean> selected = new HashMap<>();
    try (Stream<Path> devices = Files.list(sys.resolve("block"))) {
      for (Path device : devices.toList()) {
        String name = device.getFileName().toString();
        if (name.matches("(?:loop|ram|zram)\\d+")) continue;
        // Stacked dm/md devices expose their backing devices in slaves; count only leaves.
        try (Stream<Path> slaves = Files.list(device.resolve("slaves"))) {
          if (slaves.findAny().isEmpty()) selected.put(name, true);
        }
      }
    }
    Map<String, Counters> result = new HashMap<>();
    for (String line : Files.readAllLines(proc.resolve("diskstats"))) {
      String[] fields = line.trim().split("\\s+");
      if (fields.length < 3 || !selected.containsKey(fields[2])) continue;
      if (fields.length < 14) throw new IOException("Incomplete disk statistics");
      // Linux diskstats sectors are always 512 bytes, not the device logical sector size.
      result.put(fields[2] + ":" + fields[0] + ":" + fields[1],
          new Counters(Math.multiplyExact(counter(fields[5]), 512), Math.multiplyExact(counter(fields[9]), 512)));
    }
    if (result.size() != selected.size()) throw new IOException("Disk topology changed");
    return result;
  }

  private Map<String, Counters> readNetwork() throws IOException {
    Map<String, Counters> result = new HashMap<>();
    for (String line : Files.readAllLines(proc.resolve("net/dev"))) {
      int colon = line.indexOf(':'); if (colon < 0) continue;
      String name = line.substring(0, colon).trim();
      if (!name.matches("[A-Za-z0-9_.-]+") || name.equals("lo")) continue;
      Path device = sys.resolve("class/net").resolve(name);
      if (!Files.exists(device.resolve("device"))) continue;
      if (!Files.readString(device.resolve("type")).trim().equals("1")) continue;
      String[] fields = line.substring(colon + 1).trim().split("\\s+");
      if (fields.length < 16) throw new IOException("Incomplete network statistics");
      String index = Files.readString(device.resolve("ifindex")).trim();
      counter(index);
      result.put(name + ":" + index, new Counters(counter(fields[0]), counter(fields[8])));
    }
    return result;
  }

  private long counter(String value) throws IOException {
    long parsed = Long.parseLong(value);
    if (parsed < 0) throw new IOException("Negative statistics counter");
    return parsed;
  }

  private String format(double bytesPerSecond) {
    String[] units = {"B/s", "KiB/s", "MiB/s", "GiB/s", "TiB/s"};
    int unit = 0;
    while (bytesPerSecond >= 1024 && unit < units.length - 1) { bytesPerSecond /= 1024; unit++; }
    return String.format(Locale.ROOT, unit == 0 ? "%.0f %s" : "%.1f %s", bytesPerSecond, units[unit]);
  }
}
