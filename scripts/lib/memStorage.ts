/**
 * 試験用の localStorage／window の かわり（Node で ストアと kit を読むため）。
 * いちばん先に import すること（ESM は import の順に評価されるので、ストアが localStorage を読む前に入る）。
 */
export class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  keys() { return [...this.m.keys()]; }
}
const g = globalThis as unknown as { localStorage?: MemStorage; window?: unknown };
g.localStorage ??= new MemStorage();
// zustand の persist は window.localStorage を見る（無いと persist が つかない）
g.window ??= globalThis;
export const memLocal = g.localStorage;
