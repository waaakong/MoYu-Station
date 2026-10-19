package com.studyroom.config;

import com.studyroom.websocket.ChatWebSocketHandler;
import com.studyroom.websocket.FeedNotificationWebSocketHandler;
import com.studyroom.websocket.ClientUpdateWebSocketHandler;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import com.studyroom.security.LiveSessionHandshakeInterceptor;
import com.studyroom.security.SessionBoundSocketHandler;
import com.studyroom.security.SocketSessionGuard;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {
  private final ChatWebSocketHandler chatWebSocketHandler;
  private final FeedNotificationWebSocketHandler feedNotificationWebSocketHandler;
  private final ClientUpdateWebSocketHandler clientUpdateWebSocketHandler;
  private final CorsOriginProperties corsOriginProperties;
  private final SocketSessionGuard sessionGuard;

  public WebSocketConfig(
      ChatWebSocketHandler chatWebSocketHandler,
      FeedNotificationWebSocketHandler feedNotificationWebSocketHandler,
      ClientUpdateWebSocketHandler clientUpdateWebSocketHandler,
      CorsOriginProperties corsOriginProperties,
      SocketSessionGuard sessionGuard
  ) {
    this.chatWebSocketHandler = chatWebSocketHandler;
    this.feedNotificationWebSocketHandler = feedNotificationWebSocketHandler;
    this.clientUpdateWebSocketHandler = clientUpdateWebSocketHandler;
    this.corsOriginProperties = corsOriginProperties;
    this.sessionGuard = sessionGuard;
  }

  @Override
  public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
    registry.addHandler(new SessionBoundSocketHandler(chatWebSocketHandler, sessionGuard), "/ws/chat")
        .addInterceptors(new LiveSessionHandshakeInterceptor())
        .setAllowedOriginPatterns(corsOriginProperties.resolvedPatterns());
    registry.addHandler(new SessionBoundSocketHandler(feedNotificationWebSocketHandler, sessionGuard), "/ws/notifications")
        .addInterceptors(new LiveSessionHandshakeInterceptor())
        .setAllowedOriginPatterns(corsOriginProperties.resolvedPatterns());
    registry.addHandler(new SessionBoundSocketHandler(clientUpdateWebSocketHandler, sessionGuard), "/ws/client-updates")
        .addInterceptors(new LiveSessionHandshakeInterceptor())
        .setAllowedOriginPatterns(corsOriginProperties.resolvedPatterns());
  }
}
