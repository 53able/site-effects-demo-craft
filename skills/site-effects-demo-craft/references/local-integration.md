# ローカルサイトへの組み込み

## 導入前に確認する

既存プロジェクトの起動コマンド、公開ディレクトリ、対象ページ、クライアント側のマウント箇所を確認する。参照URLがあっても、編集対象のファイルと混同しない。

`SKILL_DIR`はインストールされたこのスキルのディレクトリ、`APP_DIR`は対象アプリの実際のパスとして設定する。シンボリックリンク経由のパスは実体のパスへ解決する。スキル自身のリポジトリをアプリの代わりに指定しない。

## Swarmランタイムを配置する

```sh
node "$SKILL_DIR/scripts/install-local.mjs" --project "$APP_DIR" --dry-run
node "$SKILL_DIR/scripts/install-local.mjs" --project "$APP_DIR"
```

公開ディレクトリが`public`以外なら`--public-dir`にアプリ内の相対ディレクトリを指定する。既存ファイルと内容が違う場合は上書きせず失敗する。差を確認してから対処し、対象外のファイルを消さない。

配置されるのは`swarm-demo/swarm-build.js`、`swarm-demo/swarm-demo.js`とライセンス通知。前者を先に読み込む。静的HTMLの例:

```html
<script src="/swarm-demo/swarm-build.js"></script>
<script src="/swarm-demo/swarm-demo.js" data-autostart="true"></script>
```

公開パスにベースパスやCDNがある場合は実際の配信URLに合わせる。React/Next.js等ではクライアントのeffectで順番に読み込むか、既存のスクリプト管理を使う。ロード完了とDOM準備後に開始し、アンマウントで破棄する。Strict Modeでも重複ロード・二重起動を残さない。

```js
window.SwarmDemo.start({ headcount: 12, scale: 1.8 });
window.SwarmDemo.replay();
window.SwarmDemo.setSpeed(1.5);
window.SwarmDemo.finish();
window.SwarmDemo.destroy();
```

これらは順に全部実行する手順ではなく、操作用のAPI。人数・サイズ・速度は対象ページで調整する。

## 対象要素を決める

`data-swarm-block`があれば明示対象を優先し、なければ意味のある要素と描画する親を抽出する。明示対象が1つでもあれば、自動で不足を埋めたと推定しない。写真・名前・リンク等の粒度と取りこぼしを点検する。

```html
<article data-swarm-block>
  <img data-swarm-block src="/member.jpg" alt="メンバー">
  <h2 data-swarm-block>名前</h2>
</article>
```

除外する領域には`data-swarm-ignore`を付ける。録画コントロールやcanvas-uiの効果枠は、必要に応じて除外し操作できる状態を保つ。ページの配色はランタイムが抽出し、必要な場合だけ`palette`を明示指定する。

## canvas-uiを実際にマウントする

React 19アプリ向けの導入経路:

```sh
node "$SKILL_DIR/scripts/install-canvas-ui.mjs" --project "$APP_DIR"
```

公式レジストリからLiquidObjectを利用先アプリへ直接取得する。`src`があれば`src/components/swarm-demo`、なければ`components/swarm-demo`へ配置する。`--component-dir`でアプリ内の別ディレクトリを指定できる。必要な依存は出力に従い、そのアプリのパッケージ管理で導入する。既存のバージョンと重複させない。

生成されたコンポーネントを対象ページで使う。importパスは実際の配置に合わせる。

```tsx
import { CanvasUiEffect } from "./components/swarm-demo/CanvasUiEffect";

<CanvasUiEffect
  src="/site-owned-mark.svg"
  tint="#277db5"
  style={{ width: 280, height: 220 }}
/>
```

画像は利用する権利のあるものを使い、色と配置はサイトに合わせる。新しい装飾枠が元のデザインや今回の指示に合わない場合は、配置を決めてから組み込む。外部デザインを追加する口実にしない。

取得しただけでは効果は出ない。サイズが0でないこと、画像のロード、WebGLの描画、コンソールを確認する。取得や描画が失敗した場合は失敗として報告し、代替表示をcanvas-ui適用済みとしない。生成されたライセンスとmanifestは残す。ライセンス確認が不一致なら導入を中止し、旧条件で新しいコードを扱わない。

React 19以外の環境は、このCLIで勝手に移行しない。既存構成に合う公式コンポーネントの経路を確認し、利用条件を保った統合を行う。

## 起動と確認

アプリの既存コマンドで起動する。新しいサーバーを増やす前に、同じプロジェクトの既存サーバーが使えるか確認する。

開始前・描画中・完成後を比べ、元の背景・配色・書体・配置を保つこと、金属質のカーソル、個別の写真・文字の描画、canvas-uiの描画を確認する。Replay、Finish、破棄、上下スクロールも確認する。

```js
window.SwarmDemo.debug();
await window.SwarmDemo.waitForVisible({ timeout: 30000 });
await window.SwarmDemo.tour({ timeout: 30000, hold: 400 });
```

`debug()`は対象・完成・可視未完了の件数を返す。`tour()`は明示的に呼んだ場合だけ、可視対象の完成を待って次へ進む。タイムアウトは失敗として扱う。手動操作を止めるために常時実行しない。エンジンの詳細な計測が必要なら、開始前に`window.__SWARM_DEBUG__ = true`を設定する。

書き出しfpsやフォールバックの完了だけで、ネイティブ効果や実時間性能の成功を主張しない。利用者へ起動コマンド・URL・確認条件・残る不足を共有する。
