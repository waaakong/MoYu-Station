package com.studyroom.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.time.LocalDateTime;

@TableName("sr_invitation_redemption")
public class InvitationRedemption {
  @TableId
  private Long id;
  private Long invitationId;
  private Long userId;
  private String sourceIpHash;
  private LocalDateTime redeemedAt;

  public Long getId() { return id; }
  public void setId(Long id) { this.id = id; }
  public Long getInvitationId() { return invitationId; }
  public void setInvitationId(Long invitationId) { this.invitationId = invitationId; }
  public Long getUserId() { return userId; }
  public void setUserId(Long userId) { this.userId = userId; }
  public String getSourceIpHash() { return sourceIpHash; }
  public void setSourceIpHash(String sourceIpHash) { this.sourceIpHash = sourceIpHash; }
  public LocalDateTime getRedeemedAt() { return redeemedAt; }
  public void setRedeemedAt(LocalDateTime redeemedAt) { this.redeemedAt = redeemedAt; }
}
