# CW-5b サーバ側の下書き（提案。**まだ何も流していない**）

> **2026-11-16：第1段（kit 0.36.0 `df7ec52`・PRISM の SQL ファイル `supabase/sql/2026-11-16-catwars-*.sql`）・第2段（CAT-WARS：鍵 `catwars`・記録の送信・セーブの push/pull・mastery を消す）で実装ずみ／持ち主が SQL を流すのを待っている。** いまの しくみは `docs/PORTAL.md`。

CW-5a（端末の側だけ・2026-11-16）のつづき。サーバ（Supabase `gakkyu-portal`）・kit・PRISM に入れるもの。
**このあと点検の担当が計画してから、全体セッション（kit・PRISM・SANMON・SOL・CAT-WARS を つないだセッション）で行う。**
ここの SQL は下書き。流す前に、いまの定義を `pg_get_functiondef` で読みなおして 差分をとる（下書きを書いた時点の定義は、ファイルの名前を書いた SQL）。

## 0. 持ち主が決めたこと（2026-11-16）
1. 戦闘の中で解いた問題は **学習の記録として送る**（データとして確かにするため）。**スタミナが二重にたまらない・「戦闘→スタミナ→戦闘」の輪にならない形**にする。
2. **CAT-WARS 専用の開け閉めのスイッチを PRISM に足す**（学級ごと・平日モードの対象にも入れる・番号ごとの停止も効く）。
3. 組みこみは CW-5b で、点検の担当が計画してから。

## 1. いまの しくみ（調べたこと）
- `sanmon_spend(p_student_id, p_event_id, p_amount, p_reason)`（SANMON `supabase-sql/2026-11-11-sanmon-town-cost.sql`）
  - `v_base := split_part(reason,'@',1)`、`v_town := split_part(reason,'@',2)`。
  - モード：`v_key := case v_base when 'speed_duel' then 'speed' when 'monster_duel' then 'monster' else 'adventure' end` → **いまの `catwars@町` は ぼうけんの鍵で確かめられる**。閉じていれば `raise exception 'MODE_CLOSED: …'`（kit は stamina=null で返す）。
  - 数：`v_key='adventure'` で町があり `sanmon_town_skill` に その町の行があれば `_sanmon_town_cost`（2〜5。アプリの無い町は 3）。**送った数は使わない**。
  - 同じ `event_id` は2回目から `duplicate` で ok（二重に引かない）。
- `_sanmon_pools`（SANMON `2026-11-11-sanmon-noapp-towns.sql`）：スタミナに数える `learning_event` は
  `app_id <> 'sanmon' and (ts < bal_cut or app_id in (apps where grade=4 and subject='算数'))`、
  または `app_id='sanmon'` で 町が bignum/graph/angle かつ label が「れんしゅう：」「ふくしゅう：」。
  → **SANMON は「バトルの中の答え」を app_id='sanmon' ＋ label「バトル：」で見分けて 数えない**（label の しるし と app_id の両方）。熟達ボーナス（+2）も同じ `ev` から数えるので 入らない。
- `sync_events`（PRISM `supabase/sql/2026-11-15-learning-miss-types.sql`）
  - `apps` に無い app_id は `raise exception '未登録の app_id です'` → **送るには `apps` に `catwars` の行が要る**。
  - **`detail` が object の行は 本番テストとして `test_result` に入る**（`kind='trial'` は `trial_result`）→ 戦闘の答えに detail を付けない（CW-5a の `buildPortalLog` は付けていない）。
  - トリガーで `learning_daily`（児童×日×app_id×skill_id）・`learning_device`・`learning_miss_daily` に足す。
- `_closed_apps(class)`：`not coalesce(class_app_access.open, apps.default_open)` → `app_open_for` が false → kit の `AppAccessGate` が 名乗った子を止める。
  **SOL タブ（`class_app_access_list`）は `subject <> 'ゲーム'` だけ出す**＝ゲームは SOL タブでは開けられない。
  → **`apps` に `catwars` を `default_open = false`・`subject='ゲーム'` で足すと、どの学級でも 名乗った子が CAT-WARS に入れなくなる（先生が開ける画面が無い）。**
