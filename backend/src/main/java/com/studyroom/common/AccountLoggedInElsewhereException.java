package com.studyroom.common;

public class AccountLoggedInElsewhereException extends BusinessException {
  public static final String CODE = "ACCOUNT_LOGGED_IN_ELSEWHERE";

  public AccountLoggedInElsewhereException() {
    super("账号已在其他地方登录，请重新登录。");
  }
}
