package com.studyroom.controller;

import com.studyroom.service.RadioRelayService;
import com.studyroom.service.RadioRelayService.RadioStream;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.InputStream;

@RestController
@RequestMapping("/api/radio")
public class RadioController {
  private final RadioRelayService radioRelayService;

  public RadioController(RadioRelayService radioRelayService) {
    this.radioRelayService = radioRelayService;
  }

  @GetMapping("/stations/{stationId}/stream")
  public ResponseEntity<StreamingResponseBody> stream(
      @PathVariable String stationId,
      @RequestHeader(value = HttpHeaders.RANGE, required = false) String range
  ) {
    RadioStream stream = radioRelayService.open(stationId, range);
    StreamingResponseBody body = output -> {
      InputStream input = stream.body();
      try (input) {
        input.transferTo(output);
      }
    };
    HttpHeaders headers = new HttpHeaders();
    headers.set(HttpHeaders.CONTENT_TYPE, stream.contentType());
    headers.set(HttpHeaders.CACHE_CONTROL, "private, no-store");
    headers.set(HttpHeaders.ACCEPT_RANGES, "bytes");
    if (stream.contentLength() != null) headers.set(HttpHeaders.CONTENT_LENGTH, stream.contentLength());
    if (stream.contentRange() != null) headers.set(HttpHeaders.CONTENT_RANGE, stream.contentRange());
    return new ResponseEntity<>(body, headers, HttpStatus.valueOf(stream.status()));
  }
}
