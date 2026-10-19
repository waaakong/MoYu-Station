package com.studyroom.health;

import com.studyroom.config.ReadinessProperties;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

@Component
public class StorageReadinessProbe implements ReadinessProbe {
  private final Path uploadRoot;
  private final ReadinessProperties properties;

  public StorageReadinessProbe(
      @Value("${studyroom.upload-dir:uploads}") String uploadDir,
      ReadinessProperties properties
  ) {
    this.uploadRoot = Path.of(uploadDir).toAbsolutePath().normalize();
    this.properties = properties;
  }

  @Override
  public String name() {
    return "storage";
  }

  @Override
  public void verify() throws IOException {
    if (!Files.isDirectory(uploadRoot) || !Files.isWritable(uploadRoot)) {
      throw new IOException("Upload root is unavailable");
    }
    long usable = Files.getFileStore(uploadRoot).getUsableSpace();
    if (usable < properties.getMinimumFreeSpace()) throw new IOException("Upload storage is below the safe watermark");
  }
}
