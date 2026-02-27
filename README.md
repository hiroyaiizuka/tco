# tco - TaskChute for Obsidian CLI

AIエージェント（Claude Code、Cline、Codex 等）がCLI経由で [TaskChute for Obsidian](https://github.com/hiroyaiizuka/taskchute-for-obsidian) (Obsidian プラグイン) のタスクデータを操作するためのCLIツールです。

完全ローカル動作。ネットワーク通信なし。Obsidian Vault 内のファイルを直接読み書きします。

## Features

- Obsidian Vault 内の TaskChute Plus データをコマンドラインから操作
- JSON 出力モード (`--json`) によるAIエージェント連携
- タスクの一覧表示・追加・移動・削除
- ルーチン（繰り返しタスク）への変換
- リマインダーの設定・解除
- アトミック操作による安全なデータ変更（失敗時ロールバック）

## Installation

### Prerequisites

- Node.js 18 以上
- npm
- [Obsidian](https://obsidian.md/) と [TaskChute for Obsidian](https://github.com/hiroyaiizuka/taskchute-for-obsidian) プラグインがインストール済みの Vault

### Install from source

```bash
git clone https://github.com/hiroyaiizuka/tco.git
cd tco
npm install
npm run build
```

### グローバルインストール（推奨）

ビルド後、`npm link` でシステム全体から `tco` コマンドを利用可能にします。

```bash
npm link
```

これで任意のディレクトリから `tco` コマンドが使えるようになります。

### 確認

```bash
tco --help
```

## Setup

### Vault の初期化

最初に `tco init` で Obsidian Vault のパスを設定します。

```bash
# 引数でパスを指定
tco init /path/to/your/obsidian-vault

# Vault パスは ~/.tcorc に保存され、以降のコマンドで自動的に使用されます
```

### Vault パスの指定方法

以下の優先順位で Vault パスが決定されます。

| 優先度 | 方法 | 例 |
|--------|------|----|
| 1 | `--vault` オプション | `tco --vault /path/to/vault list` |
| 2 | 環境変数 | `export TCO_VAULT_PATH=/path/to/vault` |
| 3 | 設定ファイル | `~/.tcorc` (`tco init` で保存) |

## Global Options

すべてのコマンドで使用可能なオプション：

| オプション | 説明 |
|-----------|------|
| `--vault <path>` | Obsidian Vault のパスを指定 |
| `--json` | 出力をJSON形式にする（AIエージェント連携向け） |
| `-h, --help` | ヘルプを表示 |

## Commands

### `tco list` - タスク一覧

指定した日付のタスクを一覧表示します。

```bash
# 今日のタスクを表示
tco list

# 明日のタスクを表示
tco list tomorrow

# 日付を指定して表示
tco list 2026-03-01

# スロットでフィルタリング
tco list --slot "8:00-12:00"

# JSON形式で出力
tco list --json
```

**出力例（テーブル形式）：**

```
Tasks for 2026-02-27 (3 tasks):

#     Time    Name                              Slot              TaskId
---------------------------------------------------------------------------
1     09:00   朝のメールチェック                  8:00-12:00        tc-task-abc12345...
2     10:30   プロジェクトMTG                     8:00-12:00        tc-task-def67890...
3     --:--   買い物リスト作成                     -                 tc-task-ghi24680...
```

**JSON出力例：**

```json
{
  "date": "2026-02-27",
  "tasks": [
    {
      "taskId": "tc-task-abc12345",
      "instanceId": "tc-task-abc12345::2026-02-27",
      "name": "朝のメールチェック",
      "scheduledTime": "09:00",
      "estimatedMinutes": 15,
      "slotKey": "8:00-12:00",
      "state": "idle",
      "project": "Daily"
    }
  ],
  "count": 3
}
```

---

### `tco add` - タスク追加

新しいタスクを作成します。

```bash
# シンプルにタスクを追加
tco add "企画書を書く"

# 時刻・見積もり・プロジェクトを指定
tco add "クライアントMTG" --time 14:00 --estimate 60 --project "ProjectA"

# 明日のタスクとして追加
tco add "レポート提出" --date tomorrow --time 10:00

# リマインダー付きで追加（開始15分前に通知）
tco add "面接" --time 13:00 --remind 15

# JSON形式で結果を取得
tco add "資料準備" --json
```

**JSON出力例：**

```json
{
  "success": true,
  "taskId": "tc-task-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filePath": "TaskChute/Task/企画書を書く.md",
  "action": "add"
}
```

---

### `tco move` - タスク移動

タスクを別の日付やスロットに移動します。

```bash
# タスクを明日に移動
tco move tc-task-abc12345 --date 2026-03-01

# タスクのスロットを変更
tco move tc-task-abc12345 --slot "12:00-16:00"

# 日付とスロットを同時に変更
tco move tc-task-abc12345 --date 2026-03-01 --slot "8:00-12:00"

# ソース日付を指定して移動（デフォルトは今日）
tco move tc-task-abc12345 --date 2026-03-01 --from 2026-02-27
```

---

### `tco delete` - タスク削除

タスクを削除します。デフォルトでは一時削除（復元可能）です。

```bash
# 一時削除（DayStateに記録、復元可能）
tco delete tc-task-abc12345

# 完全削除（.trash/ に移動）
tco delete tc-task-abc12345 --permanent

# 日付を指定して削除
tco delete tc-task-abc12345 --date 2026-02-28
```

---

### `tco routinize` - ルーチン化

単発タスクをルーチン（繰り返しタスク）に変換します。

```bash
# 毎日繰り返し
tco routinize tc-task-abc12345 --type daily

# 2日おきに繰り返し（開始日が必要）
tco routinize tc-task-abc12345 --type daily --interval 2 --start 2026-03-01

# 毎週月曜日に繰り返し
tco routinize tc-task-abc12345 --type weekly --weekday 1

# 毎月第2火曜日に繰り返し
tco routinize tc-task-abc12345 --type monthly --week 2 --weekday 2

# 毎月15日に繰り返し
tco routinize tc-task-abc12345 --type monthly_date --monthday 15

# 毎月末日に繰り返し
tco routinize tc-task-abc12345 --type monthly_date --monthday last

# 終了日を指定
tco routinize tc-task-abc12345 --type daily --end 2026-12-31
```

**ルーチンタイプ一覧：**

| タイプ | 説明 | 必須オプション |
|-------|------|---------------|
| `daily` | 毎日（または N日おき） | `--start`（interval > 1 の場合） |
| `weekly` | 毎週の特定曜日 | `--weekday` |
| `monthly` | 毎月の第N週・曜日 | `--week`, `--weekday` |
| `monthly_date` | 毎月の特定日 | `--monthday` |

**曜日の指定（`--weekday`）：**

| 値 | 曜日 |
|----|------|
| 0 | 日曜日 |
| 1 | 月曜日 |
| 2 | 火曜日 |
| 3 | 水曜日 |
| 4 | 木曜日 |
| 5 | 金曜日 |
| 6 | 土曜日 |

---

### `tco remind` - リマインダー設定

タスクにリマインダーを設定・解除します。

```bash
# リマインダーを設定（9:00に通知）
tco remind tc-task-abc12345 --time 09:00

# リマインダーを解除
tco remind tc-task-abc12345 --clear
```

---

## AI Agent Integration

`tco` は AIエージェントからの利用を想定して設計されています。

### JSON モード

`--json` フラグを付けると、すべてのコマンドが機械可読なJSON形式で出力します。

```bash
# AIエージェントが今日のタスクを取得
tco list --json

# タスクを追加して結果をパース
tco add "新しいタスク" --time 10:00 --json

# エラー時もJSON形式
tco move invalid-id --date 2026-03-01 --json
# => { "success": false, "error": "Task not found: invalid-id" }
```

### 環境変数でのセットアップ

AIエージェントの設定ファイルに環境変数を追加することで、`--vault` オプションを省略できます。

```bash
export TCO_VAULT_PATH=/path/to/your/obsidian-vault
```

### ワークフロー例

```bash
# 1. 今日のタスクを確認
tco list --json

# 2. 新しいタスクを追加
tco add "議事録を書く" --time 15:00 --estimate 30 --project "会議" --json

# 3. タスクを明日に延期
tco move tc-task-xxx --date tomorrow --json

# 4. 完了したタスクをルーチン化
tco routinize tc-task-yyy --type daily --json

# 5. 不要なタスクを削除
tco delete tc-task-zzz --json
```

## Data Structure

tco は以下の Vault 内データを操作します。

```
YourVault/
├── .obsidian/
│   └── plugins/
│       └── taskchute-plus/
│           └── data.json              # プラグイン設定
├── TaskChute/
│   ├── Task/
│   │   ├── 朝のメールチェック.md       # タスクファイル（frontmatter + 本文）
│   │   ├── プロジェクトMTG.md
│   │   └── ...
│   └── Log/
│       ├── 2026-02-state.json          # DayState（月次の日別状態）
│       └── ...
```

## Development

```bash
# 依存関係のインストール
npm install

# 開発モード（ファイル変更を監視して自動ビルド）
npm run dev

# プロダクションビルド
npm run build

# テスト実行
npm test

# Lint
npm run lint

# 型チェック
npm run typecheck
```

## License

MIT
