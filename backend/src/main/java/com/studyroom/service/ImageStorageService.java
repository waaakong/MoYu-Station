package com.studyroom.service;

import com.studyroom.common.BusinessException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.ImageOutputStream;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Iterator;
import java.util.Locale;
import java.util.UUID;

@Service
public class ImageStorageService {
  private static final long MAX_INPUT_BYTES = 5L * 1024L * 1024L;
  private static final long MAX_PIXELS = 40_000_000L;
  private static final int MAX_DIMENSION = 12_000;
  private final Path uploadRoot;
  private final UploadQuotaService uploadQuotaService;

  public ImageStorageService(
      @Value("${studyroom.upload-dir:uploads}") String uploadDir,
      UploadQuotaService uploadQuotaService
  ) {
    this.uploadRoot = Path.of(uploadDir).toAbsolutePath().normalize();
    this.uploadQuotaService = uploadQuotaService;
  }

  public Path uploadRoot() {
    return uploadRoot;
  }

  public StoredImage saveDisplayImage(
      MultipartFile file,
      Long ownerId,
      Path relativeDirectory,
      String publicDirectory,
      String baseName,
      int maxWidth,
      int maxHeight,
      float quality
  ) throws IOException {
    validateInputSize(file);
    Path directory = uploadRoot.resolve(relativeDirectory).normalize();
    if (!directory.startsWith(uploadRoot)) {
      throw new BusinessException("Invalid image save path.");
    }
    try (UploadQuotaService.Reservation reservation = uploadQuotaService.reserve(ownerId, file.getSize())) {
      Files.createDirectories(directory);
      VerifiedImage verified = verifyImage(file);
      String outputExtension = verified.webpBytes() == null ? "jpg" : "webp";
      Path displayPath = uniquePath(directory, baseName, outputExtension);
      Path temporaryPath = directory.resolve("." + displayPath.getFileName() + "." + UUID.randomUUID() + ".tmp").normalize();
      try {
        if (verified.webpBytes() != null) {
          Files.write(temporaryPath, verified.webpBytes());
        } else {
          BufferedImage resized = resizeToFit(verified.image(), maxWidth, maxHeight);
          writeJpeg(resized, temporaryPath, quality);
        }
        moveAtomically(temporaryPath, displayPath);
        reservation.commit(Files.size(displayPath));
      } finally {
        Files.deleteIfExists(temporaryPath);
      }
      return new StoredImage(toPublicUrl(publicDirectory, displayPath.getFileName().toString()), null);
    }
  }

  public void deletePublicFile(String publicUrl) {
    if (!StringUtils.hasText(publicUrl) || !publicUrl.startsWith("/uploads/")) {
      return;
    }
    String relative = publicUrl.substring("/uploads/".length()).replace("/", java.io.File.separator);
    Path target = uploadRoot.resolve(relative).normalize();
    if (!target.startsWith(uploadRoot)) {
      return;
    }
    try {
      Files.deleteIfExists(target);
    } catch (IOException ignored) {
      // Deleting stale uploads is best effort.
    }
  }

  public void deleteDisplayAndOriginal(String displayUrl) {
    if (!StringUtils.hasText(displayUrl) || !displayUrl.startsWith("/uploads/")) {
      return;
    }
    deletePublicFile(displayUrl);
    int lastSlash = displayUrl.lastIndexOf('/');
    int lastDot = displayUrl.lastIndexOf('.');
    if (lastSlash < 0 || lastDot <= lastSlash) {
      return;
    }
    String directoryUrl = displayUrl.substring(0, lastSlash);
    String stem = displayUrl.substring(lastSlash + 1, lastDot);
    String relativeDirectory = directoryUrl.substring("/uploads/".length()).replace("/", java.io.File.separator);
    Path originalDirectory = uploadRoot.resolve(relativeDirectory).resolve("original").normalize();
    if (!originalDirectory.startsWith(uploadRoot) || !Files.isDirectory(originalDirectory)) {
      return;
    }
    try (var files = Files.list(originalDirectory)) {
      files
          .filter(path -> path.getFileName().toString().startsWith(stem + "."))
          .forEach(path -> {
            try {
              Files.deleteIfExists(path);
            } catch (IOException ignored) {
              // Deleting stale originals is best effort.
            }
          });
    } catch (IOException ignored) {
      // Deleting stale originals is best effort.
    }
  }

  private void validateInputSize(MultipartFile file) {
    if (file == null || file.isEmpty()) {
      throw new BusinessException("UPLOAD_EMPTY", "请选择图片。");
    }
    if (file.getSize() > MAX_INPUT_BYTES) {
      throw new BusinessException("UPLOAD_TOO_LARGE", "图片处理后仍超过 5MB，请重新选择。");
    }
  }

