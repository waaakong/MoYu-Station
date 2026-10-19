import { chatMemory } from "../chat/chatMemory";
import { pendingStickers } from "../chat/stickerOutbox";
import { feedSession } from "../feed/session";
import { sessionMediaDrafts } from "../media/sessionDrafts";
import { privateScene } from "../scenes/privateSession";
import { useFocusStore } from "../stores/focus";
import { useQueueStore } from "../stores/queue";
import { useSoundStore } from "../stores/sound";
import { useEntertainmentStore } from "../stores/entertainment";

const savers = new Set<() => Promise<void>>();
export function registerQuitSaver(save: () => Promise<void>) {
  savers.add(save);
  return () => { savers.delete(save); };
}
export function hasVolatileWork(): boolean {
  return Boolean(chatMemory.hallDraft || Object.values(chatMemory.privateDrafts).some(Boolean)
    || chatMemory.pending.length || pendingStickers.length || feedSession.draft.content
    || feedSession.draft.images.length || feedSession.publishing || feedSession.textUnknown
    || Object.values(feedSession.commentDrafts).some(Boolean)
    || privateScene.uploads.length || privateScene.pending || privateScene.busy
    || (privateScene.draft && JSON.stringify(privateScene.draft) !== JSON.stringify(privateScene.saved?.config))
    || [...sessionMediaDrafts.values()].some(d => d.snapshot().items.length || d.snapshot().locked));
}
/** Never sends messages, publishes drafts or initiates a cloud sync. */
export async function prepareLocalQuit(): Promise<void> {
  const focus = useFocusStore(), queue = useQueueStore(), sound = useSoundStore(), games = useEntertainmentStore();
  if (focus.operationPending || queue.persisting || sound.persisting) throw new Error("本机数据正在保存，请稍后重试。");
  if (focus.persistenceError) throw new Error("专注记录尚未保存，请处理页面错误后重试。");
  await Promise.all([...savers].map(save => save()));
  if (games.initialized) {
    await games.flush();
    if (games.errorCode) throw new Error("游戏存档未保存，请返回游戏检查。");
  }
  if (sound.initialized) {
    await sound.persist();
    if (sound.errorCode) throw new Error("声音设置未保存，请重试。");
  }
  if (queue.hydrated) await queue.persist();
  // Pause only after all other saves succeed. A running timer must not count time after exit.
  if (focus.timerState === "running") focus.pause();
  else focus.persistSession();
}