- SOL の単元の一覧は kit のカタログ（`CATALOGS`）から作る。`apps` に足しても カタログに無ければ SOL には出ない（いまの読み方。点検で確かめる）。
- モード：`sanmon_mode_settings(class_id, modes jsonb, school_hours jsonb, open_until)`。`_sanmon_effective_modes`（PRISM `2026-10-26-sanmon-school-hours.sql`）、
  子どもは `sanmon_modes`（`2026-11-09-sanmon-student-lock.sql`：止められた子は ゲームの4つを false＋`_student_lock`）。
  `set_sanmon_school_hours` は `p_modes <@ array['adventure','speed','monster','class_duel']`、`sanmon_lock_hit` も同じ4つだけ受ける。
  kit の `isModeOpen` は **書いていない鍵＝開いている**。PRISM は `components/SanmonModes.tsx`（`SANMON_MODES` を並べる）・`SchoolHours.tsx`（`SCHOOL_HOURS_MODES`）・`StudentLocks.tsx`。
- 書き出し：`_export_tables()`（最新は PRISM `2026-11-15-export-miss-table.sql`）。

## 2. 開け閉めのスイッチ（鍵 `catwars`）

### 案A（おすすめ）：kit の `SANMON_MODES` に `catwars` を足す
- kit `src/sanmon/index.ts`
  - `SANMON_MODES` に `{ key: 'catwars', label: 'CAT-WARS', desc: 'ネコ軍団の タワーディフェンス（問題を といて ⚡）' }`。
  - `SCHOOL_HOURS_MODES` に `'catwars'`（平日モードの対象に入る。はじめの値 `SCHOOL_HOURS_DEFAULT.modes` にも入る）。
  - **はじめは閉じている**：`export const SANMON_MODES_DEFAULT_CLOSED = ['catwars'] as const` を足し、
    `isModeOpen(modes, key)` を `modes?.[key] ?? !DEFAULT_CLOSED.includes(key)` に（`!== false` から変える。既存の鍵は今までどおり）。
    サーバも はじめ false を返す（下）ので、古い kit のアプリでも閉じて見える。
  - sanmon.test.ts：`isModeOpen({}, 'catwars') === false`・`isModeOpen({catwars:true},'catwars')`・既存の鍵は `{}` で開く。
  - 版を上げる（0.36.0）。**ほかのアプリへの影響**：SANMON は `SANMON_MODES` を並べていない（`App.tsx` は鍵を名前で使うだけ）＝影響なし。PRISM は SANMON タブの一覧と平日モードの選択に「CAT-WARS」が ふえる。SOL は使っていない。
- サーバ（PRISM の `supabase/sql/2026-11-xx-catwars-mode.sql`。下書き）
```sql
-- 1) いま効いているモード：catwars は 書いていなければ 閉じている
create or replace function public._sanmon_effective_modes(p_class_id uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare
  r public.sanmon_mode_settings%rowtype;
  sh jsonb; lst jsonb; st time; en time; active boolean;
  jst timestamp := now() at time zone 'Asia/Tokyo';
  out jsonb; k text; base jsonb;
begin
  select * into r from public.sanmon_mode_settings where class_id = p_class_id;
  if not found then return '{"catwars": false}'::jsonb; end if;
  base := '{"catwars": false}'::jsonb || coalesce(r.modes, '{}'::jsonb);
  sh := coalesce(r.school_hours, '{}'::jsonb);
  if coalesce((sh->>'enabled')::boolean, false) is not true then return base; end if;
  st := coalesce(sh->>'start', '08:00')::time;
  en := coalesce(sh->>'end', '15:30')::time;
  lst := coalesce(sh->'modes', '["adventure","speed","monster","class_duel","catwars"]'::jsonb);
  active := extract(isodow from jst) < 6
    and not exists (select 1 from public.jp_holiday h where h.day = jst::date)
    and jst::time >= st and jst::time < en
    and (r.open_until is null or now() >= r.open_until);
  out := base;
  if active then
    for k in select jsonb_array_elements_text(lst) loop out := out || jsonb_build_object(k, false); end loop;
  end if;
  return out || jsonb_build_object('_school_hours', jsonb_build_object(
    'enabled', true, 'active', active, 'start', to_char(st, 'HH24:MI'), 'end', to_char(en, 'HH24:MI'),
    'modes', lst, 'open_until', case when r.open_until > now() then r.open_until end, 'base', base));
end $$;
revoke all on function public._sanmon_effective_modes(uuid) from public, anon, authenticated;

-- 2) 番号ごとの停止：ゲームの5つ
create or replace function public.sanmon_modes(p_student_id uuid)
returns jsonb language sql stable security definer set search_path to '' as $$
  select case when public._sanmon_student_locked(p_student_id)
    then m || '{"adventure": false, "speed": false, "monster": false, "class_duel": false, "catwars": false, "_student_lock": true}'::jsonb
    else m end
  from (select coalesce((select public._sanmon_effective_modes(s.class_id) from public.students s where s.id = p_student_id), '{"catwars": false}'::jsonb) as m) x
$$;

-- 3) 平日モードの対象・押した回数：'catwars' を受ける
--    set_sanmon_school_hours の  p_modes <@ array['adventure','speed','monster','class_duel']  に 'catwars' を足す
--    sanmon_lock_hit の          p_mode not in ('adventure','speed','monster','class_duel')  に 'catwars' を足す
--    （どちらも いまの定義を pg_get_functiondef で読んで、その1行だけ変えて create or replace）

-- 4) スタミナ：reason の 'catwars' を catwars の鍵で確かめる。数は ぼうけんと同じ（町の達成度）
--    sanmon_spend の 2行だけ変える（いまの定義は SANMON 2026-11-11-sanmon-town-cost.sql）：
--      v_key text := case v_base when 'speed_duel' then 'speed' when 'monster_duel' then 'monster' when 'catwars' then 'catwars' else 'adventure' end;
--      if v_key in ('adventure', 'catwars') and v_town is not null and exists (select 1 from public.sanmon_town_skill where town = v_town) then
```
- PRISM：`SanmonModes.tsx` は kit の一覧を並べるだけなので **画面のコードは そのまま**（kit を上げると「CAT-WARS」の行が出る）。
  ただし はじめの表示が `isModeOpen` で「閉じている」になることを確かめる（kit の変更で そうなる）。
  SANMON タブの説明（`SanmonModes.tsx` の上の文）に「CAT-WARS は はじめ閉じている」を1行。`docs/SETTINGS.md` に1行。
  `StudentLocks.tsx` の説明「ゲームの4つ」→「5つ」。`SchoolHours.tsx` は `SCHOOL_HOURS_MODES` を並べるので そのまま。
