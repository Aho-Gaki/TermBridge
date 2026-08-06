# Contributing

Thanks for looking. Please read the scope section first — it will save you time.

## Scope

TermBridge is built around a single job: reaching a Windows PC's terminal from a
phone. The constraints below are deliberate — they are what keep it small and fast.

- **Windows only.** The `.bat` execution, `start`-line handling, ConPTY shells, and
  Recycle Bin deletes are all Windows-specific. A cross-platform port would be a
  different project.
- **No build step.** Plain JavaScript, served as-is. No bundler, no TypeScript, no
  framework.
- **Few dependencies.** Four runtime dependencies today. Additions need a strong case.
- **Small.** The whole thing is around 4,500 lines. Being readable in an afternoon is
  a feature.

## Welcome

- Bug reports with clear reproduction steps, including your Windows version, Node
  version, browser, and device
- Fixes for those bugs
- Documentation corrections and clarifications
- Compatibility fixes for shells, terminal behavior, or mobile browsers

## Likely to be declined

- Linux or macOS support
- Rewrites in another language or framework
- Authentication systems beyond the existing token (use Tailscale ACLs instead)
- Anything that would expose the server to the internet by default
- Large features that most users would not turn on

If you are unsure, open an issue before writing code.

## Development

```powershell
git clone https://github.com/IamaVibeCoder/TermBridge.git
cd TermBridge
npm install
node server.js
```

Then open `http://127.0.0.1:7070/`. There is nothing to build or watch — reload the
page after editing anything in `public/`.

Useful files:

| Path | What it holds |
|---|---|
| `server.js` | PTY spawning, WebSocket broadcast, file API, wallpaper, memo, pins |
| `public/app.js` | Everything the client does |
| `public/style.css` | VS Code Dark Modern reproduction |

## Pull requests

- One change per pull request
- Match the surrounding style; there is no linter to argue with
- Test on both a desktop browser and a phone if you touch the UI — the mobile layout
  breaks in ways the desktop one does not
- By submitting, you agree your contribution is licensed under the [MIT License](LICENSE)

## Forking

Forking is welcome and needs no permission — the MIT license covers it.

---

# コントリビューション（日本語）

ご覧いただきありがとうございます。まず方針の節をお読みください。

## 方針

TermBridge は「Windows PC のターミナルにスマホから触る」という1つの目的のために設計されて
います。以下の制約は意図的なもので、小ささと速さを保つためのものです。

- **Windows 専用。** `.bat` の実行、`start` 行の処理、ConPTY のシェル、ごみ箱への削除は
  すべて Windows 固有です。クロスプラットフォーム化は別のプロジェクトになります。
- **ビルド工程なし。** 素の JavaScript をそのまま配信します。バンドラも TypeScript も
  フレームワークも使いません。
- **依存を増やさない。** 現在の実行時依存は4つです。追加には強い理由が必要です。
- **小さいまま。** 全体で約4,500行です。半日で読み切れることは機能のうちです。

## 歓迎するもの

- 再現手順が明確なバグ報告（Windows のバージョン、Node のバージョン、ブラウザ、端末を含めて）
- そのバグの修正
- ドキュメントの修正や説明の改善
- シェル・ターミナル挙動・モバイルブラウザの互換性修正

## お断りする可能性が高いもの

- Linux / macOS 対応
- 別言語・別フレームワークへの書き換え
- 既存トークン以外の認証機構（Tailscale の ACL をお使いください）
- 既定でインターネットに露出させる変更
- ほとんどの利用者が有効にしないであろう大型機能

迷う場合は、コードを書く前に issue を立ててください。

## 開発

```powershell
git clone https://github.com/IamaVibeCoder/TermBridge.git
cd TermBridge
npm install
node server.js
```

`http://127.0.0.1:7070/` を開きます。ビルドも watch もありません。`public/` を編集したら
ページを再読み込みするだけです。

| パス | 内容 |
|---|---|
| `server.js` | PTY の生成、WebSocket 配信、ファイル API、壁紙、メモ、ピン留め |
| `public/app.js` | クライアント側の全処理 |
| `public/style.css` | VS Code Dark Modern の再現 |

## プルリクエスト

- 1つの PR につき1つの変更
- 周囲のコードのスタイルに合わせてください。議論すべき linter はありません
- UI に触れる場合は PC のブラウザとスマホの両方で確認してください。モバイル側は
  デスクトップでは起きない壊れ方をします
- 提出をもって、[MIT License](LICENSE) の下でライセンスされることに同意したものとします

## フォークについて

フォークは歓迎です。許可も不要で、MIT ライセンスの範囲で自由にご利用いただけます。
