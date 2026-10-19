export type NavigationGroup = 'space' | 'community' | 'relax' | 'account';
export interface NavigationItem { name: string; label: string }
export function navigationGroup(routeName: unknown): NavigationGroup {
  if (['chat', 'feed'].includes(String(routeName))) return 'community';
  if (routeName === 'entertainment') return 'relax';
  if (['profile', 'admin'].includes(String(routeName))) return 'account';
  return 'space';
}
export function contextNavigation(routeName: unknown, soundEnabled: boolean): NavigationItem[] {
  switch (navigationGroup(routeName)) {
    case 'space': return [{ name: 'scene', label: '场景' }, { name: 'focus', label: '专注' }, ...(soundEnabled ? [{ name: 'sound', label: '声音' }] : [])];
    case 'community': return [{ name: 'feed', label: '动态' }, { name: 'chat', label: '聊天' }];
    default: return [];
  }
}
