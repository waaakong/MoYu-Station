import { it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { MessageNotificationService } from '../src/main/notifications';
function setup(delivery = 'show') {
  let owner: string | null = '2', epoch = 1, foreground = false, supported = true, time = 10000;
  const notices: Array<EventEmitter & { show: () => void; close: ReturnType<typeof vi.fn> }> = [];
  const activate = vi.fn();
  const service = new MessageNotificationService({ identity: () => ({ owner, epoch }), foreground: () => foreground, supported: () => supported, now: () => time, activate,
    create: () => { const n = Object.assign(new EventEmitter(), { show() { if (delivery) n.emit(delivery); }, close: vi.fn() }); notices.push(n); return n; } });
  const token = service.configure({ owner: '2', scope: '1:2', suppressed: false })!;
  const request = { token, peer: '3', key: '100', summary: false };
  return { service, request, notices, activate, foreground: () => { foreground = true; }, unsupported: () => { supported = false; }, advance: () => { time += 2000; }, changeOwner: () => { owner = '4'; epoch++; } };
}
it('sends one silent-content-free native notification and validates click lifetime', async () => {
  const s = setup(); expect(await s.service.show(s.request)).toBe('shown');
  expect(await s.service.show(s.request)).toBe('shown'); expect(s.notices).toHaveLength(1);
  s.notices[0]!.emit('click'); expect(s.activate).toHaveBeenCalledWith({ token: s.request.token, peer: '3' });
  s.service.clear(); s.notices[0]!.emit('click'); expect(s.activate).toHaveBeenCalledTimes(1);
});
it('main-process foreground check selects in-app rendering', async () => {
  const s = setup(); s.foreground(); expect(await s.service.show(s.request)).toBe('foreground'); expect(s.notices).toHaveLength(0);
});
it('suppression closes even timed-out Action Center notices and rejects late clicks', async () => {
  const s = setup(); await s.service.show(s.request); s.notices[0]!.emit('close');
  s.service.configure({ owner: '2', scope: '1:2', suppressed: true });
  expect(s.notices[0]!.close).toHaveBeenCalled(); expect(await s.service.show(s.request)).toBe('suppressed');
  s.notices[0]!.emit('click'); expect(s.activate).not.toHaveBeenCalled();
});
it('revocation, other owners and stale tokens are rejected', async () => {
  const s = setup(); await s.service.show(s.request); s.changeOwner(); s.notices[0]!.emit('click');
  expect(s.activate).not.toHaveBeenCalled(); await expect(s.service.show(s.request)).rejects.toThrow('NOTIFICATION_SESSION_REJECTED');
  expect(() => s.service.configure({ owner: '2', scope: '2:2', suppressed: false })).toThrow();
});
it('arbitrary paths and text cannot cross the bridge', async () => {
  const s = setup(); await expect(s.service.show({ ...s.request, url: 'file:///private' })).rejects.toThrow();
  await expect(s.service.show({ ...s.request, peer: 'https://example.com' })).rejects.toThrow();
});
it('unsupported systems and bursts fall back without losing unread state', async () => {
  const s = setup(); await s.service.show(s.request);
  expect(await s.service.show({ ...s.request, key: '101' })).toBe('unavailable');
  s.advance(); s.unsupported(); expect(await s.service.show({ ...s.request, key: '102' })).toBe('unavailable');
});
it('OS rejection is not reported as successful display', async () => {
  const s = setup('failed'); expect(await s.service.show(s.request)).toBe('unavailable');
});
it('missing OS acknowledgement times out and closes the test notification', async () => {
  vi.useFakeTimers();
  try {
    const s = setup(''); const result = s.service.show(s.request); await vi.advanceTimersByTimeAsync(2000);
    expect(await result).toBe('unavailable'); expect(s.notices[0]!.close).toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
});
it('dismisses only the requested key, never a newer notification, and validates the session', async () => {
  const s = setup(); await s.service.show(s.request); s.advance();
  await s.service.show({ ...s.request, key: '101' });
  s.service.dismiss({ token: s.request.token, key: '100' });
  expect(s.notices[1]!.close).not.toHaveBeenCalled();
  expect(() => s.service.dismiss({ token: s.request.token, key: '101', url: 'file:///x' })).toThrow();
  s.service.dismiss({ token: s.request.token, key: '101' });
  expect(s.notices[1]!.close).toHaveBeenCalledOnce();
  s.notices[1]!.emit('click'); expect(s.activate).not.toHaveBeenCalled();
  s.changeOwner(); expect(() => s.service.dismiss({ token: s.request.token, key: '101' })).toThrow('NOTIFICATION_SESSION_REJECTED');
});
