# site-effects-demo-craft

手元のサイトへSwarm Buildの組み上げ演出とcanvas-uiを組み込み、ローカルで起動・検証するエージェントスキルです。[クイックガイド](QUICKSTART.md)から始められます。

## インストール

```sh
npx skills add 53able/site-effects-demo-craft --skill site-effects-demo-craft
```

```text
$site-effects-demo-craft
このプロジェクトにSwarm Buildとcanvas-uiを組み込んで、ローカルで起動してください。
元の背景・配色・書体・レイアウトは維持してください。
```

## 含まれるもの

- 金属質のWebGLカーソル、役割別の担当、配色抽出、見切れ優先、親子の描画順に対応した2D Swarmエンジン。
- 対象アプリへランタイムを配置するCLIと、Replay・Finish・完成を待つスクロールのアダプター。
- canvas-uiの公式コンポーネントとライセンスを利用先のReact 19アプリへ取得するCLI、および組み込み用のラッパー。
- 元デザインの維持、写真ごとの粒度、見える描画、待ち・ちらつきの改善、字幕あり・なし動画の検証手順。

エージェントは対象サイトの構成に合わせて読み込みとマウントを配線し、実ブラウザで確認します。CLIを実行しただけで、あらゆるサイトの統合が完了するわけではありません。参照URLから第三者サイトを複製する機能はありません。

## 依存と配布範囲

Swarmランタイムは同梱され、実行時に他ライブラリを読み込みません。導入CLIにはNode.jsが必要です。canvas-uiの取得にはネットワークが必要で、対象アプリにはReact 19・Three.jsなど公式コンポーネントの依存が必要です。録画手段は同梱していません。

canvas-uiの実装は、このリポジトリには同梱しません。利用先の具体的なアプリへ直接取得し、独自のライセンスを残します。2D Swarmエンジンにcanvas-ui由来のHTMLキャプチャや3D飛来実装は含みません。

リポジトリの文書・ツールと同梱SwarmランタイムはMITです。[LICENSE](LICENSE)と[第三者の権利表示](THIRD_PARTY_NOTICES.md)を参照してください。スキルのインストール先にも必要なライセンス通知を含みます。対象サイトのコード・写真・ロゴ・動画・会話ログは収録しません。

## 構成

```text
skills/site-effects-demo-craft/
  SKILL.md
  LICENSE
  THIRD_PARTY_NOTICES.md
  agents/
  assets/
  scripts/
  references/
runtime-src/
scripts/build-runtime.mjs
```

`skills/<name>/SKILL.md`のYAML frontmatterによる検出に対応しています。利用可能なスキルだけを確認するには、`npx skills add 53able/site-effects-demo-craft --list`を実行します。

## ランタイムの再ビルド

メンテナーは既存のrolldown環境を指定して再ビルドできます。ブラウザ側の利用やインストール時にビルドする必要はありません。

```sh
node scripts/build-runtime.mjs --rolldown /path/to/node_modules/rolldown
```

## 検証

導入CLIの回帰テストはNode.jsだけで実行できます。

```sh
node --test tests/installers.test.mjs
```

`tests/runtime-browser-regressions.mjs`は、ランタイムとアダプターを読み込んだテストページで実行するブラウザ用の回帰テストです。描画失敗の通知、画面下端の可視要素、混在する文字・リンク・アイコンを確認します。

React 19 / Next.js 16の独立したローカルアプリで、Swarmと公式LiquidObjectの描画、42要素の完了、Replay・Finish・破棄を確認しています。実時間性能や他の全フレームワークの互換性を保証するものではありません。
