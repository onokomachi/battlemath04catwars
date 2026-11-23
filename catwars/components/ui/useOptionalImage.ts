import { useEffect, useState } from 'react';

/**
 * 「あれば出す」絵（背景・エンブレム・カプセルの機械）の読みこみ。
 * 絵は 持ち主が あとから 足す。無いときは null（呼ぶ側は 絵なしで きれいに出る）。
 * 同じ URL は 1回だけ しらべる（画面を かえるたびに 通信しない）。
 */
const result = new Map<string, boolean>();
const pending = new Map<string, Promise<boolean>>();

function probe(url: string): Promise<boolean> {
  const done = result.get(url);
  if (done !== undefined) return Promise.resolve(done);
  let p = pending.get(url);
  if (!p) {
    p = new Promise<boolean>((resolve) => {
      const im = new Image();
      im.onload = () => { result.set(url, true); resolve(true); };
      im.onerror = () => { result.set(url, false); resolve(false); };
      im.src = url;
    });
    pending.set(url, p);
  }
  return p;
}

/** 並べた URL のうち 最初に 読めたもの（なければ null）。順番は 優先の高い方から */
function firstKnown(urls: string[]): string | null | undefined {
  for (const u of urls) {
    const r = result.get(u);
    if (r === true) return u;
    if (r === undefined) return undefined;   // まだ しらべていない
  }
  return null;
}

export function useOptionalImage(urls: string[]): string | null {
  const key = urls.join('|');
  const [found, setFound] = useState<string | null>(() => firstKnown(urls) ?? null);
  useEffect(() => {
    let alive = true;
    (async () => {
      for (const u of urls) {
        if (await probe(u)) { if (alive) setFound(u); return; }
      }
      if (alive) setFound(null);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return found;
}
