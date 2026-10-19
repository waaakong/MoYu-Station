package com.studyroom.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyroom.common.BusinessException;
import com.studyroom.entity.Post;
import com.studyroom.entity.User;
import com.studyroom.mapper.PostCommentMapper;
import com.studyroom.mapper.PostLikeMapper;
import com.studyroom.mapper.PostMapper;
import com.studyroom.mapper.UserMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.Collections;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FeedServiceTest {
  @Mock PostMapper postMapper;
  @Mock PostCommentMapper postCommentMapper;
  @Mock PostLikeMapper postLikeMapper;
  @Mock UserMapper userMapper;
  @Mock ImageStorageService imageStorageService;
  @Mock FeedNotificationSocketHub notificationSocketHub;

  @Test
  void returnsExistingPostForRepeatedClientRequestId() {
    User user = user();
    when(userMapper.selectOne(any())).thenReturn(user);
    Post post = post();
    when(postMapper.selectOne(any())).thenReturn(post);
    when(postLikeMapper.selectList(any())).thenReturn(Collections.emptyList());

    var response = service().createPost(user, "same request", "forest", "1234567890abcdef", null);

    assertThat(response.getId()).isEqualTo(42L);
    verify(postMapper, never()).insert(any(Post.class));
  }

  @Test
  void rejectsCustomOrUnknownSceneCodes() {
    when(userMapper.selectOne(any())).thenReturn(user());
    assertThatThrownBy(() -> service().createPost(user(), "hello", "custom", "1234567890abcdef", null))
        .isInstanceOf(BusinessException.class)
        .extracting("code").isEqualTo("FEED_SCENE_INVALID");
    verify(postMapper, never()).insert(any(Post.class));
  }

  private FeedService service() {
    return new FeedService(postMapper, postCommentMapper, postLikeMapper, userMapper,
        new ObjectMapper(), imageStorageService, notificationSocketHub);
  }

  private User user() {
    User user = new User();
    user.setId(7L);
    user.setUsername("tester");
    user.setNickname("Tester");
    user.setUserType("NORMAL");
    return user;
  }

  private Post post() {
    Post post = new Post();
    post.setId(42L);
    post.setUserId(7L);
    post.setClientRequestId("1234567890abcdef");
    post.setContent("same request");
    post.setSceneCode("forest");
    post.setImageUrlsJson("[]");
    post.setLikeCount(0);
    post.setCommentCount(0);
    post.setDeletedByUser(0);
    post.setDeletedByAdmin(0);
    post.setCreatedAt(LocalDateTime.now());
    return post;
  }
}
