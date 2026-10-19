package com.studyroom.service;

import com.studyroom.common.BusinessException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@Service
public class AudioStorageService {
  private static final long MAX_AUDIO_BYTES = 20L * 1024 * 1024;
  private static final Set<String> ALLOWED_EXTENSIONS = Set.of("mp3", "wav", "ogg", "m4a", "aac");
  private static final Set<String> ALLOWED_TYPES = Set.of(
      "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav",
      "audio/ogg", "audio/mp4", "audio/aac", "audio/x-m4a"
  );

  private final Path uploadRoot;

  public AudioStorageService(@Value("${studyroom.upload-dir:uploads}") String uploadDir) {
    this.uploadRoot = Path.of(uploadDir).toAbsolutePath().normalize();
  }

  public StoredAudio save(Long userId, MultipartFile file) throws IOException {
    if (file == null || file.isEmpty()) {
      throw new BusinessException("请选择音乐文件。");
    }
    if (file.getSize() > MAX_AUDIO_BYTES) {
      throw new BusinessException("音乐文件不能超过 20MB。");
    }

    String originalName = StringUtils.hasText(file.getOriginalFilename())
        ? Path.of(file.getOriginalFilename()).getFileName().toString()
        : "audio";
    String extension = extensionOf(originalName);
    String contentType = StringUtils.hasText(file.getContentType())
        ? file.getContentType().toLowerCase(Locale.ROOT)
        : "";
    if (!ALLOWED_EXTENSIONS.contains(extension) || (!contentType.isBlank() && !ALLOWED_TYPES.contains(contentType))) {
      throw new BusinessException("仅支持 MP3、WAV、OGG、M4A 或 AAC 音频。");
    }

    Path directory = uploadRoot.resolve("audio").resolve(String.valueOf(userId)).normalize();
    if (!directory.startsWith(uploadRoot)) {
      throw new BusinessException("音乐保存路径无效。");
    }
    Files.createDirectories(directory);
    String filename = UUID.randomUUID().toString().replace("-", "") + "." + extension;
    Path target = directory.resolve(filename).normalize();
    file.transferTo(target.toFile());
    return new StoredAudio(
        originalName,
        "/uploads/audio/" + userId + "/" + filename,
        contentType.isBlank() ? "audio/" + extension : contentType,
        file.getSize()
    );
  }

  public void delete(String fileUrl) {
    if (!StringUtils.hasText(fileUrl) || !fileUrl.startsWith("/uploads/audio/")) {
      return;
    }
    Path target = uploadRoot.resolve(fileUrl.substring("/uploads/".length()).replace("/", java.io.File.separator)).normalize();
    if (!target.startsWith(uploadRoot)) {
      return;
    }
    try {
      Files.deleteIfExists(target);
    } catch (IOException ignored) {
      // Stale audio cleanup is best effort.
    }
  }

  private String extensionOf(String name) {
    int dot = name.lastIndexOf('.');
    return dot < 0 ? "" : name.substring(dot + 1).toLowerCase(Locale.ROOT);
  }

  public record StoredAudio(String originalName, String fileUrl, String mimeType, long fileSize) {
  }
}
