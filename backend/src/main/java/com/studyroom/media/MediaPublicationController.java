package com.studyroom.media;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.*;
import com.studyroom.common.ApiResponse;
import com.studyroom.service.AuthService;
import java.io.IOException;
import java.util.*;
import javax.servlet.http.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/media/publications")
@ConditionalOnProperty(prefix = "studyroom.media", name = "enabled", havingValue = "true")
public final class MediaPublicationController {
  static final int MAX_BODY = 16 * 1024;
  private final AuthService auth;
  private final MediaPublicationService publications;
  private final ObjectMapper json = new ObjectMapper().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION);
  public MediaPublicationController(AuthService auth, MediaPublicationService publications) { this.auth = auth; this.publications = publications; }

  @PostMapping
  public ApiResponse<MediaPublicationService.Published> publish(HttpServletRequest request, HttpSession session) throws IOException {
    long owner = auth.requireActiveUser(session).getId();
    byte[] bytes = request.getInputStream().readNBytes(MAX_BODY + 1);
    if (bytes.length > MAX_BODY) throw new MediaApiException(413, "MEDIA_PUBLICATION_TOO_LARGE", "发布请求超过 16 KiB。");
    return ApiResponse.ok(publications.publish(owner, parse(bytes)));
  }

  @GetMapping("/{requestId}")
  public ApiResponse<MediaPublicationService.Lookup> lookup(@PathVariable String requestId, HttpSession session) {
    long owner = auth.requireActiveUser(session).getId();
    return ApiResponse.ok(publications.lookup(owner, MediaAssetController.uuid(requestId)));
  }

  MediaPublicationService.Command parse(byte[] bytes) {
    // Fixed-shape streaming parsing rejects nested input without allocating an arbitrarily deep JSON tree.
    try (JsonParser parser = json.getFactory().createParser(bytes)) {
      if (parser.nextToken() != JsonToken.START_OBJECT) throw invalid();
      String request = null, kind = null, content = null, scene = null; Long recipient = null; List<UUID> ids = null;
      while (parser.nextToken() != JsonToken.END_OBJECT) {
        if (parser.currentToken() != JsonToken.FIELD_NAME) throw invalid();
        String key = parser.currentName(); parser.nextToken();
        switch (key) {
          case "requestId" -> request = text(parser, true);
          case "kind" -> kind = text(parser, true);
          case "content" -> content = text(parser, false);
          case "scene" -> scene = text(parser, false);
          case "recipient" -> {
            if (parser.currentToken() == JsonToken.VALUE_NULL) recipient = null;
            else {
              if(parser.currentToken()!=JsonToken.VALUE_STRING&&parser.currentToken()!=JsonToken.VALUE_NUMBER_INT)throw invalid();
              recipient=MediaEntityId.parse(parser.getText(),parser.currentToken()==JsonToken.VALUE_NUMBER_INT);
            }
          }
          case "assets" -> {
            if (parser.currentToken() != JsonToken.START_ARRAY) throw invalid(); ids = new ArrayList<>();
            while (parser.nextToken() != JsonToken.END_ARRAY) {
              if (ids.size() >= 9) throw invalid(); ids.add(MediaAssetController.uuid(text(parser, true)));
            }
          }
          default -> throw invalid();
        }
      }
      if (parser.nextToken() != null || request == null || kind == null || ids == null || ids.isEmpty()) throw invalid();
      return new MediaPublicationService.Command(MediaAssetController.uuid(request), MediaPublicationService.Kind.valueOf(kind), recipient,
          content, scene, ids);
    } catch (IOException | IllegalArgumentException error) { throw invalid(); }
  }
  private static String text(JsonParser parser, boolean required) throws IOException {
    if (!required && parser.currentToken() == JsonToken.VALUE_NULL) return null;
    if (parser.currentToken() != JsonToken.VALUE_STRING) throw invalid(); return parser.getText();
  }
  private static MediaApiException invalid() { return new MediaApiException(400, "MEDIA_PUBLICATION_INVALID", "发布请求格式无效。"); }
}
