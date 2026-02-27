# tco - TaskChute for Obsidian CLI

## Project overview

- **Name**: tco (TaskChute for Obsidian CLI)
- **Purpose**: AIエージェント（Claude Code、Cline/Cody等）がCLI経由でObsidianのTaskChuteプラグインを操作できるようにするCLIツール
- **Target**: Node.js CLI (TypeScript → バンドルされたJavaScript)
- **Data access**: Obsidian Vault内のファイル（Markdownファイル、dayState等のプラグインデータ）を直接読み書き
- **Entry point**: `src/index.ts` → `dist/tco` (CLI実行ファイル)

## Active specifications
(なし - プロジェクト初期化段階)

## Project rules
- ソースコードは `/Users/hiroyaiizuka/Desktop/tco/src/` に配置
- コードを実装したら、`npm test`、`npm run lint`、`npm run build` を実行してエラーがないことを確認
- 要件定義や仕様書は `/Users/hiroyaiizuka/Desktop/tco/.kiro/steering/` に作成
- 一時的なドキュメントや実装チェックリストは `/Users/hiroyaiizuka/Desktop/tco/tmp/` に作成
- メモリーノートは `/Users/hiroyaiizuka/Desktop/tco/memory/` に作成

## 基本方針
- 不明な点は積極的に質問する
- 質問する時は常にAskUserQuestionを使って回答させる
- **選択肢にはそれぞれ、推奨度と理由を提示する**
  - 推奨度は5段階評価

## Basic Memory ワークフロー

メモリの読み書き・検索・構造の詳細は **memory-manager スキル** に集約。

- **セッション開始時**: `memory/corrections/lessons.md` を読む

### メモリ構造

```
memory/
├── schemas/           # スキーマ定義（触らない）
├── events/            # 実装ログ・機能追加
├── bugfixes/          # バグ調査と修正
├── investigations/    # アーキテクチャ探索・原因調査
├── designs/           # 設計決定・ADR
├── corrections/       # 失敗と教訓の蒸留
│   ├── inbox.md       # ミスをすぐ書く
│   ├── lessons.md     # 蒸留された教訓
│   └── graduated.md   # 仕組み化済み
├── reviews/           # コードレビュー所見
└── archive/           # 古いメモ
```

### 記録ルール

| 何をした | カテゴリ | 保存先 | type |
|---------|----------|--------|------|
| 機能実装・リファクタリング | event | `events/` | event |
| バグ修正 | bugfix | `bugfixes/` | bugfix |
| コード調査・分析 | investigation | `investigations/` | investigation |
| 設計決定・技術選定 | design | `designs/` | design |
| コードレビュー | review | `reviews/` | review |
| ミス・失敗 | correction | `corrections/inbox.md` に追記 | correction |

### 検索
```bash
/Users/hiroyaiizuka/.local/bin/bm -p tco-memory tool search-notes "{検索語}"
```

## Environment & tooling

- Node.js: current LTS (Node 18+ recommended)
- **Package manager: npm**
- **Bundler: esbuild** (TypeScript → JavaScript バンドル)
- **CLI framework**: commander.js (または同等のCLIフレームワーク)
- **TypeScript**: strict mode

## File & folder conventions

- ソースは `src/` に配置。`src/index.ts` をCLIエントリポイントとする
- **ファイル構成例**:
  ```
  src/
    index.ts            # CLI エントリポイント (commander セットアップ)
    commands/           # 各サブコマンドの実装
      task.ts           # タスク操作 (list, add, complete, start, etc.)
      routine.ts        # ルーチン操作
      day.ts            # 日次操作 (today, summary, etc.)
      config.ts         # 設定操作
    services/           # ビジネスロジック
      vault-reader.ts   # Vault ファイル読み取り
      vault-writer.ts   # Vault ファイル書き込み
      task-service.ts   # タスク操作ロジック
      daystate-service.ts # DayState 読み書き
    parsers/            # ファイルパーサー
      markdown-parser.ts  # Markdown/frontmatter パーサー
      daystate-parser.ts  # DayState JSON パーサー
    types/              # TypeScript 型定義
      task.ts           # タスク関連の型
      config.ts         # 設定関連の型
    utils/              # ユーティリティ
      path.ts           # パス解決
      date.ts           # 日付ヘルパー
      output.ts         # CLI出力フォーマッター
  ```
- **ビルド成果物をコミットしない**: `node_modules/`, `dist/` はgit管理外
- 外部依存は最小限に

## CLI design principles

- **AIエージェントフレンドリー**: 出力はJSON (`--json` フラグ) とhuman-readable の両方をサポート
- **冪等性**: 同じコマンドを複数回実行しても安全
- **Non-destructive**: デフォルトでは破壊的操作を行わない。`--force` フラグで明示的に許可
- **Vault path**: `--vault` オプションまたは環境変数 `TCO_VAULT_PATH` でVaultパスを指定
- **出力形式**: デフォルトはhuman-readable、`--json` でJSON出力

## TaskChute data model

CLI が操作するデータ:
- **Markdown タスクファイル**: Vault内のMarkdownファイルに含まれるタスク（frontmatter + 本文）
- **DayState**: プラグインのデータディレクトリに保存される日次状態JSON
- **ルーチン定義**: frontmatter内のルーチンスケジュール定義
- **実行ログ**: `<logDataPath>/YYYY-MM-tasks.json` 形式のタスク実行記録

## Testing

```bash
npm install
npm run build    # production bundle
npm run dev      # esbuild --watch
npm test         # Jest (ts-jest)
npm run lint     # ESLint
```
- テストは `tests/` ディレクトリに配置
- ユニットテスト: parsers, services のロジックテスト
- 統合テスト: CLI コマンドの入出力テスト

## Security & privacy

- Vault内のファイルのみ操作。Vault外のファイルにはアクセスしない
- ネットワーク通信なし（完全ローカル動作）
- ユーザーデータの収集・送信なし

## Coding conventions

- TypeScript with `"strict": true`
- `src/index.ts` はCLIセットアップのみ。ロジックは各モジュールへ委譲
- ファイルが200-300行を超えたら分割を検討
- `async/await` を使用し、エラーは適切にハンドリング
- CLI出力にはプロセス終了コードを正しく設定（0=成功, 1=エラー）

## Agent do/don't

**Do**
- コマンドIDは安定させる（リリース後に変更しない）
- JSON出力モードを全コマンドでサポート
- エラーメッセージを明確にし、修正方法を示す
- Vault内のファイルを変更する前にバックアップを考慮

**Don't**
- ネットワーク通信を行わない
- Vault外のファイルを操作しない
- ユーザーの確認なく破壊的操作を行わない
- 大量のファイルを一括操作する際にメモリを浪費しない
