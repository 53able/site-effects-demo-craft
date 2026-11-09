# site-effects-demo-craft

既存サイトの見た目を保ち、描いている過程が見える演出とデモ動画を仕上げるエージェントスキルです。

## インストール

```sh
npx skills add 53able/site-effects-demo-craft --skill site-effects-demo-craft
```

利用可能なスキルをインストールせずに確認できます。

```sh
npx skills add 53able/site-effects-demo-craft --list
```

## 使い方

インストール先のエージェントで、このスキルを指定して依頼します。Codexでの例:

```text
$site-effects-demo-craft
既存サイトの見た目を保ち、演出改善とデモ動画制作を進めてください。
```

演出の改善、既存効果の調整、録画のみの依頼に対応します。録画のみの場合はサイト本体を作り替えません。

## 判断基準

- 元のデザインとブランド配色を保つ。
- 写真・見出し・リンクなど、意味のある単位で描く。
- 描画の過程を画面内で見せ、スクロールで見切れそうな対象を優先する。
- 録画は画面内の完成に合わせて進め、待ち時間や名札のちらつきを改善する。
- 材質や動きを実際の動画表示サイズで確かめる。
- 字幕あり・なしの動画を用意し、動画の品質と実ブラウザの性能を別々に検証する。

## 構成と依存

```text
skills/site-effects-demo-craft/
  SKILL.md
  LICENSE
  agents/openai.yaml
  references/swarm-patterns.md
```

`SKILL.md`のYAML frontmatterと`skills/<name>/`による、vercel-labs/skillsの検出形式に対応しています。`agents/openai.yaml`はCodex用の表示メタデータです。

スキルはテキストだけで構成されています。必須の外部API、他スキル、実行スクリプト、特定の描画ライブラリはありません。インストールCLIの実行にはNode.jsが必要です。実際のサイト確認・録画には、利用環境のブラウザや録画手段を使います。

このリポジトリには第三者サイトのソースコード・画像・動画・ロゴ、会話ログを収録していません。

## ライセンス

[MIT](LICENSE)。インストールされるスキルのディレクトリにも同じライセンスと著作権表示を含めています。