- CAT-WARS：`portal/config.ts` の `CATWARS_MODE_KEY` を `'catwars'` に（1行）。平日モードの「押した回数」（`reportLockHit(PORTAL, id, 'catwars')`）を ホームの 閉じた出撃ボタンに入れる。

### 案B：CAT-WARS 用の 別の表（`catwars_mode_settings`）と 別の関数
- SANMON の しくみ と 平日モード・番号ごとの停止 を まねして持つことになり、先生の画面も2か所に分かれる。**すすめない**（同じ「ゲームの開け閉め」を2つの表で持つと、片方だけ直す事故が起きる）。

## 3. 戦闘の中の答えの記録（送る）

### 端末（CW-5a で用意ずみ）
`bridge.ts` の `buildPortalLog`：`app_id='catwars'`・`skill_id`＝単元アプリの skill_id（そのまま）・`module_id`＝町の key・`correct`＝1回目で正解か・`mistakes` 0/1・
label「たたかい：[単元アプリの app_id] 項目名」・**detail なし**・まちがいの型と答え（解答画面が わたせるとき）。
送るのは `PORTAL_SEND_ENABLED` を true にするだけ（kit の `flushEvents({ appId: 'catwars', ...PORTAL }, logs)`。おためし・体験版は送らない）。
**送れなかった分を 端末に のこす形**（SANMON は 1問ごとのログを localStorage に500件もっていて、`getSentMark` の高水位で送りなおす）を そのとき足す：
`useStudyStore` か 新しいストア（`SAVE_KEYS` に足す）に 直近500件の `LogLike` を持ち、`flushEvents` に ぜんぶ わたす（kit が 送ったところから先だけ送る）。

### 案1（おすすめ）：app_id を `catwars` にして、スタミナの数えから はずす
- `apps` に1行：`app_id='catwars'`・`title='CAT-WARS'`・`subject='ゲーム'`・`grade=4`・`url='https://<CAT-WARS の本番の URL>'`・**`default_open = true`**。
  - `default_open=false` にしない理由：上の「`_closed_apps`」。ゲームは SOL タブで開けないので、どの学級でも 名乗った子が CAT-WARS に入れなくなる。
    **「閉じて始まる」は モードの鍵 `catwars` で実現する**（§2。はじめ false・先生が SANMON タブで開ける）。
  - `subject='ゲーム'` なので `_sanmon_pools` の `g4`（`subject='算数'`）に入らない＝**戦闘の答えは スタミナにも 熟達ボーナスにも 入らない**。
  - 念のため `_sanmon_pools` の `ev` に `and le.app_id <> 'catwars'` を足す（あとで だれかが subject を「算数」に変えても 輪にならない）。
