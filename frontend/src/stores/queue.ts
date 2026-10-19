import type { QueueItem, Track } from "@studyroom/contracts";
import { defineStore } from "pinia";
import { insertAfterCurrent, moveQueueItem, removeQueueItem } from "../audio/core/queue";

const WEB_QUEUE_KEY = "studyroom-web-queue-v2";
const writes = new WeakMap<object, { tail: Promise<void>; pending: number; saved: QueueItem[] }>();

export function persistentWebQueue(items: QueueItem[]): QueueItem[] {
  return items.filter(({ track }) => !(
    track.source.kind === "builtin" && track.source.assetId.startsWith("blob:")
  ));
}

function readWebQueue(): QueueItem[] {
  try {
    const queue = JSON.parse(localStorage.getItem(WEB_QUEUE_KEY) || "[]");
    return Array.isArray(queue) ? persistentWebQueue(queue.slice(0, 10_000)) : [];
  } catch {
    return [];
  }
}

export const useQueueStore = defineStore("queue", {
  state: () => ({ items: [] as QueueItem[], hydrated: false, persisting: false, revision: 0 }),
  actions: {
    async updateArtwork(track:Track,artworkUrl:string){
      if(!this.items.some(item=>item.track===track))return;
      await this.commit(this.items.map(item=>item.track===track?{...item,track:{...track,artworkUrl}}:item));
    },
    async hydrate() {
      if (this.hydrated) return;
      const revision = this.revision;
      const items = window.studyRoomDesktop ? await window.studyRoomDesktop.readQueue() : readWebQueue();
      if (revision !== this.revision) return;
      this.items = items;
      this.revision += 1;
      this.hydrated = true;
    },
    async replace(items: QueueItem[]) {
      if (items.length > 10_000) throw new Error("QUEUE_LIMIT_EXCEEDED");
      await this.commit([...items]);
    },
    async insertNext(item: QueueItem, currentItemId?: string) {
      await this.commit(insertAfterCurrent(this.items, currentItemId, item));
    },
    async move(from: number, to: number) {
      await this.commit(moveQueueItem(this.items, from, to));
    },
    async remove(itemId: string) {
      await this.commit(removeQueueItem(this.items, itemId));
    },
    async clear() {
      await this.commit([]);
    },
    async commit(items: QueueItem[]) {
      if (items.length > 10_000) throw new Error("QUEUE_LIMIT_EXCEEDED");
      if (!writes.has(this)) writes.set(this, { tail: Promise.resolve(), pending: 0, saved: [...this.items] });
      this.items = items;
      this.hydrated = true;
      this.revision += 1;
      await this.persist();
    },
    async persist() {
      let state = writes.get(this);
      if (!state) {
        state = { tail: Promise.resolve(), pending: 0, saved: [...this.items] };
        writes.set(this, state);
      }
      const snapshot = JSON.parse(JSON.stringify(this.items)) as QueueItem[];
      const revision = this.revision;
      state.pending += 1;
      this.persisting = true;
      const writer = state;
      const operation = writer.tail.then(async () => {
        if (window.studyRoomDesktop) await window.studyRoomDesktop.replaceQueue(snapshot);
        else localStorage.setItem(WEB_QUEUE_KEY, JSON.stringify(persistentWebQueue(snapshot)));
        writer.saved = snapshot;
      });
      writer.tail = operation.catch(() => undefined);
      try {
        await operation;
      } catch (error) {
        if (this.revision === revision) {
          this.items = [...writer.saved];
          this.revision += 1;
        }
        throw error;
      } finally {
        writer.pending -= 1;
        this.persisting = writer.pending > 0;
      }
    }
  }
});
