package com.studyroom.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.studyroom.common.BusinessException;
import com.studyroom.common.ErrorCode;
import com.studyroom.dto.CreateInvitationRequest;
import com.studyroom.dto.InvitationResponse;
import com.studyroom.dto.RegisterRequest;
import com.studyroom.entity.Invitation;
import com.studyroom.entity.InvitationRedemption;
import com.studyroom.entity.User;
import com.studyroom.mapper.InvitationMapper;
import com.studyroom.mapper.InvitationRedemptionMapper;
import com.studyroom.mapper.UserMapper;
import com.studyroom.security.PasswordService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@Testcontainers(disabledWithoutDocker = true)
class InvitationConcurrencyTest {
  private static final String TEST_PEPPER = "integration-test-pepper-with-at-least-32-bytes";

  @Container
  private static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.0.36")
      .withDatabaseName("study_room_invitation_test")
      .withUsername("studyroom_test")
      .withPassword("invitation-test-only");

  @DynamicPropertySource
  static void databaseProperties(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", MYSQL::getJdbcUrl);
    registry.add("spring.datasource.username", MYSQL::getUsername);
    registry.add("spring.datasource.password", MYSQL::getPassword);
    registry.add("spring.session.store-type", () -> "none");
    registry.add("studyroom.invitation.pepper", () -> TEST_PEPPER);
  }

  @Autowired private InvitationService invitationService;
  @Autowired private InvitationMapper invitationMapper;
  @Autowired private InvitationRedemptionMapper redemptionMapper;
  @Autowired private UserMapper userMapper;
  @Autowired private PasswordService passwordService;

  private User administrator;

  @BeforeEach
  void resetDatabase() {
    redemptionMapper.delete(null);
    invitationMapper.delete(null);
    userMapper.delete(null);

    administrator = new User();
    administrator.setUsername("concurrency-admin");
    administrator.setNickname("Concurrency Admin");
    administrator.setPasswordHash(passwordService.encode("administrator password"));
    administrator.setForcePasswordChange(0);
    administrator.setPasswordChangedAt(LocalDateTime.now());
    administrator.setUserType("ADMIN");
    administrator.setOnlineStatus("OFFLINE");
    administrator.setLevel(0);
    administrator.setExp(0);
    administrator.setLoginVersion("integration-admin-login-version");
    administrator.setDeleted(0);
    userMapper.insert(administrator);
  }

  @Test
  void twentyConcurrentRegistrationsCannotOverspendAThreeUseInvitation() throws Exception {
    CreateInvitationRequest createRequest = new CreateInvitationRequest();
    createRequest.setLabel("Concurrency gate");
    createRequest.setMaxUses(3);
    createRequest.setExpiresAt(LocalDateTime.now().plusHours(1));
    InvitationResponse invitation = invitationService.create(createRequest, administrator);

    int contenders = 20;
    ExecutorService executor = Executors.newFixedThreadPool(contenders);
    CountDownLatch ready = new CountDownLatch(contenders);
    CountDownLatch start = new CountDownLatch(1);
    List<CompletableFuture<String>> attempts = new ArrayList<>();
    try {
      for (int index = 0; index < contenders; index++) {
        int contender = index;
        attempts.add(CompletableFuture.supplyAsync(() -> {
          ready.countDown();
          try {
            start.await(10, TimeUnit.SECONDS);
            invitationService.register(registerRequest(contender, invitation.getCode()));
            return "SUCCESS";
          } catch (BusinessException exception) {
            return exception.getCode();
          } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(exception);
          }
        }, executor));
      }
      assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
      start.countDown();

      List<String> results = attempts.stream().map(CompletableFuture::join).toList();
      assertThat(results.stream().filter("SUCCESS"::equals).count()).isEqualTo(3);
      assertThat(results.stream().filter(ErrorCode.INVITATION_EXHAUSTED.name()::equals).count()).isEqualTo(17);
    } finally {
      executor.shutdownNow();
      assertThat(executor.awaitTermination(10, TimeUnit.SECONDS)).isTrue();
    }

    Invitation stored = invitationMapper.selectById(invitation.getId());
    assertThat(stored.getUsedCount()).isEqualTo(3);
    assertThat(stored.getStatus()).isEqualTo("EXHAUSTED");
    assertThat(redemptionMapper.selectCount(new LambdaQueryWrapper<InvitationRedemption>()
        .eq(InvitationRedemption::getInvitationId, invitation.getId()))).isEqualTo(3);
    assertThat(userMapper.selectCount(new LambdaQueryWrapper<User>()
        .likeRight(User::getUsername, "concurrent-user-"))).isEqualTo(3);
  }

  private RegisterRequest registerRequest(int index, String code) {
    RegisterRequest request = new RegisterRequest();
    request.setUsername("concurrent-user-" + index);
    request.setNickname("Concurrent " + index);
    request.setPassword("concurrent password " + index);
    request.setInvitationCode(code);
    return request;
  }
}
