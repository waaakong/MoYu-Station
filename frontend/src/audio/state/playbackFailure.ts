export type FailureAction = 'retry' | 'login' | 'wait' | 'none';
const reasons: Record<string, { reason: string; action: FailureAction }> = {
  PROVIDER_DISABLED: { reason: '此平台的实验播放能力未开启。', action: 'none' },
  PROVIDER_LOGIN_REQUIRED: { reason: '需要先登录此音乐平台。', action: 'login' },
  PROVIDER_APP_LOGIN_REQUIRED: { reason: '请先通过账号菜单登录墨屿，再登录对应音乐平台。', action: 'none' },
  PROVIDER_SESSION_EXPIRED: { reason: '此音乐平台的登录已失效，请在官方窗口重新登录。', action: 'login' },
  PROVIDER_TIMEOUT: { reason: '音乐平台响应超时，请稍后手动重试。', action: 'retry' },
  PROVIDER_RATE_LIMITED: { reason: '音乐平台限制了请求频率，请等待冷却结束，不要连续重试。', action: 'wait' },
  PROVIDER_CIRCUIT_OPEN: { reason: '近期请求连续失败，客户端暂时停止请求此平台。', action: 'wait' },
  PROVIDER_RIGHTS_RESTRICTED: { reason: '平台未授予当前账号此曲目的播放权限；不会绕过会员或版权限制。', action: 'none' },
  PROVIDER_REGION_RESTRICTED: { reason: '平台返回地区限制，此曲目当前不可播放。', action: 'none' },
  PROVIDER_API_CHANGED: { reason: '平台接口返回不兼容的数据，需要更新适配器后再试。', action: 'none' },
  PROVIDER_UNAVAILABLE: { reason: '无法连接音乐平台或平台暂不可用；尚不能确认具体原因。', action: 'retry' },
  MEDIA_NETWORK_ERROR: { reason: '音频传输中断，请检查网络后重试。', action: 'retry' },
  MEDIA_BUFFER_TIMEOUT: { reason: '音频持续 15 秒无法继续缓冲，已停止等待。请检查网络或稍后重试。', action: 'retry' },
  MEDIA_DECODE_ERROR: { reason: '音频解码失败，文件可能损坏或编码不兼容。', action: 'retry' },
  MEDIA_SOURCE_UNSUPPORTED: { reason: '未能读取可播放的音频，可能是音源响应异常或格式不支持；尚不能确认具体原因。', action: 'retry' },
  MEDIA_LOAD_FAILED: { reason: '音频未能加载，尚不能确认具体原因。', action: 'retry' },
  AUDIO_CONTEXT_SUSPENDED: { reason: '系统未能启用音频输出，请点击重试。', action: 'retry' },
  PLAYBACK_REJECTED: { reason: '系统未能开始播放，请点击重试。', action: 'retry' },
  SOURCE_NOT_PLAYABLE: { reason: '此音源当前无法播放，尚不能确认具体原因。', action: 'retry' }
};

export function normalizePlaybackError(error: unknown): string {
  const value = error as { code?: unknown; name?: unknown; message?: unknown } | null;
  for (const part of [value?.code, value?.name, value?.message, typeof error === 'string' ? error : undefined]) {
    if (typeof part !== 'string') continue;
    const match = part.match(/\b(?:PROVIDER_[A-Z_]+|MEDIA_[A-Z_]+|AUDIO_CONTEXT_SUSPENDED|PLAYBACK_REJECTED|SOURCE_NOT_PLAYABLE)\b/);
    if (match && reasons[match[0]]) return match[0];
  }
  return 'SOURCE_NOT_PLAYABLE';
}

export function playbackFailure(code: unknown) {
  const normalized = normalizePlaybackError(code);
  return { code: normalized, title: '音源无法播放', ...reasons[normalized]! };
}
