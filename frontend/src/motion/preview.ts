import { createApp } from 'vue';
import { createPinia } from 'pinia';
import MotionPreview from './MotionPreview.vue';
import AppSelect from '../components/controls/AppSelect.vue';
import AppIcon from '../components/icons/AppIcon.vue';
import '../styles/base.css';

// The development server serves this secondary entry; release builds use index.html.
if (import.meta.env.DEV) createApp(MotionPreview).use(createPinia()).component('AppSelect', AppSelect).component('AppIcon', AppIcon).mount('#app');
