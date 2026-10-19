package com.studyroom.service;

import com.studyroom.dto.SystemMetrics;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.lang.management.GarbageCollectorMXBean;
import java.lang.management.ManagementFactory;
import java.lang.management.ThreadMXBean;
import java.nio.file.FileStore;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Stream;

@Service
public class SystemMetricsService {
  private static final long PROJECT_SIZE_CACHE_MS = 30_000L;
  private static final Set<String> SIZE_EXCLUDED_DIRS = Set.of(
      ".git", ".idea", ".superpowers", "node_modules", "target", "dist"
  );

  private final Path projectRoot = resolveProjectRoot();
  private final LinuxIoRateSampler ioRates = new LinuxIoRateSampler();

  public SystemMetricsService() {
    ioRates.sample(); // Establish a baseline without sleeping on the dashboard request.
  }

  private long lastProjectSizeAt;
  private long cachedProjectSize;

  public synchronized SystemMetrics metrics() {
    long now = System.currentTimeMillis();

    SystemMetrics metrics = new SystemMetrics();
    LinuxIoRateSampler.Rates rates = ioRates.sample();
    // Busy percentage is separate from throughput and is not inferred from byte counts.
    metrics.setDiskIoUsage(null);
    metrics.setDiskReadRate(rates.diskRead());
    metrics.setDiskWriteRate(rates.diskWrite());
    metrics.setNetworkReceiveRate(rates.receive());
    metrics.setNetworkTransmitRate(rates.transmit());
    fillDiskSpace(metrics);
    metrics.setProjectSize(formatBytes(projectSize(now)));
    fillJvmMetrics(metrics);
    return metrics;
  }

  private void fillDiskSpace(SystemMetrics metrics) {
    try {
      FileStore fileStore = Files.getFileStore(projectRoot);
      long total = fileStore.getTotalSpace();
      long free = fileStore.getUsableSpace();
      long used = Math.max(0, total - free);
      metrics.setDiskFreeSpace(formatBytes(free));
      metrics.setDiskTotalSpace(formatBytes(total));
      metrics.setDiskUsage(total <= 0 ? 0 : percent((double) used / total));
    } catch (IOException ex) {
      metrics.setDiskFreeSpace("UNAVAILABLE");
      metrics.setDiskTotalSpace("UNAVAILABLE");
      metrics.setDiskUsage(null);
    }
  }

  private void fillJvmMetrics(SystemMetrics metrics) {
    long gcCount = 0;
    long gcTime = 0;
    for (GarbageCollectorMXBean bean : ManagementFactory.getGarbageCollectorMXBeans()) {
      gcCount += Math.max(0, bean.getCollectionCount());
      gcTime += Math.max(0, bean.getCollectionTime());
    }
    ThreadMXBean threadBean = ManagementFactory.getThreadMXBean();
    metrics.setGcCount(gcCount);
    metrics.setGcTimeMs(gcTime);
    metrics.setActiveThreads(threadBean.getThreadCount());
    metrics.setPeakThreads(threadBean.getPeakThreadCount());
  }

  private long projectSize(long now) {
    if (cachedProjectSize > 0 && now - lastProjectSizeAt < PROJECT_SIZE_CACHE_MS) {
      return cachedProjectSize;
    }
    cachedProjectSize = calculateProjectSize(projectRoot);
    lastProjectSizeAt = now;
    return cachedProjectSize;
  }

  private long calculateProjectSize(Path root) {
    if (root == null || !Files.exists(root)) return -1;
    try (Stream<Path> paths = Files.walk(root)) {
      return paths
          .filter(Files::isRegularFile)
          .filter(path -> !containsExcludedSegment(root.relativize(path)))
          .mapToLong(path -> {
            try {
              return Files.size(path);
            } catch (IOException ignored) {
              return 0;
            }
          })
          .sum();
    } catch (IOException ignored) {
      return -1;
    }
  }

  private boolean containsExcludedSegment(Path path) {
    for (Path segment : path) {
      if (SIZE_EXCLUDED_DIRS.contains(segment.toString())) {
        return true;
      }
    }
    return false;
  }

  private Path resolveProjectRoot() {
    Path current = Paths.get("").toAbsolutePath().normalize();
    Path fileName = current.getFileName();
    if (fileName != null && "backend".equalsIgnoreCase(fileName.toString()) && current.getParent() != null) {
      return current.getParent();
    }
    return current;
  }

  private String formatBytes(long bytes) {
    if (bytes < 0) return "UNAVAILABLE";
    if (bytes < 1024) return bytes + " B";
    String[] units = {"KB", "MB", "GB", "TB"};
    double value = bytes;
    int unitIndex = -1;
    do {
      value /= 1024.0;
      unitIndex++;
    } while (value >= 1024 && unitIndex < units.length - 1);
    return String.format(Locale.US, "%.1f %s", value, units[unitIndex]);
  }

  private int percent(double value) {
    return (int) Math.max(0, Math.min(100, Math.round(value * 100)));
  }

}
