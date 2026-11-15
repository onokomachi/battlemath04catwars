import type React from 'react';

/** アプリの解答画面を SANMON に出すときに渡すもの */
export interface AppRoundProps {
  /** 出すレベル（そのアプリの skill_id） */
  level: string;
  /** さいごまで解けたとき（perfect＝一度もまちがえなかった） */
  onResult: (perfect: boolean) => void;
  /** まちがえたとき（SANMON では1回目のまちがいで その問題は×） */
  onMiss: () => void;
}

export interface AppRoundDef {
  /** このラウンドで出すレベル（アプリの skill_id）。出すたびに1つ選ぶ */
  levels: string[];
  Round: React.FC<AppRoundProps>;
  /** 問題だけを作る（検査用: scripts/verify-app-rounds.mjs が すべてのレベルで作れるかを確かめる） */
  make?: (level: string) => unknown;
}
