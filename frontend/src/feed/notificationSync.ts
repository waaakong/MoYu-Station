export type FeedNotice = { key: string; postId: string; createdAt: string; [key: string]: unknown };
type Dependencies = {
  fetch: () => Promise<FeedNotice[]>;
  update: (items: FeedNotice[]) => void;
  error: (message: string) => void;
};
function valid(value: FeedNotice) { return typeof value?.key === 'string' && value.key.length > 0 && value.key.length <= 200 && typeof value.postId === 'string'; }
function merge(items: FeedNotice[]) {
  const unique = new Map<string, FeedNotice>();
  for (const item of items) if (valid(item) && !unique.has(item.key)) unique.set(item.key, item);
  return [...unique.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.key.localeCompare(a.key)).slice(0, 30);
}

/** Events received during a fetch survive its snapshot; old cached events do not survive forever. */
export class FeedNotificationSync {
  private active = false;
  private request = 0;
  private sequence = 0;
  private events: Array<{ sequence: number; notice: FeedNotice }> = [];
  private items: FeedNotice[] = [];
  constructor(private readonly deps: Dependencies) {}
  start() { this.active = true; }
  stop() { this.active = false; this.request++; this.events = []; }
  receive(notice: FeedNotice) {
    if (!this.active || !valid(notice)) return;
    this.events.push({ sequence: ++this.sequence, notice });
    this.events = this.events.slice(-200);
    this.items = merge([notice, ...this.items]);
    this.deps.update(this.items);
  }
  async refresh() {
    if (!this.active) return;
    const request = ++this.request, sequence = this.sequence;
    this.deps.error('');
    try {
      const rows = await this.deps.fetch();
      if (!this.active || request !== this.request) return;
      if (!Array.isArray(rows) || rows.some(row => !valid(row))) throw new Error('互动通知响应无效。');
      this.items = merge([...this.events.filter(event => event.sequence > sequence).map(event => event.notice), ...rows]);
      this.events = this.events.filter(event => event.sequence > sequence);
      this.deps.update(this.items);
    } catch (error) {
      if (this.active && request === this.request) this.deps.error(error instanceof Error ? error.message : '互动通知加载失败，请重试。');
    }
  }
}
