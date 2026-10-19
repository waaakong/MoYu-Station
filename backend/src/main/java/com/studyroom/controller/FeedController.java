package com.studyroom.controller;

import com.studyroom.common.ApiResponse;
import com.studyroom.dto.CreateCommentRequest;
import com.studyroom.dto.FeedCommentResponse;
import com.studyroom.dto.FeedNotificationResponse;
import com.studyroom.dto.FeedPostResponse;
import com.studyroom.entity.User;
import com.studyroom.service.AuthService;
import com.studyroom.service.FeedService;
import org.springframework.http.MediaType;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import javax.servlet.http.HttpSession;
import java.util.List;

@RestController
@RequestMapping("/api/feed")
public class FeedController {
  private final AuthService authService;
  private final FeedService feedService;
  private com.studyroom.service.ReliableCreateService reliable;
  @org.springframework.beans.factory.annotation.Autowired(required=false)
  public void setReliable(com.studyroom.service.ReliableCreateService reliable){this.reliable=reliable;}
  private com.studyroom.service.FeedTimelineService timeline;
  @org.springframework.beans.factory.annotation.Autowired(required=false)
  public void setTimeline(com.studyroom.service.FeedTimelineService timeline){this.timeline=timeline;}

  public FeedController(AuthService authService, FeedService feedService) {
    this.authService = authService;
    this.feedService = feedService;
  }

  @GetMapping("/posts")
  public ApiResponse<?> posts(
      @RequestParam(required = false) Long beforeId,
      @RequestParam(required = false) String stream,
      @RequestParam(required = false) String cursor,
      HttpSession session
  ) {
    User user = authService.requireActiveUser(session);
    if(stream!=null || cursor!=null){if(timeline==null)throw new com.studyroom.common.BusinessException("FEED_CAPABILITY_UNAVAILABLE","动态双流尚未启用。");if(beforeId!=null)throw new com.studyroom.common.BusinessException("FEED_QUERY_INVALID","分页参数不能混用。");return ApiResponse.ok(timeline.page(user,stream==null?"square":stream,cursor));}
    return ApiResponse.ok(feedService.listPosts(user, beforeId));
  }

  @GetMapping("/capabilities") public ApiResponse<java.util.Map<String,Boolean>> capabilities(HttpSession session){authService.requireActiveUser(session);return ApiResponse.ok(java.util.Map.of("dualFeed",timeline!=null));}
  @org.springframework.web.bind.annotation.PutMapping("/follows/{userId}") public ApiResponse<?> follow(@PathVariable long userId,HttpSession session){return relationship(userId,session,true);}
  @DeleteMapping("/follows/{userId}") public ApiResponse<?> unfollow(@PathVariable long userId,HttpSession session){return relationship(userId,session,false);}
  private ApiResponse<?> relationship(long target,HttpSession session,boolean following){User user=authService.requireActiveUser(session);if(timeline==null)throw new com.studyroom.common.BusinessException("FEED_CAPABILITY_UNAVAILABLE","关注功能尚未启用。");return ApiResponse.ok(timeline.follow(user,target,following));}

  @GetMapping("/notifications")
  public ApiResponse<List<FeedNotificationResponse>> notifications(HttpSession session) {
    User user = authService.requireActiveUser(session);
    return ApiResponse.ok(feedService.notifications(user));
  }
  @GetMapping("/posts/{id}")
  public ApiResponse<?> post(@PathVariable Long id,HttpSession session){
    User user=authService.requireActiveUser(session);var posts=feedService.postsByIds(user,List.of(id));
    return ApiResponse.ok(posts.isEmpty()?null:posts.get(0));
  }

  @GetMapping("/publications/{requestId}")
  public ApiResponse<?> publication(@PathVariable String requestId, HttpSession session) {
    return ApiResponse.ok(feedService.publication(authService.requireActiveUser(session), requestId));
  }

  @PostMapping(value = "/posts", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ApiResponse<FeedPostResponse> createPost(
      @RequestParam(required = false) String content,
      @RequestParam(required = false) String sceneCode,
      @RequestParam String clientRequestId,
      @RequestPart(value = "images", required = false) MultipartFile[] images,
      HttpSession session
  ) {
    User user = authService.requireActiveUser(session);
    return ApiResponse.ok(feedService.createPost(user, content, sceneCode, clientRequestId, images));
  }

  @DeleteMapping("/posts/{id}")
  public ApiResponse<Void> deletePost(@PathVariable Long id, HttpSession session) {
    User user = authService.requireActiveUser(session);
    feedService.deleteOwnPost(user, id);
    return ApiResponse.ok(null);
  }

  @PostMapping("/posts/{id}/like")
  public ApiResponse<FeedPostResponse> likePost(@PathVariable Long id, HttpSession session) {
    User user = authService.requireActiveUser(session);
    return ApiResponse.ok(feedService.likePost(user, id));
  }

  @DeleteMapping("/posts/{id}/like")
  public ApiResponse<FeedPostResponse> unlikePost(@PathVariable Long id, HttpSession session) {
    User user = authService.requireActiveUser(session);
    return ApiResponse.ok(feedService.unlikePost(user, id));
  }

  @GetMapping("/posts/{id}/comments")
  public ApiResponse<List<FeedCommentResponse>> comments(@PathVariable Long id, HttpSession session) {
    authService.requireActiveUser(session);
    return ApiResponse.ok(feedService.comments(id));
  }

  @PostMapping("/posts/{id}/comments")
  public ApiResponse<FeedCommentResponse> createComment(
      @PathVariable Long id,
      @Validated @RequestBody CreateCommentRequest request,
      HttpSession session
  ) {
    User user = authService.requireActiveUser(session);
    if(request.getClientRequestId()==null) return ApiResponse.ok(feedService.createComment(user, id, request));
    return ApiResponse.ok(com.studyroom.service.ReliableCreateService.required(reliable).execute(user,
        com.studyroom.service.ReliableCreateService.Kind.COMMENT,request.getClientRequestId(),
        java.util.Arrays.asList(id,request.getParentId(),request.getReplyToUserId(),request.getContent()),
        ()->feedService.createComment(user,id,request),FeedCommentResponse::getId,
        target->feedService.replayComment(user,id,target)));
  }
}
