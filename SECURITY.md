# Security

TermBridge hands out a fully interactive Windows shell over HTTP. Anyone who can
load the page can run any command your user account can run, read and delete your
files, and start programs. Please read this page before exposing it to anything.

## Default posture

Out of the box, the server binds to **two addresses only**:

- your Tailscale IPv4 address
- `127.0.0.1`

It does not listen on your LAN address and is not reachable from the internet. If
Tailscale isn't running, it falls back to loopback only. When you set up
`tailscale serve`, TLS is terminated by Tailscale and forwarded to `127.0.0.1:7070` —
still tailnet-only, because **Funnel is not used anywhere in this project**.

Traffic over a tailnet is encrypted by WireGuard even on the plain `http://100.x.y.z:7070/`
address, so the token is never sent in the clear between your devices.

## Threat model

**Protected against**

| Threat | How |
|---|---|
| Reachable from the internet | Never binds to a public interface; no Funnel |
| Reachable from your LAN / coffee shop Wi-Fi | Binds `127.0.0.1` only; no inbound port is opened at all |
| Token guessing by brute force timing | Compared with `crypto.timingSafeEqual` after a length check |

**Not protected against**

| Threat | Reality |
|---|---|
| Another person's device on your tailnet | They get full shell access unless you set a token |
| A compromised device of your own | It holds a valid session; treat it as a compromised SSH key |
| Malware already running on the PC | It can read `config.json` like any other file |
| Someone at the physical keyboard | Out of scope |

## Hardening

**1. Set a token if your tailnet isn't solely yours.**

```json
{ "token": "a long random string" }
```

Save this as `config.json` and restart. Every device is then asked for the token on
first access and stores it locally. The token guards both the WebSocket handshake and
the file explorer API.

**2. Restrict the port with Tailscale ACLs.** A token is a shared secret; an ACL is
enforcement. Limiting which tailnet devices may reach port 7070 is stronger than
either alone.

**3. Leave `host` unset.** Setting `"host": "all"` binds every interface, including
your LAN. There is no good reason to do this, and it turns a private tool into an
open remote shell.

**4. Do not open a firewall port.** The default setup never needs one — `tailscale serve`
reaches the app over loopback. If Windows Firewall prompts you, you can decline it.

## What is not a vulnerability

Arbitrary command execution through the terminal is the entire purpose of this
software, not a flaw. The same applies to reading and writing files through the
explorer and running `.bat` files. Reports of this nature will be closed.

Genuine issues would look like: bypassing token authentication, escaping the intended
listening addresses, reading files while unauthenticated, or path traversal in the
file API.

## Reporting

Please use [GitHub's private security advisories](https://github.com/IamaVibeCoder/TermBridge/security/advisories/new)
rather than a public issue. Security reports are looked at first.

---

# セキュリティ（日本語）

TermBridge は Windows の対話的シェルを HTTP 越しに提供します。このページを開ける人は、
あなたのユーザー権限で任意のコマンドを実行でき、ファイルの読み取りも削除もできます。
公開・共有の前に必ずお読みください。

## 既定の状態

サーバーは**次の2つのアドレスにのみ**バインドします。

- Tailscale の IPv4 アドレス
- `127.0.0.1`

LAN アドレスでは待ち受けず、インターネットからは到達できません。Tailscale が動作して
いない場合はループバックのみになります。`tailscale serve` を設定した場合も TLS の終端は
Tailscale 側で行われ `127.0.0.1:7070` に中継されるだけで、**本プロジェクトは Funnel を
一切使用しません**。

Tailnet 内の通信は `http://100.x.y.z:7070/` という平文 URL でも WireGuard により暗号化
されるため、トークンが端末間で平文のまま流れることはありません。

## 脅威モデル

**防げるもの**

| 脅威 | 対策 |
|---|---|
| インターネットからの到達 | 公開インターフェースにバインドしない。Funnel 不使用 |
| LAN や公衆 Wi-Fi からの到達 | `127.0.0.1` のみで待ち受け、受信ポートを一切開かない |
| タイミング攻撃によるトークン推測 | 長さ検査の後 `crypto.timingSafeEqual` で比較 |

**防げないもの**

| 脅威 | 実際のところ |
|---|---|
| Tailnet 上にある他人の端末 | トークンを設定しない限り、シェルを完全に操作できます |
| 自分の端末が乗っ取られた場合 | 有効なセッションを保持しています。漏洩した SSH 鍵と同じ扱いを |
| PC 上で既に動いているマルウェア | 他のファイルと同様に `config.json` を読めます |
| 物理的にキーボードの前にいる人 | 対象外 |

## 安全に使うために

**1. Tailnet が自分専用でないならトークンを設定する。**

```json
{ "token": "十分に長いランダムな文字列" }
```

これを `config.json` として保存し再起動します。以降、各端末は初回アクセス時にトークンを
求められ、端末ごとに保存します。トークンは WebSocket の接続とファイル API の両方を保護します。

**2. Tailscale の ACL でポートを制限する。** トークンは共有秘密にすぎませんが、ACL は
強制力のある制御です。ポート 7070 に到達できる端末を絞るほうが確実です。

**3. `host` は設定しない。** `"host": "all"` は LAN を含む全インターフェースにバインドします。
これを行う正当な理由はなく、私的なツールを公開シェルに変えてしまいます。

**4. ファイアウォールのポートを開けない。** 既定の構成では不要です。`tailscale serve` が
ループバック経由で本体に繋ぐためです。Windows ファイアウォールのダイアログが出ても、
そのまま閉じて構いません。

## 脆弱性ではないもの

ターミナル経由で任意のコマンドが実行できることは、本ソフトウェアの目的そのものであり
欠陥ではありません。エクスプローラーによるファイルの読み書きや `.bat` の実行も同様です。
この種の報告はクローズされます。

実際の問題となるのは、トークン認証の回避、意図した待ち受けアドレスからの逸脱、未認証での
ファイル読み取り、ファイル API のパストラバーサルなどです。

## 報告

公開 issue ではなく [GitHub のプライベートセキュリティアドバイザリ](https://github.com/IamaVibeCoder/TermBridge/security/advisories/new)
をご利用ください。セキュリティ報告は最優先で確認します。