  private VerifiedImage verifyImage(MultipartFile file) throws IOException {
    byte[] bytes = file.getBytes();
    if (isWebp(bytes)) {
      WebpInfo info = inspectWebp(bytes);
      validateDeclaredMime(file.getContentType(), "image/webp");
      validateDimensions(info.width(), info.height());
      return new VerifiedImage(null, bytes, info.width(), info.height());
    }
    try (ImageInputStream input = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
      if (input == null) {
        throw new BusinessException("UPLOAD_INVALID_IMAGE", "无法读取图片内容。");
      }
      Iterator<ImageReader> readers = ImageIO.getImageReaders(input);
      if (!readers.hasNext()) {
        throw new BusinessException("UPLOAD_INVALID_IMAGE", "文件内容不是受支持的图片。");
      }
      ImageReader reader = readers.next();
      try {
        reader.setInput(input, true, true);
        String format = reader.getFormatName().toUpperCase(Locale.ROOT);
        if (!("JPEG".equals(format) || "JPG".equals(format) || "PNG".equals(format))) {
          throw new BusinessException("UPLOAD_UNSUPPORTED_TYPE", "图片仅支持 JPG、PNG 或 WebP。");
        }
        int width = reader.getWidth(0);
        int height = reader.getHeight(0);
        validateDeclaredMime(file.getContentType(), "PNG".equals(format) ? "image/png" : "image/jpeg");
        validateDimensions(width, height);
        BufferedImage image = reader.read(0);
        if (image == null) {
          throw new BusinessException("UPLOAD_INVALID_IMAGE", "图片解码失败。");
        }
        return new VerifiedImage(image, null, width, height);
      } finally {
        reader.dispose();
      }
    }
  }

  private void validateDeclaredMime(String declared, String detected) {
    String normalized = declared == null ? "" : declared.trim().toLowerCase(Locale.ROOT);
    if ("image/jpg".equals(normalized)) normalized = "image/jpeg";
    if (!detected.equals(normalized)) {
      throw new BusinessException("UPLOAD_MIME_MISMATCH", "图片类型与文件内容不一致。");
    }
  }

  private void validateDimensions(int width, int height) {
    if (width <= 0 || height <= 0 || width > MAX_DIMENSION || height > MAX_DIMENSION
        || (long) width * height > MAX_PIXELS) {
      throw new BusinessException("UPLOAD_DIMENSIONS_EXCEEDED", "图片像素或尺寸超过安全限制。");
    }
  }

  private boolean isWebp(byte[] bytes) {
    return bytes.length >= 16
        && ascii(bytes, 0, 4).equals("RIFF")
        && ascii(bytes, 8, 4).equals("WEBP");
  }

  private WebpInfo inspectWebp(byte[] bytes) {
    long riffSize = uint32le(bytes, 4);
    if (riffSize + 8L > bytes.length || riffSize < 12) {
      throw new BusinessException("UPLOAD_INVALID_IMAGE", "WebP 文件结构不完整。");
    }
    int width = 0;
    int height = 0;
    boolean bitstreamFound = false;
    int offset = 12;
    while (offset + 8 <= bytes.length) {
      String type = ascii(bytes, offset, 4);
      long chunkLength = uint32le(bytes, offset + 4);
      long dataEnd = (long) offset + 8L + chunkLength;
      if (chunkLength < 0 || dataEnd > bytes.length) {
        throw new BusinessException("UPLOAD_INVALID_IMAGE", "WebP 数据块不完整。");
      }
      int data = offset + 8;
      if ("EXIF".equals(type) || "XMP ".equals(type) || "ANIM".equals(type) || "ANMF".equals(type)) {
        throw new BusinessException("UPLOAD_METADATA_FORBIDDEN", "图片包含不允许的元数据或动画。");
      }
      if ("VP8X".equals(type) && chunkLength >= 10) {
        width = uint24le(bytes, data + 4) + 1;
        height = uint24le(bytes, data + 7) + 1;
      } else if ("VP8L".equals(type) && chunkLength >= 5 && (bytes[data] & 0xff) == 0x2f) {
        int bits = (bytes[data + 1] & 0xff)
            | ((bytes[data + 2] & 0xff) << 8)
            | ((bytes[data + 3] & 0xff) << 16)
            | ((bytes[data + 4] & 0xff) << 24);
        width = (bits & 0x3fff) + 1;
        height = ((bits >>> 14) & 0x3fff) + 1;
        bitstreamFound = true;
      } else if ("VP8 ".equals(type) && chunkLength >= 10
          && (bytes[data + 3] & 0xff) == 0x9d
          && (bytes[data + 4] & 0xff) == 0x01
          && (bytes[data + 5] & 0xff) == 0x2a) {
        width = uint16le(bytes, data + 6) & 0x3fff;
        height = uint16le(bytes, data + 8) & 0x3fff;
        bitstreamFound = true;
      }
      offset = (int) (dataEnd + (chunkLength & 1L));
    }
    if (!bitstreamFound || width <= 0 || height <= 0) {
      throw new BusinessException("UPLOAD_INVALID_IMAGE", "无法确认 WebP 图片尺寸。");
    }
    return new WebpInfo(width, height);
  }

