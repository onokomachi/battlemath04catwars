/**
 * 体験のタブ（SOL の体験の入口から #trial 付きで開いた）を Node で つくる（scripts/portalTrialTest.ts 用）。
 * いちばん先に import すること（kit の isTrial は はじめて呼ばれたときの URL を覚える）。
 * 学級コードが入っていない端末（おためしの端末）として始める。
 */
import { MemStorage } from './memStorage';

const g = globalThis as unknown as Record<string, unknown>;
g.sessionStorage = new MemStorage();
g.location = {
  hash: '#trial', origin: 'https://battlemath04catwars.vercel.app', pathname: '/', search: '',
  reload: () => { (g.__reloads as number) = ((g.__reloads as number) ?? 0) + 1; },
};
g.history = { replaceState: (_a: unknown, _b: string, url: string) => { (g.location as { hash: string }).hash = url.includes('#') ? url.slice(url.indexOf('#')) : ''; } };
