import { parseSceneCacheRecord, type SceneCacheRecord } from '@studyroom/contracts';

type Row = { epoch: number; record: SceneCacheRecord | null };
/** One record per account; revocation and replacement are atomic IDB transactions. */
export class WebSceneCache {
  private connection?: Promise<IDBDatabase>;
  constructor(private factory: IDBFactory = indexedDB) {}
  private db() {
    if (!this.connection) {
      this.connection = new Promise<IDBDatabase>((resolve, reject) => {
        const request = this.factory.open('studyroom-private-scenes-v1', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('accounts');
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('私人缓存被另一窗口占用'));
        request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); this.connection = undefined; }; resolve(db); };
      });
      void this.connection.catch(() => { this.connection = undefined; });
    }
    return this.connection;
  }
  private async transact<T>(owner: string, action: (row: Row, save: (value: Row) => void) => T): Promise<T> {
    if (!/^[1-9][0-9]{0,18}$/.test(owner)) throw new Error('私人缓存账号无效');
    const db = await this.db();
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction('accounts', 'readwrite'), store = transaction.objectStore('accounts');
      const request = store.get(owner); let result: T, failure: unknown;
      request.onsuccess = () => {
        try { result = action(request.result || { epoch: 0, record: null }, row => store.put(row, owner)); }
        catch (error) { failure = error; transaction.abort(); }
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = transaction.onerror = () => reject(failure || transaction.error || new Error('私人缓存操作失败'));
    });
  }
  read(owner: string) { return this.transact(owner, row => ({ epoch: row.epoch, record: row.record ? parseSceneCacheRecord(row.record) : null })); }
  write(owner: string, epoch: number, record: SceneCacheRecord, current: () => boolean) {
    const clean = parseSceneCacheRecord(record);
    return this.transact(owner, (row, save) => {
      if (!current() || row.epoch !== epoch) throw new Error('私人缓存会话已失效');
      if (row.record && row.record.snapshot.version > clean.snapshot.version) throw new Error('拒绝过期场景缓存');
      save({ epoch, record: clean });
    });
  }
  clear(owner: string) { return this.transact(owner, (row, save) => save({ epoch: row.epoch + 1, record: null })); }
}
