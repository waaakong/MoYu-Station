package com.studyroom.security;

import java.util.Map;
import org.springframework.http.server.*;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.support.HttpSessionHandshakeInterceptor;

public final class LiveSessionHandshakeInterceptor extends HttpSessionHandshakeInterceptor {
  @Override public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
      WebSocketHandler handler, Map<String, Object> attributes) throws Exception {
    if (!(request instanceof ServletServerHttpRequest servlet)) return false;
    var session = servlet.getServletRequest().getSession(false);
    if (session == null) return false;
    if (!super.beforeHandshake(request, response, handler, attributes)) return false;
    attributes.put(SocketSessionGuard.SESSION_ID, session.getId());
    attributes.put(SocketSessionGuard.HTTP_SESSION, session);
    return true;
  }
}
