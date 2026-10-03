// Minimal runtime i18n: a flat key -> string dictionary per language.
// t() falls back to Japanese, then to the key itself, so unknown keys coming
// back from the server (error codes) still render as readable text.
(() => {
  const DICT = {
    ja: {
      'lang.name': '日本語',
      'lang.switch': '言語 / Language',

      // header + terminal area
      'hdr.tabs': 'ターミナル タブ',
      'hdr.new': '新しいターミナル',
      'hdr.newTitle': '新しいターミナル (Ctrl+Shift+`)',
      'hdr.profile': 'プロファイルの選択',
      'hdr.kill': 'ターミナルの強制終了',
      'empty.title': 'アクティブなターミナルはありません',
      'empty.hint': '<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>`</kbd> で新しいターミナルを開きます',
      'scroll.bottom': '▼ 最新へ',

      // key bar + mobile nav
      'key.paste': '貼り付け',
      'key.keyboard': 'キーボードを開閉',
      'nav.main': 'メインメニュー',
      'nav.tabs': 'タブ',
      'nav.files': 'ファイル',
      'nav.memo': 'メモ',
      'nav.settings': '設定',
      'sheet.title': 'ターミナル',

      // status bar
      'status.connecting': '接続中…',
      'status.reconnecting': '再接続中…',
      'status.settings': '設定',
      'status.explorer': 'エクスプローラー',
      'status.files': 'ファイル',
      'status.memo': 'メモ',
      'status.memoTitle': 'メモ（全端末で同期）',
      'presence.full': '{n} 台接続中',
      'presence.mini': '{n}台',

      // settings menu
      'set.dark': 'ダークモードに切り替え',
      'set.light': 'ライトモードに切り替え',
      'set.wpSet': '壁紙を設定（{kind}用）',
      'set.wpOpacity': '壁紙の透明度（{n}%）',
      'set.wpRemove': '壁紙を削除（{kind}用）',
      'kind.mobile': 'スマホ',
      'kind.pc': 'PC',
      'wp.opacityTitle': '壁紙の透明度',
      'wp.done': '壁紙を設定しました',
      'wp.fail': '壁紙の設定に失敗: ',

      // explorer chrome
      'ex.back': '戻る',
      'ex.fwd': '進む',
      'ex.up': '上へ',
      'ex.addr': 'アドレス',
      'ex.refresh': '最新の情報に更新',
      'ex.showHidden': '隠し項目を表示',
      'ex.hideHidden': '隠し項目を非表示',
      'ex.newDir': '新しいフォルダー',
      'ex.newFile': '新しいファイル',
      'ex.copyPath': 'このフォルダーのパスをコピー',
      'ex.pasteMove': 'ここへ移動: {name}',
      'ex.pasteCopy': 'ここへコピー: {name}',
      'ex.closeEsc': '閉じる (Esc)',
      'ex.list': 'ファイル一覧',
      'ex.pins': 'ピン留め',
      'ex.colName': '名前',
      'ex.colMtime': '更新日時',
      'ex.colType': '種類',
      'ex.colSize': 'サイズ',
      'ex.count': '{n} 個の項目',
      'ex.selCount': '{n} 個を選択中',
      'ex.selAll': 'すべて選択',
      'ex.selDelete': '削除',
      'ex.selDone': '選択を解除',
      'ex.dragOrder': 'ドラッグして並べ替え',

      // explorer item types
      'type.drive': 'ドライブ',
      'type.folder': 'ファイル フォルダー',
      'type.shortcut': 'ショートカット',
      'type.ext': '{ext} ファイル',
      'type.file': 'ファイル',

      // explorer context menu
      'menu.open': '開く',
      'menu.openPowerShell': 'PowerShell をここで開く',
      'menu.openCmd': 'コマンド プロンプトをここで開く',
      'menu.runTerm': 'ターミナルで実行',
      'menu.openLink': '開く（リンク先を実行）',
      'menu.edit': '編集',
      'menu.copy': 'コピー',
      'menu.cut': '切り取り',
      'menu.pasteHere': 'このフォルダーへ貼り付け',
      'menu.paste': '貼り付け',
      'menu.pin': 'ピン留めする',
      'menu.unpin': 'ピン留めを外す',
      'menu.copyPath': 'パスのコピー',
      'menu.copyCurPath': 'このフォルダーのパスをコピー',
      'menu.shortcut': 'ショートカットの作成',
      'menu.rename': '名前の変更',
      'menu.delete': '削除（ごみ箱へ）',
      'menu.selectMany': '複数選択',
      'menu.uncut': '切り取りを取り消す',
      'menu.uncopy': 'コピーを取り消す',
      'menu.run': '実行',
      'menu.runName': '{name} を実行',
      'menu.newFolder': '新しいフォルダー',
      'menu.newFile': '新しいファイル',
      'menu.refresh': '最新の情報に更新',

      // explorer toasts
      'msg.pathCopied': 'パスをコピーしました',
      'msg.shortcutCreated': 'ショートカットを作成しました',
      'msg.trashed': 'ごみ箱へ移動しました',
      'msg.copy': 'コピー: ',
      'msg.cut': '切り取り: ',
      'msg.pasted': '貼り付けました',
      'msg.copyN': '{n} 個をコピー',
      'msg.cutN': '{n} 個を切り取り',
      'msg.pastedN': '{n} 個を貼り付けました',
      'msg.trashedN': '{n} 個をごみ箱へ移動しました',
      'msg.partial': '{ok} 個完了、{fail} 個失敗（{name}: {err}）',
      'msg.uncut': '切り取りを取り消しました',
      'msg.uncopy': 'コピーを取り消しました',
      'msg.pinned': 'ピン留めしました',
      'msg.ranInTab': 'ターミナルのタブで起動しました',
      'msg.noTerm': 'ターミナルがありません',
      'msg.folderUnavailable': 'フォルダーが見つからないため、ターミナルを起動できませんでした',

      // clipboard
      'clip.empty': 'クリップボードが空です',
      'clip.http': 'この URL（http）ではブラウザが OS クリップボードを渡しません。いまは右クリック → 「貼り付け」をお使いください。HTTPS で開くには start.bat から起動してください。',
      'clip.blocked': 'クリップボードの読み取りがブロックされています（アドレスバーの 🔒 → クリップボード → 許可 → 再読み込み）',
      'clip.browser': 'ブラウザ',

      // memo
      'memo.title': 'メモ',
      'memo.close': 'メモを閉じる',
      'memo.closeTitle': '閉じる',
      'memo.placeholder': 'コマンドや作業メモをここに。全端末でリアルタイム同期されます。',
      'memo.syncing': '同期中…',
      'memo.saved': '保存済み',

      // editor
      'ed.save': '保存',
      'ed.saveTitle': '保存 (Ctrl+S)',
      'ed.close': 'エディターを閉じる',
      'ed.closeTitle': '閉じる (Esc)',
      'ed.content': 'ファイルの内容',
      'ed.saving': '保存中…',
      'ed.saved': '保存しました',
      'ed.discard': '{name} の変更は保存されていません。破棄して閉じますか？',

      // auth
      'auth.title': 'アクセストークンを入力',
      'auth.placeholder': 'TERMBRIDGE_TOKEN の値',
      'auth.hint': 'Enter で接続します',
      'auth.close': '閉じる',

      // server-side error codes
      'err.auth': '認証が必要です',
      'err.badPath': '不正なパスです',
      'err.tooBig': 'ファイルが大きすぎます（512 KB まで）',
      'err.binary': 'テキストファイルではないため開けません',
      'err.staleFile': 'このファイルは別の場所で変更されました。開き直してください',
      'err.badName': '不正な名前です',
      'err.exists': '同じ名前が既に存在します',
      'err.notFound': '対象が見つかりません',
      'err.copyIntoSelf': 'フォルダーを自分自身の中へコピーすることはできません',
      'err.moveIntoSelf': 'フォルダーを自分自身の中へ移動することはできません',
      'err.destExists': '同じ名前が移動先に既に存在します',
      'err.destDirMissing': '作成先のフォルダーが見つかりません',
      'err.lnkResolve': 'ショートカットを解決できません',
      'err.lnkCreate': 'ショートカットを作成できません',
      'err.lnkTargetMissing': 'ショートカットのリンク先が見つかりません',
      'err.lnkNotBat': 'リンク先が bat / cmd ではありません',
      'err.onlyBat': 'bat / cmd ファイルのみ実行できます',
      'err.maxTerms': 'ターミナル数が上限に達しています',
      'err.notImage': '画像ファイルを選択してください',
      'err.emptyImage': '画像が空です',
      'err.noWallpaper': '壁紙が設定されていません',
      'err.badOpacity': '透明度が不正です',
      'err.unknownDevice': '不明なデバイス',
    },

    en: {
      'lang.name': 'English',
      'lang.switch': '言語 / Language',

      'hdr.tabs': 'Terminal tabs',
      'hdr.new': 'New terminal',
      'hdr.newTitle': 'New terminal (Ctrl+Shift+`)',
      'hdr.profile': 'Select profile',
      'hdr.kill': 'Kill terminal',
      'empty.title': 'No active terminal',
      'empty.hint': 'Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>`</kbd> to open a new terminal',
      'scroll.bottom': '▼ Latest',

      'key.paste': 'Paste',
      'key.keyboard': 'Toggle keyboard',
      'nav.main': 'Main menu',
      'nav.tabs': 'Tabs',
      'nav.files': 'Files',
      'nav.memo': 'Notes',
      'nav.settings': 'Settings',
      'sheet.title': 'Terminals',

      'status.connecting': 'Connecting…',
      'status.reconnecting': 'Reconnecting…',
      'status.settings': 'Settings',
      'status.explorer': 'Explorer',
      'status.files': 'Files',
      'status.memo': 'Notes',
      'status.memoTitle': 'Notes (synced across devices)',
      'presence.full': '{n} connected',
      'presence.mini': '{n}',

      'set.dark': 'Switch to dark mode',
      'set.light': 'Switch to light mode',
      'set.wpSet': 'Set wallpaper ({kind})',
      'set.wpOpacity': 'Wallpaper opacity ({n}%)',
      'set.wpRemove': 'Remove wallpaper ({kind})',
      'kind.mobile': 'phone',
      'kind.pc': 'PC',
      'wp.opacityTitle': 'Wallpaper opacity',
      'wp.done': 'Wallpaper updated',
      'wp.fail': 'Could not set wallpaper: ',

      'ex.back': 'Back',
      'ex.fwd': 'Forward',
      'ex.up': 'Up',
      'ex.addr': 'Address',
      'ex.refresh': 'Refresh',
      'ex.showHidden': 'Show hidden items',
      'ex.hideHidden': 'Hide hidden items',
      'ex.newDir': 'New folder',
      'ex.newFile': 'New file',
      'ex.copyPath': 'Copy this folder\u2019s path',
      'ex.pasteMove': 'Move here: {name}',
      'ex.pasteCopy': 'Copy here: {name}',
      'ex.closeEsc': 'Close (Esc)',
      'ex.list': 'File list',
      'ex.pins': 'Pinned',
      'ex.colName': 'Name',
      'ex.colMtime': 'Date modified',
      'ex.colType': 'Type',
      'ex.colSize': 'Size',
      'ex.count': '{n} items',
      'ex.selCount': '{n} selected',
      'ex.selAll': 'Select all',
      'ex.selDelete': 'Delete',
      'ex.selDone': 'Clear selection',
      'ex.dragOrder': 'Drag to reorder',

      'type.drive': 'Drive',
      'type.folder': 'File folder',
      'type.shortcut': 'Shortcut',
      'type.ext': '{ext} File',
      'type.file': 'File',

      'menu.open': 'Open',
      'menu.openPowerShell': 'Open in PowerShell',
      'menu.openCmd': 'Open in Command Prompt',
      'menu.runTerm': 'Run in terminal',
      'menu.openLink': 'Open (run target)',
      'menu.edit': 'Edit',
      'menu.copy': 'Copy',
      'menu.cut': 'Cut',
      'menu.pasteHere': 'Paste into this folder',
      'menu.paste': 'Paste',
      'menu.pin': 'Pin',
      'menu.unpin': 'Unpin',
      'menu.copyPath': 'Copy path',
      'menu.copyCurPath': 'Copy this folder\u2019s path',
      'menu.shortcut': 'Create shortcut',
      'menu.rename': 'Rename',
      'menu.delete': 'Delete (to Recycle Bin)',
      'menu.selectMany': 'Select multiple',
      'menu.uncut': 'Cancel cut',
      'menu.uncopy': 'Cancel copy',
      'menu.run': 'Run',
      'menu.runName': 'Run {name}',
      'menu.newFolder': 'New folder',
      'menu.newFile': 'New file',
      'menu.refresh': 'Refresh',

      'msg.pathCopied': 'Path copied',
      'msg.shortcutCreated': 'Shortcut created',
      'msg.trashed': 'Moved to Recycle Bin',
      'msg.copy': 'Copied: ',
      'msg.cut': 'Cut: ',
      'msg.pasted': 'Pasted',
      'msg.copyN': 'Copied {n} items',
      'msg.cutN': 'Cut {n} items',
      'msg.pastedN': 'Pasted {n} items',
      'msg.trashedN': 'Moved {n} items to the Recycle Bin',
      'msg.partial': '{ok} done, {fail} failed ({name}: {err})',
      'msg.uncut': 'Cut cancelled',
      'msg.uncopy': 'Copy cancelled',
      'msg.pinned': 'Pinned',
      'msg.ranInTab': 'Started in a terminal tab',
      'msg.noTerm': 'No terminal available',
      'msg.folderUnavailable': 'The terminal could not start because the folder is unavailable',

      'clip.empty': 'Clipboard is empty',
      'clip.http': 'Over plain http the browser will not hand over the OS clipboard. Use right-click → Paste for now, or restart TermBridge with start.bat for HTTPS.',
      'clip.blocked': 'Clipboard read is blocked (address bar 🔒 → Clipboard → Allow → reload)',
      'clip.browser': 'browser',

      'memo.title': 'Notes',
      'memo.close': 'Close notes',
      'memo.closeTitle': 'Close',
      'memo.placeholder': 'Commands and working notes go here. Synced across every device in real time.',
      'memo.syncing': 'Syncing…',
      'memo.saved': 'Saved',

      'ed.save': 'Save',
      'ed.saveTitle': 'Save (Ctrl+S)',
      'ed.close': 'Close editor',
      'ed.closeTitle': 'Close (Esc)',
      'ed.content': 'File contents',
      'ed.saving': 'Saving…',
      'ed.saved': 'Saved',
      'ed.discard': '{name} has unsaved changes. Discard them?',

      'auth.title': 'Enter access token',
      'auth.placeholder': 'Value of TERMBRIDGE_TOKEN',
      'auth.hint': 'Press Enter to connect',
      'auth.close': 'Close',

      'err.auth': 'Authentication required',
      'err.badPath': 'Invalid path',
      'err.tooBig': 'File is too large (512 KB limit)',
      'err.binary': 'Not a text file, so it cannot be opened here',
      'err.staleFile': 'This file changed elsewhere. Reopen it and try again',
      'err.badName': 'Invalid name',
      'err.exists': 'An item with that name already exists',
      'err.notFound': 'Target not found',
      'err.copyIntoSelf': 'A folder cannot be copied into itself',
      'err.moveIntoSelf': 'A folder cannot be moved into itself',
      'err.destExists': 'An item with that name already exists at the destination',
      'err.destDirMissing': 'Destination folder not found',
      'err.lnkResolve': 'Could not resolve the shortcut',
      'err.lnkCreate': 'Could not create the shortcut',
      'err.lnkTargetMissing': 'The shortcut target was not found',
      'err.lnkNotBat': 'The shortcut does not point at a bat / cmd file',
      'err.onlyBat': 'Only bat / cmd files can be run',
      'err.maxTerms': 'Terminal limit reached',
      'err.notImage': 'Please choose an image file',
      'err.emptyImage': 'The image is empty',
      'err.noWallpaper': 'No wallpaper is set',
      'err.badOpacity': 'Invalid opacity',
      'err.unknownDevice': 'Unknown device',
    },
  };

  const FALLBACK = 'ja';
  const listeners = new Set();

  function detect() {
    try {
      const saved = localStorage.getItem('termbridge.lang');
      if (saved && DICT[saved]) return saved;
    } catch {}
    const nav = (navigator.languages && navigator.languages[0]) || navigator.language || '';
    return /^ja\b/i.test(nav) ? 'ja' : 'en';
  }

  let lang = detect();

  // "{n} items" + { n: 3 } -> "3 items"
  function fill(str, vars) {
    if (!vars) return str;
    return str.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  }

  function t(key, vars) {
    const s = DICT[lang][key] ?? DICT[FALLBACK][key] ?? key;
    return fill(s, vars);
  }

  // Static markup is annotated with data-i18n* attributes and re-applied on switch.
  function applyStatic(root = document) {
    for (const n of root.querySelectorAll('[data-i18n]')) n.textContent = t(n.dataset.i18n);
    for (const n of root.querySelectorAll('[data-i18n-html]')) n.innerHTML = t(n.dataset.i18nHtml);
    for (const n of root.querySelectorAll('[data-i18n-title]')) n.title = t(n.dataset.i18nTitle);
    for (const n of root.querySelectorAll('[data-i18n-aria]')) n.setAttribute('aria-label', t(n.dataset.i18nAria));
    for (const n of root.querySelectorAll('[data-i18n-ph]')) n.placeholder = t(n.dataset.i18nPh);
    document.documentElement.lang = lang;
  }

  function setLang(next) {
    if (!DICT[next] || next === lang) return;
    lang = next;
    try { localStorage.setItem('termbridge.lang', lang); } catch {}
    applyStatic();
    for (const cb of listeners) {
      try { cb(lang); } catch (e) { console.error('[i18n] a language listener failed', e); }
    }
  }

  window.I18N = {
    t,
    applyStatic,
    setLang,
    get lang() { return lang; },
    langs: Object.keys(DICT),
    name: (l) => DICT[l]?.['lang.name'] ?? l,
    onChange: (cb) => listeners.add(cb),
  };
})();
