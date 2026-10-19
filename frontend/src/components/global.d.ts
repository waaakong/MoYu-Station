export {};
declare module 'vue' {
  export interface GlobalComponents {
    AppSelect: typeof import('./controls/AppSelect.vue')['default'];
    AppIcon: typeof import('./icons/AppIcon.vue')['default'];
    BrandMark: typeof import('./icons/BrandMark.vue')['default'];
  }
}