- スタミナの二重取り・輪：
  - スタミナが たまるのは 単元アプリの app_id の行と SANMON の「れんしゅう：」「ふくしゅう：」だけ。CAT-WARS の行（`catwars`・「たたかい：」）は どこにも入らない。
  - 町の解放・出撃1回の数（`_sanmon_town_cost`）・SANMON のかけら は `skill_state`／`learning_event` を 単元アプリの app_id で見る → `catwars` の行は入らない（**点検で `sanmon_status`・`_sanmon_town_cost` の定義を読んで確かめる**。`skill_state` は kit の `pushSkillState` だけが書き、CAT-WARS は送らない）。
  - CAT-WARS の かけら（サーバ）は 本番テストと実力の階段だけ → 戦闘で ふえない。
- PRISM での見え方：
  - `learning_daily` に（児童×日×`catwars`×単元アプリの skill_id）で入る。`v_student_*`・`class_skill_detail` は app_id ごとに出すので「CAT-WARS」という単元として出る。
  - 項目の名前は kit のカタログで引く → **kit に カタログ `catwars` を足す**（学年4・教科「ゲーム」。モジュール＝町（12）・項目＝その町の単元アプリの skill_id と label。`catwars/learn/gradePack.ts` の `PACK_UNITS`＋kit の CATALOGS から作る生成スクリプトを kit に）。
    足さないと PRISM の「つまずいている項目」などで skill_id が そのまま出る。
  - 学年の しぼりこみ（`lib/gradeScope.ts`）はカタログの学年で見るので、カタログ `catwars` の grade=4 で 4年に入る。
  - 単元アプリの成績（正答率）とは まざらない（app_id がちがう）。単元ごとに まとめて見たいときは module_id（町）で 単元アプリと つなげる（PRISM の画面の変更は あとで先生と相談）。
  - 「多いまちがい」：`learning_miss_daily` に `catwars` で入る（型を送れるようになってから）。
- SOL：カタログ `catwars` を足すと SOL の一覧に出るおそれがある → SOL で `subject='ゲーム'`（または app_id `catwars`）を一覧から はずす1行が要るか、点検で確かめる。**「SOL にはまだ出さない」を守る。**

### 案2：単元アプリの app_id で送り、label の「たたかい：」で見分けて はずす
- 単元アプリの成績に まざる・`_sanmon_pools`／熟達／`class_skill_detail`／`learning_daily` の すべてで はずす条件が要る（label は集計表に無い）。
  1か所でも はずしわすれると「戦闘→スタミナ→戦闘」の輪になる。**すすめない。**

### 試験（案1）
1. 試験用の SQL（最後に `raise exception` で結果を出して取り消す。知識集の patterns）：
   にせの児童に `catwars` の正解を 30行 入れる前と後で `_sanmon_pools`・`sanmon_status`・`_sanmon_town_cost` が同じ／単元アプリの正解を入れると ふえる、を確かめる。
2. 本番に流したあと：自分の学級の 試しの番号で CAT-WARS を1問 → `learning_event` に `catwars` が1行・`learning_daily` に1行・スタミナが ふえていない。
3. CAT-WARS の `npm run test:portal`（`PORTAL_SEND_ENABLED` を true にしたら [10] を直す）。

## 4. セーブ（`catwars_save`）
- 形：`sanmon_save` と同じ使い方（kit の `loadSanmonSave`／`saveSanmonSave` と同じ `*_get`／`*_put`）。中身は `portal/saveBundle.ts` の `SaveBundle`（`{ v, savedAt, stores }`）。
```sql
create table if not exists public.catwars_save (
  student_id uuid primary key references public.students(id) on delete cascade,
  data jsonb not null,
  saved_at timestamptz not null default now()
);
alter table public.catwars_save enable row level security;
-- 先生：見られる学級の子だけ読める（書きこみは しない）
drop policy if exists catwars_save_read_scoped on public.catwars_save;
create policy catwars_save_read_scoped on public.catwars_save for select to authenticated
  using (student_id in (select public.my_student_ids()));

create or replace function public.catwars_save_get(p_student_id uuid)
returns jsonb language sql stable security definer set search_path to '' as $$
  select data from public.catwars_save where student_id = p_student_id
$$;
create or replace function public.catwars_save_put(p_student_id uuid, p_data jsonb)
returns boolean language plpgsql security definer set search_path to '' as $$
begin
  if not exists (select 1 from public.students where id = p_student_id) then raise exception '未登録の student_id です'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'data が不正です'; end if;
  if octet_length(p_data::text) > 65536 then raise exception 'セーブが大きすぎます'; end if;
  insert into public.catwars_save (student_id, data, saved_at) values (p_student_id, p_data, now())
  on conflict (student_id) do update set data = excluded.data, saved_at = now();
  return true;
end $$;
revoke all on function public.catwars_save_get(uuid) from public;
revoke all on function public.catwars_save_put(uuid, jsonb) from public;
grant execute on function public.catwars_save_get(uuid), public.catwars_save_put(uuid, jsonb) to anon, authenticated;
```
  - `sanmon_save_*` と同じく 子ども（anon）が student_id で呼ぶ形（なりすましの守りは sanmon_save と同じ水準。点検で `sanmon_save_put` の いまの定義と そろえる）。
