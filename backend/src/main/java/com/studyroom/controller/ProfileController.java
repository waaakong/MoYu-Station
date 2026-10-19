package com.studyroom.controller;

import com.studyroom.common.ApiResponse;
import com.studyroom.dto.FeedbackRequest;
import com.studyroom.dto.ProfileCalendarDayResponse;
import com.studyroom.dto.ProfilePostResponse;
import com.studyroom.dto.ProfileStatsResponse;
import com.studyroom.dto.ShareCardResponse;
import com.studyroom.dto.UpdateNicknameRequest;
import com.studyroom.dto.UpdateOwnPasswordRequest;
import com.studyroom.dto.UserProfileResponse;
import com.studyroom.entity.User;
import com.studyroom.service.AuthService;
import com.studyroom.service.ProfileService;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import javax.servlet.http.HttpSession;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/profile")
public class ProfileController {
  private final AuthService authService;
  private final ProfileService profileService;
  private com.studyroom.service.ReliableCreateService reliable;
  @org.springframework.beans.factory.annotation.Autowired(required=false)
  public void setReliable(com.studyroom.service.ReliableCreateService reliable){this.reliable=reliable;}

  public ProfileController(AuthService authService, ProfileService profileService) {
    this.authService = authService;
    this.profileService = profileService;
  }

  @GetMapping("/me")
  public ApiResponse<UserProfileResponse> me(HttpSession session) {
    User user = authService.requireActiveUser(session);
    return ApiResponse.ok(profileService.profile(user));
  }

  @PostMapping("/nickname")
  public ApiResponse<UserProfileResponse> updateNickname(
      @Validated @RequestBody UpdateNicknameRequest request,
      HttpSession session
  ) {
    User user = authService.requireActiveUser(session);
    return ApiResponse.ok(profileService.updateNickname(user, request));
  }

  @PostMapping("/avatar")
  public ApiResponse<UserProfileResponse> updateAvatar(
      @RequestParam("file") MultipartFile file,
      HttpSession session
  ) {
    User user = authService.requireActiveUser(session);
    return ApiResponse.ok(profileService.updateAvatar(user, file));
  }

  @PostMapping("/password")
  public ApiResponse<Void> updatePassword(
      @Validated @RequestBody UpdateOwnPasswordRequest request,
      HttpSession session
  ) {
    User user = authService.requireActiveUser(session);
    profileService.updateOwnPassword(user, request, session);
    return ApiResponse.ok(null);
  }

  @GetMapping("/stats")
  public ApiResponse<ProfileStatsResponse> stats(HttpSession session) {
    User user = authService.requireActiveUser(session);
    return ApiResponse.ok(profileService.stats(user));
  }

  @GetMapping("/calendar")
  public ApiResponse<List<ProfileCalendarDayResponse>> calendar(
      @RequestParam(required = false) String month,
      HttpSession session
  ) {
    User user = authService.requireActiveUser(session);
    return ApiResponse.ok(profileService.calendar(user, month));
  }

  @GetMapping("/posts")
  public ApiResponse<List<ProfilePostResponse>> posts(HttpSession session) {
    User user = authService.requireActiveUser(session);
    return ApiResponse.ok(profileService.posts(user));
  }

  @DeleteMapping("/posts/{id}")
  public ApiResponse<Void> deletePost(@PathVariable Long id, HttpSession session) {
    User user = authService.requireActiveUser(session);
    profileService.deleteOwnPost(user, id);
    return ApiResponse.ok(null);
  }

  @GetMapping("/share-card")
  public ApiResponse<ShareCardResponse> shareCard(@RequestParam(required=false) String date,HttpSession session) {
    User user = authService.requireActiveUser(session);
    return ApiResponse.ok(profileService.shareCard(user,date));
  }

  @PostMapping("/feedback")
  public ApiResponse<Map<String, String>> feedback(
      @Validated @RequestBody FeedbackRequest request,
      HttpSession session
  ) {
    User user = authService.requireActiveUser(session);
    Long id = request.getClientRequestId()==null ? profileService.submitFeedback(user,request) :
        com.studyroom.service.ReliableCreateService.required(reliable).execute(user,
            com.studyroom.service.ReliableCreateService.Kind.FEEDBACK,request.getClientRequestId(),
            java.util.Arrays.asList(request.getFeedbackType(),request.getTitle(),request.getContent()),
            ()->profileService.submitFeedback(user,request),Long::longValue,Long::valueOf);
    return ApiResponse.ok(Map.of("id", String.valueOf(id)));
  }
}
