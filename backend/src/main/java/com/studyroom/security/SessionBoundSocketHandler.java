package com.studyroom.security;

import java.io.IOException;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.WebSocketHandlerDecorator;
import org.springframework.web.socket.handler.WebSocketSessionDecorator;

/** Hubs receive the guarded session, so legacy broadcasts cannot bypass logout/expiry checks. */
public final class SessionBoundSocketHandler extends WebSocketHandlerDecorator {
  private static final String WRAPPED = SessionBoundSocketHandler.class.getName();
  private final SocketSessionGuard guard;
  public SessionBoundSocketHandler(WebSocketHandler handler, SocketSessionGuard guard) { super(handler); this.guard = guard; }

  @Override public void afterConnectionEstablished(WebSocketSession raw) throws Exception {
    WebSocketSession checked = new WebSocketSessionDecorator(raw) {
      @Override public void sendMessage(WebSocketMessage<?> message) throws IOException {
        try { guard.check(this); }
        catch (RuntimeException ended) { close(CloseStatus.POLICY_VIOLATION); return; }
        super.sendMessage(message);
      }
    };
    raw.getAttributes().put(WRAPPED, checked);
    try { guard.check(checked); }
    catch (RuntimeException ended) { raw.close(CloseStatus.POLICY_VIOLATION); return; }
    super.afterConnectionEstablished(checked);
  }
  @Override public void handleMessage(WebSocketSession raw, WebSocketMessage<?> message) throws Exception {
    WebSocketSession checked = wrapped(raw);
    try { guard.check(checked); }
    catch (RuntimeException ended) { raw.close(CloseStatus.POLICY_VIOLATION); return; }
    super.handleMessage(checked, message);
  }
  @Override public void afterConnectionClosed(WebSocketSession raw, CloseStatus status) throws Exception {
    WebSocketSession checked = wrapped(raw); raw.getAttributes().remove(WRAPPED); super.afterConnectionClosed(checked, status);
  }
  @Override public void handleTransportError(WebSocketSession raw, Throwable error) throws Exception { super.handleTransportError(wrapped(raw), error); }
  private WebSocketSession wrapped(WebSocketSession raw) {
    return raw.getAttributes().get(WRAPPED) instanceof WebSocketSession value ? value : raw;
  }
}
