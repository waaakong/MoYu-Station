package com.studyroom.dto;

public class ChatMessageSaveResult {
  private final ChatMessageResponse message;
  private final boolean created;

  public ChatMessageSaveResult(ChatMessageResponse message, boolean created) {
    this.message = message;
    this.created = created;
  }

  public ChatMessageResponse getMessage() {
    return message;
  }

  public boolean isCreated() {
    return created;
  }
}
