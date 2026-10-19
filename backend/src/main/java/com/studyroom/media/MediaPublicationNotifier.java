package com.studyroom.media;

import com.studyroom.service.AuthService;
import com.studyroom.service.ChatService;
import com.studyroom.service.ChatSocketHub;
import java.util.*;
import java.util.function.Consumer;

/** Best-effort committed-data refresh hints, not delivery acknowledgements or a durable outbox. */
public final class MediaPublicationNotifier implements Consumer<MediaPublicationService.Committed> {
  public static final String EVENT = "MEDIA_PUBLICATION_COMMITTED";
  private final ChatService accounts;
  private final ChatSocketHub sockets;
  public MediaPublicationNotifier(ChatService accounts, ChatSocketHub sockets) { this.accounts = accounts; this.sockets = sockets; }

  @Override public void accept(MediaPublicationService.Committed event) {
    var publication = event.publication();
    Set<Long> recipients = publication.kind() == MediaPublicationService.Kind.PRIVATE
        ? Set.of(event.owner(), Objects.requireNonNull(event.recipient())) : new HashSet<>(sockets.activeUserIds());
    for (Long recipient : recipients) {
      sockets.sendToUserIf(recipient, EVENT, publication, session -> {
        Object id = session.getAttributes().get(AuthService.SESSION_USER_ID);
        Object version = session.getAttributes().get(AuthService.SESSION_LOGIN_VERSION);
        if (!(id instanceof Number number) || number.longValue() != recipient || !(version instanceof String text)) return false;
        return accounts.requireSocketUser(recipient, text) != null;
      });
    }
    if (publication.kind() == MediaPublicationService.Kind.PRIVATE) {
      // Image/sticker publications use HTTP, not PRIVATE_MESSAGE_SEND. Deliver the same
      // committed-message event so global reminders work without fetching private media.
      var message = accounts.messageResponseFor(publication.targetId(), event.recipient());
      if (message == null) return; // A concurrent participant deletion may make the row invisible.
      sockets.sendToUserIf(event.recipient(), "PRIVATE_MESSAGE_RECEIVE", message, session -> {
        Object id = session.getAttributes().get(AuthService.SESSION_USER_ID);
        Object version = session.getAttributes().get(AuthService.SESSION_LOGIN_VERSION);
        return id instanceof Number number && number.longValue() == event.recipient()
            && version instanceof String text && accounts.requireSocketUser(event.recipient(), text) != null;
      });
    }
  }
}
