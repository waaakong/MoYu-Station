package com.studyroom.security;

import com.studyroom.controller.AdminController;
import com.studyroom.controller.AdminInvitationController;
import com.studyroom.controller.ClientUpdateAdminController;
import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;

import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class AdminSecurityContractTest {
  @Test
  void everyAdministrationMutationRequiresRecentVerification() {
    List<Method> writes = Arrays.stream(new Class<?>[] { AdminController.class, AdminInvitationController.class, ClientUpdateAdminController.class })
        .flatMap(type -> Arrays.stream(type.getDeclaredMethods()))
        .filter(this::isWrite)
        .filter(method -> !method.getName().equals("reverify"))
        .toList();

    assertThat(writes).isNotEmpty();
    assertThat(writes).allMatch(method -> method.isAnnotationPresent(RequireRecentAdminVerification.class),
        "every administrator write endpoint must declare recent verification");
  }

  private boolean isWrite(Method method) {
    return method.isAnnotationPresent(PostMapping.class) || method.isAnnotationPresent(PutMapping.class)
        || method.isAnnotationPresent(PatchMapping.class) || method.isAnnotationPresent(DeleteMapping.class);
  }
}
