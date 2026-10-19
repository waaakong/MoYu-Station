package com.studyroom.dto;

import javax.validation.constraints.Pattern;

public abstract class ReliableCreateRequest {
  // Nullable only for legacy clients; the new client requires the advertised capability.
  @Pattern(regexp="[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",message="请求标识无效")
  private String clientRequestId;
  public String getClientRequestId() { return clientRequestId; }
  public void setClientRequestId(String value) { clientRequestId=value; }
}
