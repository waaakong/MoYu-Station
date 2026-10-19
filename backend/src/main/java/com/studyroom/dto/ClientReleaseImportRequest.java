package com.studyroom.dto;

import javax.validation.constraints.NotBlank;

public class ClientReleaseImportRequest {
  @NotBlank private String manifestJson;
  @NotBlank private String signature;
  @NotBlank private String keyId;

  public String getManifestJson() { return manifestJson; }
  public void setManifestJson(String manifestJson) { this.manifestJson = manifestJson; }
  public String getSignature() { return signature; }
  public void setSignature(String signature) { this.signature = signature; }
  public String getKeyId() { return keyId; }
  public void setKeyId(String keyId) { this.keyId = keyId; }
}
