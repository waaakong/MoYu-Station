package com.studyroom.media;

import com.studyroom.common.ApiResponse;
import com.studyroom.service.AuthService;
import java.io.IOException;
import java.util.UUID;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpSession;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/media")
@ConditionalOnProperty(prefix = "studyroom.media", name = "enabled", havingValue = "true")
public class MediaAssetController {
  private final AuthService auth;
  private final MediaAssetService assets;
  @org.springframework.beans.factory.annotation.Value("${studyroom.stickers.enabled:false}") private boolean stickersEnabled;
  @org.springframework.beans.factory.annotation.Value("${studyroom.scenes.enabled:false}") private boolean scenesEnabled;
  public MediaAssetController(AuthService auth, MediaAssetService assets) { this.auth = auth; this.assets = assets; }

  @PostMapping("/assets")
  public ResponseEntity<ApiResponse<MediaAssetService.UploadView>> upload(@RequestParam String clientUploadId,
      HttpServletRequest request, HttpSession session) throws IOException {
    long owner = auth.requireActiveUser(session).getId();
    UUID uploadId = uuid(clientUploadId);
    String purpose=request.getParameter("purpose")==null?"social":request.getParameter("purpose");
    if (!purpose.equals("social") && !(purpose.equals("sticker") && stickersEnabled) && !(purpose.equals("scene") && scenesEnabled)) throw new MediaApiException(422,"MEDIA_PURPOSE_UNAVAILABLE","该图片用途尚未启用。");
    String mime = MediaAssetService.normalizedMime(request.getContentType(),purpose);
    int max=purpose.equals("scene")?SceneImageProcessor.INPUT_BYTES:mime.equals("image/gif")?GifContainer.MAX_BYTES:StaticImageCandidateProcessor.MAX_BYTES;
    byte[] bytes = request.getInputStream().readNBytes(max + 1);
    var result = assets.upload(owner, uploadId, bytes, mime,purpose);
    return ResponseEntity.status(result.status().equals("pending") ? 202 : 200).body(ApiResponse.ok(result));
  }

  @GetMapping("/capabilities")
  public ApiResponse<java.util.Map<String,Object>> capabilities(HttpSession session) {
    auth.requireActiveUser(session);
    return ApiResponse.ok(java.util.Map.of("social",true,"sticker",stickersEnabled,"scene",scenesEnabled));
  }

  @GetMapping("/uploads/{clientUploadId}")
  public ApiResponse<MediaAssetService.UploadView> lookup(@PathVariable String clientUploadId, HttpSession session) {
    long owner = auth.requireActiveUser(session).getId();
    return ApiResponse.ok(assets.lookup(owner, uuid(clientUploadId)));
  }

  @GetMapping("/assets/{assetId}/{variant}")
  public ResponseEntity<byte[]> read(@PathVariable String assetId, @PathVariable String variant, HttpSession session) {
    long owner = auth.requireActiveUser(session).getId();
    PrivateImageStore.Variant requested = switch (variant) {
      case "clear" -> PrivateImageStore.Variant.CLEAR;
      case "thumb" -> PrivateImageStore.Variant.THUMB;
      case "display" -> PrivateImageStore.Variant.DISPLAY;
      default -> throw MediaApiException.notFound();
    };
    var resource = assets.read(owner, uuid(assetId), requested);
    byte[] bytes = resource.bytes();
    return ResponseEntity.ok().contentType(MediaType.parseMediaType(resource.mime())).contentLength(bytes.length)
        .header("Content-Disposition", "inline").body(bytes);
  }

  static UUID uuid(String value) {
    if (value == null || !value.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) {
      throw new MediaApiException(400, "MEDIA_INVALID_ID", "图片或上传 ID 格式无效。");
    }
    return UUID.fromString(value);
  }
}
