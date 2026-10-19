package com.studyroom.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyroom.common.BusinessException;
import com.studyroom.dto.CreateCommentRequest;
import com.studyroom.dto.FeedCommentResponse;
import com.studyroom.dto.FeedNotificationResponse;
import com.studyroom.dto.FeedPostResponse;
import com.studyroom.entity.Post;
import com.studyroom.entity.PostComment;
import com.studyroom.entity.PostLike;
import com.studyroom.entity.User;
import com.studyroom.mapper.PostCommentMapper;
import com.studyroom.mapper.PostLikeMapper;
import com.studyroom.mapper.PostMapper;
import com.studyroom.mapper.UserMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class FeedService {
  @org.springframework.beans.factory.annotation.Autowired private com.studyroom.media.PostDeletionService postDeletion;
  private static final int MAX_CONTENT_LENGTH = 500;
  private static final int MAX_COMMENT_LENGTH = 300;
  private static final int MAX_IMAGES = 9;
  private static final long MAX_IMAGE_SIZE = 5L * 1024L * 1024L;
  private static final Set<String> ALLOWED_SCENE_CODES = Set.of(
      "default", "mountain", "beach", "forest", "library", "cafe", "snow");
  private static final DateTimeFormatter DATE_TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
  private static final TypeReference<List<String>> STRING_LIST_TYPE = new TypeReference<List<String>>() {
  };

  private final PostMapper postMapper;
  private final PostCommentMapper postCommentMapper;
  private final PostLikeMapper postLikeMapper;
  private final UserMapper userMapper;
  private final ObjectMapper objectMapper;
  private final ImageStorageService imageStorageService;
  private final FeedNotificationSocketHub notificationSocketHub;
  private com.studyroom.media.MediaDescriptorService mediaDescriptors;
  @org.springframework.beans.factory.annotation.Autowired(required = false)
  public void setMediaDescriptors(com.studyroom.media.MediaDescriptorService value) { mediaDescriptors = value; }

  public FeedService(
      PostMapper postMapper,
      PostCommentMapper postCommentMapper,
      PostLikeMapper postLikeMapper,
      UserMapper userMapper,
      ObjectMapper objectMapper,
      ImageStorageService imageStorageService,
      FeedNotificationSocketHub notificationSocketHub
  ) {
    this.postMapper = postMapper;
    this.postCommentMapper = postCommentMapper;
    this.postLikeMapper = postLikeMapper;
    this.userMapper = userMapper;
    this.objectMapper = objectMapper;
    this.imageStorageService = imageStorageService;
    this.notificationSocketHub = notificationSocketHub;
  }

  public List<FeedPostResponse> listPosts(User currentUser, Long beforeId) {
    LambdaQueryWrapper<Post> query = visiblePostsQuery();
    if (beforeId != null && beforeId > 0) {
      query.lt(Post::getId, beforeId);
    }
    List<Post> posts = postMapper.selectList(query.orderByDesc(Post::getId).last("LIMIT 30"));
    return responses(currentUser,posts);
  }

  public List<FeedPostResponse> postsByIds(User currentUser,List<Long> ids){
    if(ids.isEmpty())return List.of();if(ids.size()>30)throw new IllegalArgumentException("Unbounded timeline hydration");
    var found=postMapper.selectList(visiblePostsQuery().in(Post::getId,ids)).stream().collect(Collectors.toMap(Post::getId,Function.identity()));
    return responses(currentUser,ids.stream().map(found::get).filter(Objects::nonNull).toList());
  }

  private List<FeedPostResponse> responses(User currentUser,List<Post> posts){
    Map<Long, User> users = usersById(posts.stream().map(Post::getUserId).collect(Collectors.toSet()));
    Set<Long> likedPostIds = likedPostIds(currentUser, posts);
    var descriptors = mediaDescriptors == null ? Map.<Long, List<com.studyroom.dto.MediaDescriptor>>of()
        : mediaDescriptors.posts(posts.stream().map(Post::getId).collect(Collectors.toList()));
    return posts.stream()
        .map(post -> toPostResponse(post, users.get(post.getUserId()), likedPostIds.contains(post.getId()), descriptors.getOrDefault(post.getId(), List.of())))
        .collect(Collectors.toList());
  }

  public List<FeedNotificationResponse> notifications(User currentUser) {
    if (currentUser == null || currentUser.getId() == null) {
      return Collections.emptyList();
    }
    List<Post> ownPosts = postMapper.selectList(visiblePostsQuery()
        .eq(Post::getUserId, currentUser.getId())
        .orderByDesc(Post::getCreatedAt)
        .last("LIMIT 200"));
    List<Long> postIds = ownPosts.stream().map(Post::getId).collect(Collectors.toList());

    List<PostComment> ownComments = postCommentMapper.selectList(new LambdaQueryWrapper<PostComment>()
        .eq(PostComment::getUserId, currentUser.getId())
        .eq(PostComment::getDeleted, 0)
        .orderByDesc(PostComment::getCreatedAt)
        .last("LIMIT 200"));
    List<Long> ownCommentIds = ownComments.stream().map(PostComment::getId).collect(Collectors.toList());

    List<PostComment> receivedComments = new ArrayList<>();
    if (!postIds.isEmpty()) {
      receivedComments.addAll(postCommentMapper.selectList(new LambdaQueryWrapper<PostComment>()
          .in(PostComment::getPostId, postIds)
          .eq(PostComment::getDeleted, 0)
          .ne(PostComment::getUserId, currentUser.getId())
          .orderByDesc(PostComment::getCreatedAt)
          .last("LIMIT 30")));
    }
    if (!ownCommentIds.isEmpty()) {
      receivedComments.addAll(postCommentMapper.selectList(new LambdaQueryWrapper<PostComment>()
          .in(PostComment::getParentId, ownCommentIds)
          .eq(PostComment::getDeleted, 0)
          .ne(PostComment::getUserId, currentUser.getId())
          .orderByDesc(PostComment::getCreatedAt)
          .last("LIMIT 30")));
    }
    receivedComments = receivedComments.stream()
        .collect(Collectors.toMap(PostComment::getId, Function.identity(), (left, right) -> left, LinkedHashMap::new))
        .values()
        .stream()
        .collect(Collectors.toList());

    List<PostLike> receivedLikes = postIds.isEmpty()
        ? Collections.emptyList()
        : postLikeMapper.selectList(new LambdaQueryWrapper<PostLike>()
            .in(PostLike::getPostId, postIds)
            .ne(PostLike::getUserId, currentUser.getId())
            .orderByDesc(PostLike::getCreatedAt)
            .last("LIMIT 30"));

    Set<Long> actorIds = new java.util.HashSet<>();
    receivedComments.forEach(comment -> actorIds.add(comment.getUserId()));
    receivedLikes.forEach(like -> actorIds.add(like.getUserId()));
    Map<Long, User> actors = usersById(actorIds);

    List<NotificationItem> items = new ArrayList<>();
    receivedComments.forEach(comment -> {
      String type = ownCommentIds.contains(comment.getParentId()) ? "reply" : "comment";
      items.add(new NotificationItem(
          comment.getCreatedAt(),
          toNotification(type + "-" + comment.getId(), type, comment.getPostId(), comment.getUserId(), actors.get(comment.getUserId()), comment.getContent(), comment.getCreatedAt())
      ));
    });
    receivedLikes.forEach(like -> items.add(new NotificationItem(
        like.getCreatedAt(),
        toNotification("like-" + like.getId(), "like", like.getPostId(), like.getUserId(), actors.get(like.getUserId()), "", like.getCreatedAt())
    )));

    return items.stream()
        .sorted(Comparator.comparing(NotificationItem::createdAt, Comparator.nullsLast(Comparator.naturalOrder())).reversed())
        .limit(10)
        .map(NotificationItem::response)
        .collect(Collectors.toList());
  }

  @Transactional
  public FeedPostResponse createPost(User user, String content, String sceneCode, String clientRequestId, MultipartFile[] images) {
    String normalizedRequestId = normalizeClientRequestId(clientRequestId);
    User locked = userMapper.selectOne(new LambdaQueryWrapper<User>().eq(User::getId, user.getId()).last("FOR UPDATE"));
    if (locked == null || Integer.valueOf(1).equals(locked.getDeleted()) || "BANNED".equalsIgnoreCase(locked.getUserType())) throw new BusinessException("账号不可用。");
    if (!Objects.equals(user.getLoginVersion(), locked.getLoginVersion())) throw new com.studyroom.common.AccountLoggedInElsewhereException();
    ensureCanSpeak(locked);
    List<MultipartFile> imageList = normalizeImages(images);
    String normalizedContent = normalizeContent(content, !imageList.isEmpty());
    String normalizedScene = normalizeSceneCode(sceneCode);
    Post existing = postMapper.selectOne(new LambdaQueryWrapper<Post>()
        .eq(Post::getUserId, user.getId())
        .eq(Post::getClientRequestId, normalizedRequestId)
        .last("FOR UPDATE"));
    if (existing != null) {
      if (!Objects.equals(existing.getContent(), normalizedContent) || !Objects.equals(existing.getSceneCode(), normalizedScene)
          || (imageList.isEmpty() && !"[]".equals(existing.getImageUrlsJson())))
        throw new BusinessException("FEED_REQUEST_ID_CONFLICT", "该请求 ID 已绑定其他内容，请查询原发布结果。");
      return toPostResponse(existing, user, likedPostIds(user, List.of(existing)).contains(existing.getId()));
    }

    Post post = new Post();
    post.setUserId(user.getId());
    post.setClientRequestId(normalizedRequestId);
    post.setContent(normalizedContent);
    post.setSceneCode(normalizedScene);
    post.setImageUrlsJson("[]");
    post.setLikeCount(0);
    post.setCommentCount(0);
    post.setDeletedByUser(0);
    post.setDeletedByAdmin(0);
    postMapper.insert(post);

    if (!imageList.isEmpty()) {
      try {
        List<String> imageUrls = saveImages(user.getId(), post.getId(), imageList);
        post.setImageUrlsJson(objectMapper.writeValueAsString(imageUrls));
        postMapper.updateById(post);
      } catch (IOException exception) {
        postMapper.update(null, new LambdaUpdateWrapper<Post>()
            .eq(Post::getId, post.getId())
            .set(Post::getDeletedByUser, 1)
            .set(Post::getDeleteReason, "Image save failed"));
        throw new BusinessException("Image save failed. Please try again.");
      }
    }

    return toPostResponse(postMapper.selectById(post.getId()), user, false);
  }

  public Map<String, Object> publication(User user, String requestId) {
    Post post = postMapper.selectOne(new LambdaQueryWrapper<Post>().eq(Post::getUserId, user.getId())
        .eq(Post::getClientRequestId, normalizeClientRequestId(requestId)).last("LIMIT 1"));
    // Deleted publications remain receipts; absence is reported only after a successful database read.
    return post == null ? Map.of("status", "missing") : Map.of("status", "committed", "targetId", post.getId());
  }

  private String normalizeClientRequestId(String clientRequestId) {
    if (!StringUtils.hasText(clientRequestId)) {
      throw new BusinessException("FEED_REQUEST_ID_REQUIRED", "发布请求缺少幂等标识。");
    }
    String normalized = clientRequestId.trim();
    if (!normalized.matches("[a-zA-Z0-9_-]{16,64}")) {
      throw new BusinessException("FEED_REQUEST_ID_INVALID", "发布请求标识无效。");
    }
    return normalized;
  }

  @Transactional
  public void deleteOwnPost(User user, Long postId) {
    if(postDeletion!=null){postDeletion.delete(user,postId,false,"Deleted by user");notificationSocketHub.postChanged(postId);return;}
    Post post = visiblePost(postId);
    if (!Objects.equals(post.getUserId(), user.getId())) {
      throw new BusinessException("You can only delete your own posts.");
    }
    postMapper.update(null, new LambdaUpdateWrapper<Post>()
        .eq(Post::getId, postId)
        .set(Post::getDeletedByUser, 1)
        .set(Post::getDeleteReason, "Deleted by user"));
    notificationSocketHub.postChanged(postId);
  }

  @Transactional
  public FeedPostResponse likePost(User user, Long postId) {
    Post post = visiblePost(postId);
    Long existing = postLikeMapper.selectCount(new LambdaQueryWrapper<PostLike>()
        .eq(PostLike::getPostId, postId)
        .eq(PostLike::getUserId, user.getId()));
    if (existing == null || existing == 0) {
      PostLike like = new PostLike();
      like.setPostId(postId);
      like.setUserId(user.getId());
      postLikeMapper.insert(like);
      postMapper.update(null, new LambdaUpdateWrapper<Post>()
          .eq(Post::getId, postId)
          .setSql("like_count = like_count + 1"));
      if (!Objects.equals(post.getUserId(), user.getId())) {
        FeedNotificationResponse notification = toNotification(
            "like-" + like.getId(),
            "like",
            postId,
            user.getId(),
            user,
            "",
            like.getCreatedAt() == null ? LocalDateTime.now() : like.getCreatedAt());
        Runnable notify=()->notificationSocketHub.sendToUser(post.getUserId(), "FEED_NOTIFICATION_RECEIVE", notification);
        if(org.springframework.transaction.support.TransactionSynchronizationManager.isSynchronizationActive())
          org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(new org.springframework.transaction.support.TransactionSynchronization(){@Override public void afterCommit(){notify.run();}});
        else notify.run();
      }
    }
    notificationSocketHub.postChanged(postId);
    return toPostResponse(postMapper.selectById(post.getId()), userMapper.selectById(post.getUserId()), true);
  }

  @Transactional
  public FeedPostResponse unlikePost(User user, Long postId) {
    Post post = visiblePost(postId);
    int deleted = postLikeMapper.delete(new LambdaQueryWrapper<PostLike>()
        .eq(PostLike::getPostId, postId)
        .eq(PostLike::getUserId, user.getId()));
    if (deleted > 0) {
      postMapper.update(null, new LambdaUpdateWrapper<Post>()
          .eq(Post::getId, postId)
          .setSql("like_count = GREATEST(like_count - 1, 0)"));
    }
    notificationSocketHub.postChanged(postId);
    return toPostResponse(postMapper.selectById(post.getId()), userMapper.selectById(post.getUserId()), false);
  }

  public List<FeedCommentResponse> comments(Long postId) {
    visiblePost(postId);
    List<PostComment> postComments = postCommentMapper.selectList(new LambdaQueryWrapper<PostComment>()
        .eq(PostComment::getPostId, postId)
        .eq(PostComment::getDeleted, 0)
        .orderByAsc(PostComment::getCreatedAt));
    Set<Long> userIds = new java.util.HashSet<>();
    postComments.forEach(comment -> {
      userIds.add(comment.getUserId());
      if (comment.getReplyToUserId() != null) {
        userIds.add(comment.getReplyToUserId());
      }
    });
    Map<Long, User> users = usersById(userIds);
    return postComments.stream()
        .map(comment -> toCommentResponse(comment, users.get(comment.getUserId()), users.get(comment.getReplyToUserId())))
        .collect(Collectors.toList());
  }

  @Transactional
  public FeedCommentResponse createComment(User user, Long postId, CreateCommentRequest request) {
    ensureCanSpeak(user);
    visiblePost(postId);
    String normalizedContent = request == null || request.getContent() == null ? "" : request.getContent().trim();
    if (!StringUtils.hasText(normalizedContent)) {
      throw new BusinessException("Comment cannot be empty.");
    }
    if (normalizedContent.length() > MAX_COMMENT_LENGTH) {
      throw new BusinessException("Comment cannot exceed 300 characters.");
    }

    Long parentId = request == null ? null : request.getParentId();
    PostComment parent = null;
    if (parentId != null) {
      parent = postCommentMapper.selectOne(new LambdaQueryWrapper<PostComment>()
          .eq(PostComment::getId, parentId)
          .eq(PostComment::getPostId, postId)
          .eq(PostComment::getDeleted, 0)
          .last("LIMIT 1"));
      if (parent == null) {
        throw new BusinessException("The comment you replied to no longer exists.");
      }
    }

    PostComment comment = new PostComment();
    comment.setPostId(postId);
    comment.setUserId(user.getId());
    comment.setParentId(parentId);
    comment.setReplyToUserId(parent == null || parent.getUserId() == null
        ? (request == null ? null : request.getReplyToUserId())
        : parent.getUserId());
    comment.setContent(normalizedContent);
    comment.setDeleted(0);
    postCommentMapper.insert(comment);
    postMapper.update(null, new LambdaUpdateWrapper<Post>()
        .eq(Post::getId, postId)
        .setSql("comment_count = comment_count + 1"));
    Post post = postMapper.selectById(postId);
    PostComment replyParent=parent;
    notificationSocketHub.postChanged(postId);
    if(org.springframework.transaction.support.TransactionSynchronizationManager.isSynchronizationActive()) {
      org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
          new org.springframework.transaction.support.TransactionSynchronization() {
            @Override public void afterCommit() { pushCommentNotifications(user,post,comment,replyParent); }
          });
    } else {
      pushCommentNotifications(user,post,comment,replyParent);
    }
    return toCommentResponse(comment, user, parent == null ? null : userMapper.selectById(parent.getUserId()));
  }

  public FeedCommentResponse replayComment(User user, long postId, long commentId) {
    visiblePost(postId);
    PostComment comment=postCommentMapper.selectById(commentId);
    if(comment==null || !Objects.equals(comment.getPostId(),postId) || !Objects.equals(comment.getUserId(),user.getId()) || !Objects.equals(comment.getDeleted(),0))
      throw new BusinessException("CREATE_ALREADY_COMMITTED","原评论已提交，现已不可用，请核对原请求结果。");
    return toCommentResponse(comment,user,comment.getReplyToUserId()==null?null:userMapper.selectById(comment.getReplyToUserId()));
  }

  private void ensureCanSpeak(User user) {
    if ("MUTED".equalsIgnoreCase(user.getUserType())) {
      throw new BusinessException("Current account is muted.");
    }
  }

  private String normalizeContent(String content, boolean hasImages) {
    String normalized = content == null ? "" : content.trim();
    if (!StringUtils.hasText(normalized) && !hasImages) {
      throw new BusinessException("Post content cannot be empty.");
    }
    if (normalized.length() > MAX_CONTENT_LENGTH) {
      throw new BusinessException("Post content cannot exceed 500 characters.");
    }
    return normalized;
  }

  private String normalizeSceneCode(String sceneCode) {
    if (!StringUtils.hasText(sceneCode)) {
      return "default";
    }
    String normalized = sceneCode.trim().toLowerCase(Locale.ROOT);
    if (!ALLOWED_SCENE_CODES.contains(normalized)) {
      throw new BusinessException("FEED_SCENE_INVALID", "动态背景只能使用内置场景。");
    }
    return normalized;
  }

  private List<MultipartFile> normalizeImages(MultipartFile[] images) {
    if (images == null || images.length == 0) {
      return Collections.emptyList();
    }
    List<MultipartFile> validImages = new ArrayList<>();
    for (MultipartFile image : images) {
      if (image == null || image.isEmpty()) {
        continue;
      }
      if (image.getSize() > MAX_IMAGE_SIZE) {
        throw new BusinessException("UPLOAD_TOO_LARGE", "Each post image must be 5MB or smaller.");
      }
      validImages.add(image);
    }
    if (validImages.size() > MAX_IMAGES) {
      throw new BusinessException("A post can contain up to 9 images.");
    }
    return validImages;
  }

  private List<String> saveImages(Long userId, Long postId, List<MultipartFile> images) throws IOException {
    List<String> urls = new ArrayList<>();
    try {
      for (int i = 0; i < images.size(); i++) {
        MultipartFile image = images.get(i);
        String baseName = "image-" + (i + 1) + "-" + System.currentTimeMillis();
        ImageStorageService.StoredImage storedImage = imageStorageService.saveDisplayImage(
            image,
            userId,
            Path.of("feed", String.valueOf(userId), String.valueOf(postId)),
            "/uploads/feed/" + userId + "/" + postId,
            baseName,
            1600,
            1600,
            0.82F
        );
        urls.add(storedImage.displayUrl());
      }
      return urls;
    } catch (IOException | RuntimeException exception) {
      urls.forEach(imageStorageService::deleteDisplayAndOriginal);
      throw exception;
    }
  }

  private Post visiblePost(Long postId) {
    if (postId == null) {
      throw new BusinessException("Post does not exist.");
    }
    Post post = postMapper.selectOne(visiblePostsQuery()
        .eq(Post::getId, postId)
        .last("LIMIT 1"));
    if (post == null) {
      throw new BusinessException("Post does not exist or has been deleted.");
    }
    return post;
  }

  private LambdaQueryWrapper<Post> visiblePostsQuery() {
    return new LambdaQueryWrapper<Post>()
        .eq(Post::getDeletedByUser, 0)
        .eq(Post::getDeletedByAdmin, 0);
  }

  private Map<Long, User> usersById(Set<Long> userIds) {
    if (userIds == null || userIds.isEmpty()) {
      return Collections.emptyMap();
    }
    return userMapper.selectBatchIds(userIds).stream()
        .collect(Collectors.toMap(User::getId, Function.identity(), (left, right) -> left, LinkedHashMap::new));
  }

  private Set<Long> likedPostIds(User currentUser, List<Post> posts) {
    if (currentUser == null || posts == null || posts.isEmpty()) {
      return Collections.emptySet();
    }
    List<Long> postIds = posts.stream().map(Post::getId).collect(Collectors.toList());
    return postLikeMapper.selectList(new LambdaQueryWrapper<PostLike>()
            .eq(PostLike::getUserId, currentUser.getId())
            .in(PostLike::getPostId, postIds))
        .stream()
        .map(PostLike::getPostId)
        .collect(Collectors.toSet());
  }

  private FeedPostResponse toPostResponse(Post post, User author, boolean liked) {
    var descriptors = mediaDescriptors == null ? List.<com.studyroom.dto.MediaDescriptor>of()
        : mediaDescriptors.posts(List.of(post.getId())).getOrDefault(post.getId(), List.of());
    return toPostResponse(post, author, liked, descriptors);
  }

  private FeedPostResponse toPostResponse(Post post, User author, boolean liked, List<com.studyroom.dto.MediaDescriptor> media) {
    FeedPostResponse response = new FeedPostResponse();
    response.setId(post.getId());
    response.setAuthorId(post.getUserId());
    response.setAuthorName(authorName(author));
    response.setAuthorAvatar(author == null ? null : author.getAvatarUrl());
    response.setStudyRoomId(studyRoomId(post.getUserId()));
    response.setContent(post.getContent());
    response.setSceneCode(post.getSceneCode());
    response.setSceneName(sceneName(post.getSceneCode()));
    response.setImageUrls(parseImageUrls(post.getImageUrlsJson()));
    response.setMedia(media);
    response.setLikeCount(nullToZero(post.getLikeCount()));
    response.setCommentCount(nullToZero(post.getCommentCount()));
    response.setLiked(liked);
    response.setCreatedAt(formatDateTime(post.getCreatedAt()));
    return response;
  }

  private FeedCommentResponse toCommentResponse(PostComment comment, User author, User replyToUser) {
    FeedCommentResponse response = new FeedCommentResponse();
    response.setId(comment.getId());
    response.setPostId(comment.getPostId());
    response.setParentId(comment.getParentId());
    response.setReplyToUserId(comment.getReplyToUserId());
    response.setReplyToName(comment.getReplyToUserId() == null ? null : authorName(replyToUser));
    response.setAuthorId(comment.getUserId());
    response.setAuthorName(authorName(author));
    response.setAuthorAvatar(author == null ? null : author.getAvatarUrl());
    response.setContent(comment.getContent());
    response.setCreatedAt(formatDateTime(comment.getCreatedAt()));
    return response;
  }

  private void pushCommentNotifications(User actor, Post post, PostComment comment, PostComment parent) {
    if (post == null || actor == null || comment == null) {
      return;
    }
    if (parent != null && parent.getUserId() != null && !Objects.equals(parent.getUserId(), actor.getId())) {
      notificationSocketHub.sendToUser(parent.getUserId(), "FEED_NOTIFICATION_RECEIVE", toNotification(
          "reply-" + comment.getId(),
          "reply",
          comment.getPostId(),
          actor.getId(),
          actor,
          comment.getContent(),
          comment.getCreatedAt() == null ? LocalDateTime.now() : comment.getCreatedAt()));
    }
    if (post.getUserId() != null
        && !Objects.equals(post.getUserId(), actor.getId())
        && (parent == null || !Objects.equals(post.getUserId(), parent.getUserId()))) {
      notificationSocketHub.sendToUser(post.getUserId(), "FEED_NOTIFICATION_RECEIVE", toNotification(
          "comment-" + comment.getId(),
          "comment",
          comment.getPostId(),
          actor.getId(),
          actor,
          comment.getContent(),
          comment.getCreatedAt() == null ? LocalDateTime.now() : comment.getCreatedAt()));
    }
  }

  private FeedNotificationResponse toNotification(
      String key,
      String type,
      Long postId,
      Long actorId,
      User actor,
      String content,
      LocalDateTime createdAt
  ) {
    FeedNotificationResponse response = new FeedNotificationResponse();
    response.setKey(key);
    response.setType(type);
    response.setPostId(postId);
    response.setActorId(actorId);
    response.setActorName(authorName(actor));
    response.setActorAvatar(actor == null ? null : actor.getAvatarUrl());
    response.setContent(content);
    response.setCreatedAt(formatDateTime(createdAt));
    return response;
  }

  private static class NotificationItem {
    private final LocalDateTime createdAt;
    private final FeedNotificationResponse response;

    NotificationItem(LocalDateTime createdAt, FeedNotificationResponse response) {
      this.createdAt = createdAt;
      this.response = response;
    }

    LocalDateTime createdAt() {
      return createdAt;
    }

    FeedNotificationResponse response() {
      return response;
    }
  }

  private List<String> parseImageUrls(String imageUrlsJson) {
    if (!StringUtils.hasText(imageUrlsJson)) {
      return Collections.emptyList();
    }
    try {
      return objectMapper.readValue(imageUrlsJson, STRING_LIST_TYPE);
    } catch (JsonProcessingException exception) {
      return Collections.emptyList();
    }
  }

  private String authorName(User author) {
    if (author == null) {
      return "StudyRoom";
    }
    if (StringUtils.hasText(author.getNickname())) {
      return author.getNickname();
    }
    return author.getUsername();
  }

  private String sceneName(String sceneCode) {
    Map<String, String> names = new HashMap<>();
    names.put("default", "默认");
    names.put("mountain", "高山湖泊");
    names.put("beach", "海边沙滩");
    names.put("forest", "森林");
    names.put("library", "图书馆");
    names.put("cafe", "雨天咖啡馆");
    names.put("snow", "雪山窗边");
    names.put("custom", "自定义场景");
    return names.getOrDefault(sceneCode, "默认");
  }

  private String studyRoomId(Long userId) {
    return String.format("SR-%08d", userId == null ? 0 : userId);
  }

  private String formatDateTime(LocalDateTime dateTime) {
    return dateTime == null ? "" : dateTime.format(DATE_TIME_FORMATTER);
  }

  private int nullToZero(Integer value) {
    return value == null ? 0 : value;
  }
}
