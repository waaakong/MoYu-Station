import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { contextNavigation, navigationGroup } from '../src/components/navigation/navigation';
import { useShellStore } from '../src/stores/shell';

describe('approved contextual navigation', () => {
  it('does not repeat unrelated destinations or expose an unavailable sound entry', () => {
    expect(contextNavigation('scene', true).map(i => i.name)).toEqual(['scene', 'focus', 'sound']);
    expect(contextNavigation('focus', false).map(i => i.name)).toEqual(['scene', 'focus']);
    expect(contextNavigation('chat', true).map(i => i.name)).toEqual(['feed', 'chat']);
    expect(contextNavigation('entertainment', true)).toEqual([]);
    expect(contextNavigation('profile', true)).toEqual([]);
    expect(navigationGroup('admin')).toBe('account');
  });
});

describe('appearance preferences', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });
    setActivePinia(createPinia());
  });
  it('honors live system reductions even when the app preference is disabled', () => {
    const shell = useShellStore();
    expect(shell.motionReduced).toBe(false);
    shell.systemReducedMotion = true;
    expect(shell.motionReduced).toBe(true);
    shell.systemReducedTransparency = true;
    expect(shell.transparencyReduced).toBe(true);
    shell.systemReducedMotion = false;
    shell.systemReducedTransparency = false;
    shell.updatePreference('lowPerformance', true);
    expect(shell.motionReduced).toBe(true);
    expect(shell.transparencyReduced).toBe(true);
  });
  it('does not report a saved preference when storage rejects it', () => {
    const shell = useShellStore();
    vi.mocked(localStorage.setItem).mockImplementationOnce(() => { throw new Error('unavailable'); });
    expect(() => shell.updatePreference('compact', true)).toThrow('unavailable');
    expect(shell.preferences.compact).toBe(false);
  });
  it('does not latch the initial OS motion setting into the user preference', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    const shell = useShellStore();
    expect(shell.preferences.reducedMotion).toBe(false);
    expect(shell.motionReduced).toBe(true);
    shell.updatePreference('compact', true);
    expect(JSON.parse(vi.mocked(localStorage.setItem).mock.calls[0]![1]).reducedMotion).toBe(false);
    shell.systemReducedMotion = false;
    expect(shell.motionReduced).toBe(false);
  });
});
