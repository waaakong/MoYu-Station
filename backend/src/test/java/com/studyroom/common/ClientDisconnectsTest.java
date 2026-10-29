package com.studyroom.common;

import java.io.IOException;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class ClientDisconnectsTest {
  @Test void recognizesTransportFailuresThroughCauses() {
    assertThat(ClientDisconnects.isDisconnected(new RuntimeException(new IOException("Broken pipe")))).isTrue();
    assertThat(ClientDisconnects.isDisconnected(new IOException("Connection reset by peer"))).isTrue();
  }
  @Test void preservesBusinessAndUnrelatedIoErrors() {
    assertThat(ClientDisconnects.isDisconnected(new IllegalStateException("Connection reset"))).isFalse();
    assertThat(ClientDisconnects.isDisconnected(new IOException("Cannot read metrics file"))).isFalse();
    assertThat(ClientDisconnects.isDisconnected(new RuntimeException("Broken pipe"))).isFalse();
  }
  @Test void boundsTraversalOfCyclicCauses() {
    Throwable cyclic = new RuntimeException() {
      @Override public synchronized Throwable getCause() { return this; }
    };
    assertThat(ClientDisconnects.isDisconnected(cyclic)).isFalse();
  }
}
