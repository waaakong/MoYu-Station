import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { compileStyle, parse } from '@vue/compiler-sfc';

describe('scoped appearance selectors', () => {
  it('does not accidentally apply a child rule to the application root', () => {
    // Vue consumes a leading partial :global() including the trailing selector.
    // Guard the actual generated CSS, not just the hand-written selector.
    for (const path of [
      'pages/ChatPage.vue','pages/FeedPage.vue','components/navigation/AppRail.vue',
      'components/drawers/ContextDrawerHost.vue','components/window/AppTitlebar.vue',
      'components/window/DesktopWindowHost.vue','components/focus/QuickFocus.vue',
      'pages/focus/FocusTimerCard.vue','pages/SoundPage.vue'
    ]) {
      const source = readFileSync(new URL(`../src/${path}`,import.meta.url),'utf8');
      const { descriptor } = parse(source);
      for (const style of descriptor.styles.filter(style=>style.scoped)) {
        const compiled = compileStyle({source:style.content,filename:path,id:'data-v-test',scoped:true});
        expect(compiled.errors, path).toEqual([]);
        expect(compiled.code, path).not.toMatch(/(?:^|})\s*\.(?:desktop-shell|sr-reduced-motion|sr-reduced-transparency|sr-low-performance)\s*\{/m);
      }
    }
  });
});
