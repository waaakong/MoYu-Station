import type { InjectionKey } from 'vue';

// A shell owns one continuous scene; standalone pages retain their own fallback.
export const shellBackdropKey: InjectionKey<boolean> = Symbol('shell-scene-backdrop');
