import { reactive } from 'vue';
import type { MessageNotice } from './messagePolicy';

export const messageNotices = reactive({
  activePeer: null as string | null,
  notice: null as MessageNotice | null,
  unread: 0,
  error: '',
  open: (_peer: string | null) => {},
  retry: () => {}
});
