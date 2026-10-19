package com.studyroom.service;

import com.studyroom.config.RadioRelayProperties;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.InetAddress;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.Semaphore;

@Service
public class RadioRelayService {
  private static final Map<String, URI> STATIONS = Map.of(
      "somafm-groove-salad", URI.create("https://ice5.somafm.com/groovesalad-128-mp3"),
      "somafm-drone-zone", URI.create("https://ice5.somafm.com/dronezone-128-mp3"),
      "somafm-secret-agent", URI.create("https://ice5.somafm.com/secretagent-128-mp3")
  );

  private final RadioRelayProperties properties;
  private final HttpClient client;
  private final Semaphore connections;

  @Autowired
  public RadioRelayService(RadioRelayProperties properties) {
    this(properties, HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(3))
        .followRedirects(HttpClient.Redirect.NEVER)
        .build());
  }

  RadioRelayService(RadioRelayProperties properties, HttpClient client) {
    this.properties = properties;
    this.client = client;
    this.connections = new Semaphore(properties.getMaxConnections(), true);
  }

  public RadioStream open(String stationId, String range) {
    if (!properties.isEnabled()) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
    URI uri = STATIONS.get(stationId);
    if (uri == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
    if (!connections.tryAcquire()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
    try {
      validatePublicDestination(uri);
      HttpRequest.Builder request = HttpRequest.newBuilder(uri)
          .timeout(Duration.ofSeconds(10))
          .header("User-Agent", "StudyRoom-Radio/1")
          .GET();
      if (range != null && range.matches("bytes=\\d*-\\d*")) request.header("Range", range);
      HttpResponse<InputStream> response = client.send(request.build(), HttpResponse.BodyHandlers.ofInputStream());
      String contentType = response.headers().firstValue("content-type").orElse("").split(";", 2)[0].trim().toLowerCase();
      if ((response.statusCode() != 200 && response.statusCode() != 206)
          || (!contentType.startsWith("audio/") && !contentType.equals("application/ogg"))) {
        response.body().close();
        connections.release();
        throw new ResponseStatusException(HttpStatus.BAD_GATEWAY);
      }
      InputStream guarded = new FilterInputStream(response.body()) {
        private boolean closed;
        @Override
        public void close() throws IOException {
          if (closed) return;
          closed = true;
          try { super.close(); }
          finally { connections.release(); }
        }
      };
      return new RadioStream(
          guarded,
          contentType,
          response.statusCode(),
          response.headers().firstValue("content-length").orElse(null),
          response.headers().firstValue("content-range").orElse(null)
      );
    } catch (ResponseStatusException error) {
      throw error;
    } catch (InterruptedException error) {
      connections.release();
      Thread.currentThread().interrupt();
      throw new ResponseStatusException(HttpStatus.BAD_GATEWAY);
    } catch (Exception error) {
      connections.release();
      throw new ResponseStatusException(HttpStatus.BAD_GATEWAY);
    }
  }

  private static void validatePublicDestination(URI uri) throws IOException {
    if (!"https".equals(uri.getScheme()) || uri.getUserInfo() != null || uri.getPort() > 0 && uri.getPort() != 443) {
      throw new IOException("Unsafe radio destination");
    }
    for (InetAddress address : InetAddress.getAllByName(uri.getHost())) {
      if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress()
          || address.isSiteLocalAddress() || address.isMulticastAddress()) {
        throw new IOException("Unsafe radio destination");
      }
    }
  }

  public record RadioStream(InputStream body, String contentType, int status, String contentLength, String contentRange) {}
}