- `_export_tables()` に `'catwars_save'` を足す（最新の定義 PRISM `2026-11-15-export-miss-table.sql` の配列に1つ足して create or replace）。PRISM の `docs/BACKUP.md` に1行。
- kit：`loadCatwarsSave`／`saveCatwarsSave` を `src/sanmon/index.ts` に（`rpc('catwars_save_get'|'catwars_save_put')`）。版を上げる。
- CAT-WARS：SANMON の `pushSave`／`pullSaveIfNewer` と同じ（中身が変わったときだけ・`catwars_portal_saved_at` より新しければ取りこんで 読みなおす）。名乗っているときだけ。
- 大きさ：いまは4週間で 15.3KB（`progress.mastery` が 9.2KB。どこからも読まれていない）。**送る前に `mastery` を saveBundle から はずす（またはストアから消す）と 約6KB**。

## 5. 流す順番（全体セッション）
1. kit：`SANMON_MODES`／`SCHOOL_HOURS_MODES`／`isModeOpen` の はじめ閉じる・カタログ `catwars`・`loadCatwarsSave`／`saveCatwarsSave`・（できれば）`sanmonBattleCost`（SANMON の `utils/townCost.ts` と CAT-WARS の `portal/stamina.ts` の写しを1つに）。`npm run check` → PR → マージ。
2. サーバ（SQL Editor。持ち主が流す。各ファイル 試験用→本番 の2段）：
   a. `catwars-mode.sql`（§2：`_sanmon_effective_modes`・`sanmon_modes`・`set_sanmon_school_hours`・`sanmon_lock_hit`・`sanmon_spend`）
   b. `catwars-apps-and-save.sql`（`apps` に1行・`catwars_save`・`_export_tables`・`_sanmon_pools` に `app_id <> 'catwars'`）
   - a を先にしても 今の CAT-WARS（`adventure` の鍵）は動く（reason の `catwars` が `catwars` の鍵になり、はじめ閉じる → **a を流した時点で 名乗った子は出撃できなくなる**。先生に SANMON タブで開けてもらう順番を先に伝える）。
     そのあいだ CAT-WARS（まだ `adventure` を見ている）は、サーバに ことわられても わけが分からず「つながらない」の文を出す → **a と 5 の CAT-WARS の `CATWARS_MODE_KEY` の切りかえは 同じ日に**。
3. PRISM：kit を上げる・説明の文・docs。`npm run check`。
4. SOL：（要るなら）`catwars` を一覧から はずす。kit を上げる。
5. CAT-WARS：kit を上げる・`CATWARS_MODE_KEY='catwars'`・`reportLockHit`・`PORTAL_SEND_ENABLED=true`＋送れなかった分の持ち方・セーブの push/pull・`mastery` を はずす。`npm run check`。
6. `refresh_sanmon_status_cache()`（スタミナの式は変えないので 要らないはず。§3 の `_sanmon_pools` を変えたら流す）。

## 6. 戻し方
- `_sanmon_effective_modes`・`sanmon_modes`・`sanmon_spend`・`set_sanmon_school_hours`・`sanmon_lock_hit`：流す前に `pg_get_functiondef` の出力を `supabase/sql/rollback/2026-11-xx-before-catwars.sql` に保存しておき、それを流す。
- `apps` の行：`delete from public.apps where app_id = 'catwars';`（`learning_event` に `catwars` の行があると外部キーで止まるなら、先に CAT-WARS の送信を止める＝`PORTAL_SEND_ENABLED=false` を出す）。
- `catwars_save`：`drop table public.catwars_save;`（中身は「まるごと書き出す」で先に取っておく）。
- kit：前の SHA に もどす（各アプリの月曜の自動更新の前に）。

## 7. 決めてもらうこと（持ち主）
- 戦闘の とちゅうで モードが閉じたとき、SANMON のように すぐホームにもどすか（いまは その1戦は最後まで）。
- デモモード（0000・0）を CAT-WARS にも入れるか。
- 単元アプリの「最初のまちがいの型」を 戦闘でも送るには、解答画面（単元アプリ → SANMON の `apps/` → CAT-WARS の `apps/`）の `onMiss` が 型を わたす形に なる必要がある（いまは わたさない）。
