package com.studyroom.controller;

import com.studyroom.common.ApiResponse;
import com.studyroom.dto.CompleteFocusRequest;
import com.studyroom.dto.FocusCheckinResponse;
import com.studyroom.dto.FocusOverviewResponse;
import com.studyroom.dto.FocusRecordResponse;
import com.studyroom.dto.FocusSyncRequest;
import com.studyroom.dto.FocusSyncResponse;
import com.studyroom.dto.StartFocusRequest;
import com.studyroom.dto.UserAudioResponse;
import com.studyroom.entity.User;
import com.studyroom.service.AuthService;
import com.studyroom.service.FocusService;
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
import javax.validation.Valid;
import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/api/focus")
public class FocusController {
  private final AuthService authService;
  private final FocusService focusService;

  public FocusController(AuthService authService, FocusService focusService) {
    this.authService = authService;
    this.focusService = focusService;
  }

  @GetMapping("/overview")
  public ApiResponse<FocusOverviewResponse> overview(HttpSession session) {
    return ApiResponse.ok(focusService.overview(authService.requireActiveUser(session)));
  }

  @PostMapping("/start")
  public ApiResponse<FocusRecordResponse> start(
      @Valid @RequestBody StartFocusRequest request,
      HttpSession session
  ) {
    return ApiResponse.ok(focusService.start(authService.requireActiveUser(session), request));
  }

  @PostMapping("/finish")
  public ApiResponse<FocusRecordResponse> finish(
      @Valid @RequestBody CompleteFocusRequest request,
      HttpSession session
  ) {
    return ApiResponse.ok(focusService.finish(authService.requireActiveUser(session), request));
  }

  @PostMapping("/cancel")
  public ApiResponse<FocusRecordResponse> cancel(
      @Valid @RequestBody CompleteFocusRequest request,
      HttpSession session
  ) {
    return ApiResponse.ok(focusService.cancel(authService.requireActiveUser(session), request));
  }

  @PostMapping("/sync")
  public ApiResponse<FocusSyncResponse> sync(
      @Valid @RequestBody FocusSyncRequest request,
      HttpSession session
  ) {
    return ApiResponse.ok(focusService.sync(authService.requireActiveUser(session), request));
  }

  @GetMapping("/checkin/today")
  public ApiResponse<FocusCheckinResponse> todayCheckin(HttpSession session) {
    return ApiResponse.ok(focusService.todayCheckin(authService.requireActiveUser(session)));
  }

  @PostMapping("/checkin")
  public ApiResponse<FocusCheckinResponse> checkin(
      @RequestParam String drawType,
      HttpSession session
  ) {
    return ApiResponse.ok(focusService.checkin(authService.requireActiveUser(session), drawType));
  }

  @GetMapping("/audio")
  public ApiResponse<List<UserAudioResponse>> audio(HttpSession session) {
    return ApiResponse.ok(focusService.listAudio(authService.requireActiveUser(session)));
  }

  @PostMapping("/audio")
  public ApiResponse<UserAudioResponse> uploadAudio(
      @RequestParam(required = false) String title,
      @RequestPart("file") MultipartFile file,
      HttpSession session
  ) throws IOException {
    User user = authService.requireActiveUser(session);
    return ApiResponse.ok(focusService.uploadAudio(user, title, file));
  }

  @DeleteMapping("/audio/{audioId}")
  public ApiResponse<Void> deleteAudio(@PathVariable Long audioId, HttpSession session) {
    focusService.deleteAudio(authService.requireActiveUser(session), audioId);
    return ApiResponse.ok(null);
  }
}
