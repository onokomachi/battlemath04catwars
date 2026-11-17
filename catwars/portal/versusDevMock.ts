/**
 * 開発のときだけ（本番のビルドには入らない）：同時対戦の 画面の確かめ（Playwright）で、サーバと 合図を 差しかえる。
 *   window.__cwVersusMock({ student: 'a' })
 *   - へやの サーバ関数は window.__vsRpc(fn, body)（Playwright の exposeFunction。Node の 偽の サーバが こたえる）
 *   - 合図は window.__vsSend(channel, msg) で 送り、相手の ページの window.__vsDeliver(channel, msg) へ とどく（Node が なかだち）
 * **本物の サーバ・本物の Realtime には つながない。**
 */
import { __setVersusRpc } from './versusSync';
import { __setLinkFactory } from '../net/broadcastLink';

type W = Window & {
  __cwVersusMock?: (o: { student?: string }) => void;
  __vsRpc?: (fn: string, body: Record<string, unknown>) => Promise<unknown>;
  __vsSend?: (channel: string, m: unknown) => void;
  __vsDeliver?: (channel: string, m: unknown) => void;
};
const w = window as W;
w.__cwVersusMock = (o) => {
  __setVersusRpc(async (fn, body) => (await w.__vsRpc!(fn, body)) as never, () => o.student ?? 'dev-student');
  const subs = new Map<string, (m: unknown) => void>();
  w.__vsDeliver = (channel, m) => { subs.get(channel)?.(m); };
  __setLinkFactory((channel, onMsg, onStatus) => {
    subs.set(channel, onMsg);
    setTimeout(() => onStatus?.('open'), 0);
    return {
      send: (m) => { w.__vsSend?.(channel, JSON.parse(JSON.stringify(m))); },
      close: () => { subs.delete(channel); },
      status: () => 'open',
    };
  });
};
