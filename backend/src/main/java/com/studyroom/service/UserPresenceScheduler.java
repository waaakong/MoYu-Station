package com.studyroom.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class UserPresenceScheduler {
  private final ActiveVisitorService activeVisitorService;

  public UserPresenceScheduler(ActiveVisitorService activeVisitorService) {
    this.activeVisitorService = activeVisitorService;
  }

  @Scheduled(fixedDelay = 10_000)
  public void markInactiveUsersOffline() {
    activeVisitorService.markInactiveUsersOffline();
  }
}
