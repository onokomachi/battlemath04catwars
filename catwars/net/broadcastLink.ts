/**
 * 同時対戦の 合図（CW-6c・2026-11-17）：Supabase Realtime の Broadcast（SANMON のクラス対戦と同じ しくみ）。
 *
 * - 部屋の名前（channel）は サーバが へやを作るとき 作る 推測できない文字列。同じ部屋に 入れた 2人だけが 知っている（番号・名前は のっていない）。
 * - 流れる中身は versus/match.ts の Msg だけ（ping・go・sv・pl・sm・by）。**番号・名前・勝ち負けの数は 流さない**。
 * - 大きなものは 動的に 読みこむ（対戦に 入るまで @supabase/realtime-js は 読まない）。
 * - 試験・開発では factory を 差しかえる（__setLinkFactory）。本物の サーバには つながない。
 *
 * ※ 古い net/transport.ts の Transport（tick ごとの バケット）は 使わない：対戦は ラウンド制で、交換するのは ラウンドごとの
 *   「おきかた」と「結果の 要約」だけ（速さを 報酬にしないため ずっと 動きつづける 対戦に しない。docs/REBUILD_SPEC.md §5c）。
 */
import { PORTAL } from '../portal/config';
import type { Msg } from '../versus/match';

export type LinkStatus = 'connecting' | 'open' | 'closed';
export interface LinkHandle {
  send(m: Msg): void;
  close(): void;
  status(): LinkStatus;
}
export type LinkFactory = (channel: string, onMsg: (m: unknown) => void, onStatus?: (s: LinkStatus) => void) => LinkHandle;

const EVENT = 'm';

const realFactory: LinkFactory = (channel, onMsg, onStatus) => {
  let status: LinkStatus = 'connecting';
  let closed = false;
  const queue: Msg[] = [];
  let ch: { send: (a: { type: 'broadcast'; event: string; payload: unknown }) => unknown } | null = null;
  let leave: (() => void) | null = null;
  const setStatus = (s: LinkStatus) => { status = s; onStatus?.(s); };

  void (async () => {
    const { supabaseUrl, supabaseKey } = PORTAL;
    if (!supabaseUrl || !supabaseKey) { setStatus('closed'); return; }
    try {
      const { RealtimeClient } = await import('@supabase/realtime-js');
      if (closed) return;
      const rt = new RealtimeClient(`${supabaseUrl.replace(/^http/, 'ws')}/realtime/v1`, { params: { apikey: supabaseKey } });
      const c = rt.channel(`cw-vs-${channel}`, { config: { broadcast: { self: false } } });
      c.on('broadcast', { event: EVENT }, (p: { payload?: unknown }) => onMsg(p?.payload));
      c.subscribe((s: string) => {
        if (s === 'SUBSCRIBED') {
          ch = c; setStatus('open');
          while (queue.length) c.send({ type: 'broadcast', event: EVENT, payload: queue.shift() });
        } else if (s === 'CLOSED' || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
          if (!closed) setStatus('closed');
        }
      });
      leave = () => { void rt.removeChannel(c); };
      if (closed) leave();
    } catch {
      setStatus('closed');
    }
  })();

  return {
    send(m) { if (closed) return; if (ch) void ch.send({ type: 'broadcast', event: EVENT, payload: m }); else queue.push(m); },
    close() { closed = true; leave?.(); leave = null; setStatus('closed'); },
    status: () => status,
  };
};

let factory: LinkFactory = realFactory;
/** 試験・開発の差しかえ（null で もとにもどす） */
export function __setLinkFactory(f: LinkFactory | null): void { factory = f ?? realFactory; }
export function openLink(channel: string, onMsg: (m: unknown) => void, onStatus?: (s: LinkStatus) => void): LinkHandle {
  return factory(channel, onMsg, onStatus);
}
