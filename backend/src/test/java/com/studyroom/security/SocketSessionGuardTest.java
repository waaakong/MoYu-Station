package com.studyroom.security;

import com.studyroom.config.AuthSecurityProperties;
import com.studyroom.service.AuthService;
import com.studyroom.service.ChatService;
import java.util.HashMap;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.session.MapSession;
import org.springframework.session.SessionRepository;
import org.springframework.web.socket.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class SocketSessionGuardTest {
  private final ChatService accounts = mock(ChatService.class);
  private final ObjectProvider<SessionRepository> repositories = mock(ObjectProvider.class);
  private final AuthSecurityProperties properties = new AuthSecurityProperties();
  private final SocketSessionGuard guard = new SocketSessionGuard(repositories, accounts, properties);

  @Test void logoutAndAccountSwitchInvalidateServletSockets() {
    var http = http(); var socket = socket(http);
    guard.check(socket); verify(accounts).requireSocketUser(7L, "epoch");
    http.setAttribute(AuthService.SESSION_USER_ID, 8L);
    assertThatThrownBy(() -> guard.check(socket)).isInstanceOf(IllegalStateException.class);
    http.invalidate(); assertThatThrownBy(() -> guard.check(socket)).isInstanceOf(IllegalStateException.class);
  }
  @Test void desktopAbsoluteLifetimeAndServletIdleExpiryAreChecked() {
    var http = spy(http()); var socket = socket(http);
    http.setAttribute(SessionPolicyInterceptor.REMEMBERED_ATTRIBUTE, true);
    http.setAttribute(SessionPolicyInterceptor.CREATED_AT_ATTRIBUTE, 0L);
    assertThatThrownBy(() -> guard.check(socket)).hasMessage("SOCKET_SESSION_EXPIRED");
    http.setAttribute(SessionPolicyInterceptor.REMEMBERED_ATTRIBUTE, false);
    http.setMaxInactiveInterval(1); doReturn(System.currentTimeMillis() - 2000).when(http).getLastAccessedTime();
    assertThatThrownBy(() -> guard.check(socket)).hasMessage("SOCKET_SESSION_EXPIRED");
  }
  @Test void redisDeletionAndOutageCannotFallBackToStaleHandshakeSession() {
    var http = http(); var socket = socket(http); var repository = mock(SessionRepository.class);
    when(repositories.getIfAvailable()).thenReturn(repository);
    assertThatThrownBy(() -> guard.check(socket)).hasMessage("SOCKET_SESSION_ENDED");
    when(repository.findById(http.getId())).thenThrow(new IllegalStateException("redis unavailable"));
    assertThatThrownBy(() -> guard.check(socket)).hasMessage("redis unavailable"); verifyNoInteractions(accounts);
  }
  @Test void storedSessionIdentityAndEpochMustMatchHandshakeAndDatabase() {
    var http = http(); var socket = socket(http); var repository = mock(SessionRepository.class);
    when(repositories.getIfAvailable()).thenReturn(repository);
    MapSession stored = new MapSession(http.getId()); stored.setAttribute(AuthService.SESSION_USER_ID, 7L); stored.setAttribute(AuthService.SESSION_LOGIN_VERSION, "epoch");
    when(repository.findById(http.getId())).thenReturn(stored); guard.check(socket);
    stored.setAttribute(AuthService.SESSION_LOGIN_VERSION, "new"); assertThatThrownBy(() -> guard.check(socket)).hasMessage("SOCKET_SESSION_ENDED");
  }
  @Test void bothIncomingAndOutgoingFramesAreBlockedAfterLogout() throws Exception {
    var http = http(); var socket = socket(http); var delegate = mock(WebSocketHandler.class);
    var handler = new SessionBoundSocketHandler(delegate, guard); handler.afterConnectionEstablished(socket);
    var captor = org.mockito.ArgumentCaptor.forClass(WebSocketSession.class); verify(delegate).afterConnectionEstablished(captor.capture());
    WebSocketSession wrapped = captor.getValue(); http.invalidate();
    wrapped.sendMessage(new TextMessage("private data")); verify(socket, never()).sendMessage(any());
    handler.handleMessage(socket, new TextMessage("write")); verify(delegate, never()).handleMessage(any(), any());
    verify(socket, times(2)).close(CloseStatus.POLICY_VIOLATION);
    handler.afterConnectionClosed(socket, CloseStatus.NORMAL); verify(delegate).afterConnectionClosed(wrapped, CloseStatus.NORMAL);
  }
  private MockHttpSession http() {
    var http = new MockHttpSession(); http.setMaxInactiveInterval(3600);
    http.setAttribute(AuthService.SESSION_USER_ID, 7L); http.setAttribute(AuthService.SESSION_LOGIN_VERSION, "epoch"); return http;
  }
  private WebSocketSession socket(MockHttpSession http) {
    var socket = mock(WebSocketSession.class); var attributes = new HashMap<String, Object>();
    attributes.put(SocketSessionGuard.HTTP_SESSION, http); attributes.put(SocketSessionGuard.SESSION_ID, http.getId());
    attributes.put(AuthService.SESSION_USER_ID, 7L); attributes.put(AuthService.SESSION_LOGIN_VERSION, "epoch");
    when(socket.getAttributes()).thenReturn(attributes); return socket;
  }
}