  private String ascii(byte[] bytes, int offset, int length) {
    if (offset < 0 || length < 0 || offset + length > bytes.length) return "";
    return new String(bytes, offset, length, StandardCharsets.US_ASCII);
  }

  private int uint16le(byte[] bytes, int offset) {
    return (bytes[offset] & 0xff) | ((bytes[offset + 1] & 0xff) << 8);
  }

  private int uint24le(byte[] bytes, int offset) {
    return (bytes[offset] & 0xff) | ((bytes[offset + 1] & 0xff) << 8) | ((bytes[offset + 2] & 0xff) << 16);
  }

  private long uint32le(byte[] bytes, int offset) {
    return Integer.toUnsignedLong((bytes[offset] & 0xff)
        | ((bytes[offset + 1] & 0xff) << 8)
        | ((bytes[offset + 2] & 0xff) << 16)
        | ((bytes[offset + 3] & 0xff) << 24));
  }

  private void moveAtomically(Path source, Path target) throws IOException {
    try {
      Files.move(source, target, StandardCopyOption.ATOMIC_MOVE);
    } catch (java.nio.file.AtomicMoveNotSupportedException ignored) {
      Files.move(source, target, StandardCopyOption.REPLACE_EXISTING);
    }
  }

  private BufferedImage resizeToFit(BufferedImage source, int maxWidth, int maxHeight) {
    int sourceWidth = source.getWidth();
    int sourceHeight = source.getHeight();
    double ratio = Math.min(1D, Math.min((double) maxWidth / sourceWidth, (double) maxHeight / sourceHeight));
    int targetWidth = Math.max(1, (int) Math.round(sourceWidth * ratio));
    int targetHeight = Math.max(1, (int) Math.round(sourceHeight * ratio));

    BufferedImage target = new BufferedImage(targetWidth, targetHeight, BufferedImage.TYPE_INT_RGB);
    Graphics2D graphics = target.createGraphics();
    graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
    graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
    graphics.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
    graphics.setColor(java.awt.Color.WHITE);
    graphics.fillRect(0, 0, targetWidth, targetHeight);
    graphics.drawImage(source, 0, 0, targetWidth, targetHeight, null);
    graphics.dispose();
    return target;
  }

  private void writeJpeg(BufferedImage image, Path target, float quality) throws IOException {
    Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName("jpg");
    if (!writers.hasNext()) {
      ImageIO.write(image, "jpg", target.toFile());
      return;
    }
    ImageWriter writer = writers.next();
    try (ImageOutputStream output = ImageIO.createImageOutputStream(target.toFile())) {
      writer.setOutput(output);
      ImageWriteParam params = writer.getDefaultWriteParam();
      if (params.canWriteCompressed()) {
        params.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
        params.setCompressionQuality(Math.max(0.1F, Math.min(1F, quality)));
      }
      writer.write(null, new IIOImage(image, null, null), params);
    } finally {
      writer.dispose();
    }
  }

  private Path uniquePath(Path directory, String baseName, String extension) {
    String safeBaseName = sanitizeBaseName(baseName);
    return directory.resolve(safeBaseName + "." + extension.toLowerCase(Locale.ROOT)).normalize();
  }

  private String sanitizeBaseName(String baseName) {
    String value = StringUtils.hasText(baseName) ? baseName : "image";
    return value.replaceAll("[^a-zA-Z0-9._-]", "-");
  }

  private String toPublicUrl(String publicDirectory, String filename) {
    String directory = publicDirectory.startsWith("/") ? publicDirectory : "/" + publicDirectory;
    return directory.replace("\\", "/").replaceAll("/+$", "") + "/" + filename;
  }

  public record StoredImage(String displayUrl, String originalUrl) {
  }

  private record VerifiedImage(BufferedImage image, byte[] webpBytes, int width, int height) {
  }

  private record WebpInfo(int width, int height) {
  }
}
