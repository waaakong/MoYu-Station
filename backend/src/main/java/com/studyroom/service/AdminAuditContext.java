package com.studyroom.service;

import javax.servlet.http.HttpServletRequest;

public record AdminAuditContext(String ipAddress, String userAgent, String reason) {
  public static AdminAuditContext from(HttpServletRequest request, String reason) {
    return new AdminAuditContext(request == null ? null : request.getRemoteAddr(), request == null ? null : request.getHeader("User-Agent"), reason);
  }
}
