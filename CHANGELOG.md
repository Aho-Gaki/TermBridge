# Changelog

Notable changes to TermBridge, newest first.

## Unreleased

### Added

- **Simple editor** — tap a text file in the explorer to open and edit it in place, in a
  plain text area the phone's own keyboard already knows how to drive. Saving is explicit
  (`Ctrl`+`S` or the save button) and a ● beside the filename marks unsaved changes
- **An edit from somewhere else is never silently overwritten** — a save is refused when
  the file changed on disk while it was open
- **Line endings and the BOM survive the round trip**, long lines wrap so a phone never
  scrolls sideways, and binaries are refused rather than mangled. Text files up to 512 KB
- **Copy the open folder's path** from the explorer's address field
- **Open a shell in the folder you are looking at**, straight from the explorer
- **The command line is edited with the phone's own keyboard** — tap anywhere on it to put
  the cursor there, then insert, delete, and convert text as in any text field, IME
  conversion included
- **`start.bat` configures Tailscale HTTPS itself**, so there is no separate
  `tailscale serve` step before the first run
- **`httpsPort` in `config.json`** pins the HTTPS port instead of taking whatever is free

### Changed

- **HTTPS over `tailscale serve` is the only way in from another device.** Every remote
  session is a secure context, which is what makes clipboard paste work without a
  permission prompt
- **Ports step aside instead of stopping.** Both the app port and the HTTPS port move to
  the next free one when something already holds them, rather than refusing to start
- **The phone's status strip is painted by the app**, so the terminal starts below the iOS
  clock instead of underneath it
- **Settings open as a full screen on a phone**
- The copy-path control sits inside the explorer's address field

### Removed

- **The plain-http path to other devices.** The server listens on `127.0.0.1` only, so
  there is no unencrypted address to reach from another device in the first place

### Fixed

- Backspace on a phone no longer acts on a stale line

### Security

- `express` 4.22.2 and `body-parser` 1.20.6, clearing two moderate `qs` advisories
  ([GHSA-x5fp-wj9c-mxmx](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx),
  [GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g))

## v1.0.0 — 2026-08-06

First public release.

- **Terminal** — PowerShell, cmd, and Git Bash, up to 24 tabs, WebGL rendering with
  Unicode 11 widths, clickable links, and Windows Terminal's copy and paste behavior
- **Sessions live on the server**, so closing the page or losing the network kills nothing
- **Shared across devices** — every connected device sees the same output and can type,
  reconnecting replays the scrollback, and the clipboard is shared both ways
- **On a phone** — installable as a PWA, the terminal mirrored as real text so the OS's own
  selection handles work, a key bar for the keys a software keyboard hides, and bottom
  navigation
- **File explorer** — browse, rename, copy, move, delete, create shortcuts, and pin folders,
  `.bat` files, or shortcuts for every device to launch from
- **Memo** — a scratchpad synced live to every device, saved as `memo.txt`
- **Appearance** — the VS Code Dark Modern theme, light and dark modes, and wallpapers
- **Language** — English and Japanese, remembered per device
- **Access control** — an optional token compared with `crypto.timingSafeEqual`
