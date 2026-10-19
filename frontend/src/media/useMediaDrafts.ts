import { computed } from "vue";
import { sessionMediaDrafts as drafts, mediaDraftRevision as revision } from './sessionDrafts';
import { useAuthStore } from "../stores/auth";
import { featureFlags } from "../config/features";
import { MediaApi, createMediaUploadDependencies } from "./mediaApi";
import { MediaDraft } from "./mediaDraft";
import { prepareCandidateForUpload } from "./prepareCandidate";
import type { UploadTarget } from "./imageUploadQueue";

export function useMediaDrafts() {
  const auth = useAuthStore();
  const stamp = () => auth.user && !auth.authTransition && !auth.isBanned
    ? { accountId: String(auth.user.id), generation: auth.sessionGeneration } : null;
  const key = (target: UploadTarget) => target.kind === "private" ? `private:${target.recipientId}` : target.kind;
  const find = (target: UploadTarget) => { revision.value; return drafts.get(key(target)); };
  return {
    enabled: featureFlags.mediaAssets,
    hasDraft: computed(() => { revision.value; return [...drafts.values()].some(draft => draft.snapshot().items.length > 0); }),
    find,
    get(target: UploadTarget) {
      if (!featureFlags.mediaAssets) throw new Error("图片上传暂未启用，文字发送和历史图片查看仍可使用。");
      const session = stamp(); if (!session) throw new Error("请先登录。");
      if (auth.userRole === "MUTED") throw new Error("禁言期间不能上传或发布图片。");
      let draft = drafts.get(key(target));
      if (!draft) {
        for (const [draftKey, empty] of drafts) {
          const snapshot = empty.snapshot();
          if (!snapshot.items.length && snapshot.state === 'editing') { empty.dispose(); drafts.delete(draftKey); }
        }
        if (drafts.size >= 10) throw new Error("同时最多保留10个图片草稿，请先清除一个。");
        const api = new MediaApi(session, stamp);
        draft = new MediaDraft(api, { accountId: session.accountId, target }, {
          ...createMediaUploadDependencies(api, prepareCandidateForUpload), previewAfterPrepare: true
        });
        draft.subscribe(() => { revision.value++; }); drafts.set(key(target), draft); revision.value++;
      }
      return draft;
    },
    reset(target: UploadTarget) { drafts.get(key(target))?.dispose(); drafts.delete(key(target)); revision.value++; },
    snapshot(target: UploadTarget) { return find(target)?.snapshot() ?? { items: [], state: "editing", locked: false, completed: 0, total: 0 }; }
  };
}
