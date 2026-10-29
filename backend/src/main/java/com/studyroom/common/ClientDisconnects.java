package com.studyroom.common;

import java.io.IOException;
import java.util.Locale;

/** Transport failures only; business errors must remain observable. */
public final class ClientDisconnects {
  private ClientDisconnects() { }

  public static boolean isDisconnected(Throwable error) {
    int depth = 0;
    for (Throwable current = error; current != null && depth++ < 16; current = current.getCause()) {
      String type = current.getClass().getName();
      // Name matching keeps compatibility with Spring 5.3.31 and newer containers.
      if (type.equals("org.springframework.web.context.request.async.AsyncRequestNotUsableException")
          || type.equals("org.apache.catalina.connector.ClientAbortException")) return true;
      if (current instanceof IOException) {
        String message = String.valueOf(current.getMessage()).toLowerCase(Locale.ROOT);
        if (message.contains("broken pipe") || message.contains("connection reset")) return true;
      }
    }
    return false;
  }
}
