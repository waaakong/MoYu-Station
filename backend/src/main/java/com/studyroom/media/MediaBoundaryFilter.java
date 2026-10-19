package com.studyroom.media;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyroom.common.ApiResponse;
import java.io.IOException;
import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.http.*;
import org.springframework.web.filter.OncePerRequestFilter;

/** Runs before multipart parsing. Media routes accept bounded raw images or bounded publication JSON, never multipart. */
public final class MediaBoundaryFilter extends OncePerRequestFilter {
  private final ObjectMapper json;
  public MediaBoundaryFilter(ObjectMapper json) { this.json = json; }

  @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.addHeader("Vary", "Cookie");
    try {
      if (request.getMethod().equals("POST")) {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        boolean publication = path.equals("/api/media/publications") || path.equals("/api/media/publications/");
        if (publication) {
          String mime = request.getContentType();
          if (mime == null || !mime.split(";", 2)[0].trim().equalsIgnoreCase("application/json")) {
            throw new MediaApiException(415, "MEDIA_PUBLICATION_TYPE", "发布请求必须是 JSON。");
          }
        } else MediaAssetService.normalizedMime(request.getContentType(),"sticker".equals(request.getParameter("purpose"))?"sticker":"social");
        int limit=publication?MediaPublicationController.MAX_BODY:"scene".equals(request.getParameter("purpose"))?SceneImageProcessor.INPUT_BYTES:"sticker".equals(request.getParameter("purpose"))?GifContainer.MAX_BYTES:StaticImageCandidateProcessor.MAX_BYTES;
        if (request.getContentLengthLong() > limit) {
          throw new MediaApiException(413, publication ? "MEDIA_PUBLICATION_TOO_LARGE" : "MEDIA_TOO_LARGE", "请求超过允许大小。");
        }
      }
    } catch (MediaApiException error) {
      response.setStatus(error.status()); response.setContentType("application/json"); response.setCharacterEncoding("UTF-8");
      json.writeValue(response.getOutputStream(), ApiResponse.fail(error.code(), error.getMessage()));
      return;
    }
    chain.doFilter(request, response);
  }
}
