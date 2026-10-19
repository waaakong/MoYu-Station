import { createApp } from "vue";
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import AppSelect from './components/controls/AppSelect.vue';
import AppIcon from './components/icons/AppIcon.vue';
import BrandMark from './components/icons/BrandMark.vue';
import { motionNavigation } from './motion/navigation';
import { motionContent } from './motion/content';
import "./styles/base.css";

const app = createApp(App)
  .directive('motion-nav', motionNavigation)
  .directive('motion-content', motionContent)
  .component('AppSelect', AppSelect)
  .component('AppIcon', AppIcon)
  .component('BrandMark', BrandMark)
  .use(createPinia())
  .use(router)
  .use(ElementPlus);
app.config.errorHandler = (_error, _instance, info) => {
  window.moyuStartupOverlay?.fail('启动界面遇到错误');
  console.error('墨屿界面运行异常：', info);
};
router.onError(() => window.moyuStartupOverlay?.fail('初始页面加载失败'));
app.mount("#app");
