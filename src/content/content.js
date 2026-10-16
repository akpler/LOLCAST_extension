(() => {
  'use strict';
  // 1) 신규 투명 유니코드 포맷(🖼️ + U+E0020~U+E007E) 및 2) 기존 {lolcast-gif:...} 포맷 동시 지원
  const TOKEN_RE = /🖼️([\u{E0020}-\u{E007E}]{6,4096})|\{lolcast-gif:([A-Za-z0-9_.%~-]{6,4096})\}/gu;
  const convertedTextNodes = new WeakSet();
  const recentKey = 'lolcastRecentGifs';
  const darkModeKey = 'lolcastChatDarkMode';
  let picker;
  let themeRevision = 0;

  const first = selectors => selectors.map(s => document.querySelector(s)).find(Boolean) || null;
  const input = () => first(LOLCAST_SELECTORS.input);
  const messageRoot = () => first(LOLCAST_SELECTORS.messages);

  // 일반 ID 문자열 -> '🖼️' + 투명 태그 문자열 변환
  function toInvisibleToken(id) {
    let shortId = id.includes('~') ? id.split('~')[0] : id;
    if (shortId.length === 16 && shortId.endsWith('AAAAM')) {
      shortId = shortId.slice(0, -5);
    }
    const encoded = Array.from(shortId)
      .map(ch => String.fromCodePoint(ch.codePointAt(0) + 0xE0000))
      .join('');
    return `🖼️${encoded}`;
  }

  // 투명 태그 문자열 -> 일반 ID 문자열 복원
  function fromInvisibleToken(encoded) {
    return Array.from(encoded)
      .map(ch => String.fromCodePoint(ch.codePointAt(0) - 0xE0000))
      .join('');
  }

  function send(type, payload = {}) {
    return new Promise(resolve => chrome.runtime.sendMessage({ type, ...payload }, response => resolve(response || { ok: false })));
  }

  function make(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === 'text') node.textContent = value;
      else if (key === 'className') node.className = value;
      else if (key === 'style') Object.assign(node.style, value);
      else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
      else node.setAttribute(key, value);
    }
    for (const child of children) node.append(child);
    return node;
  }

  function insertToken(id) {
    const field = input();
    if (!field) return;
    const token = toInvisibleToken(id);
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? start;
    field.value = `${field.value.slice(0, start)}${token}${field.value.slice(end)}`;
    field.selectionStart = field.selectionEnd = start + token.length;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.focus();
    rememberRecent(id);
    picker?.remove(); picker = null;
  }

  async function rememberRecent(id) {
    const stored = await chrome.storage.local.get({ [recentKey]: [] });
    const recent = Array.isArray(stored[recentKey]) ? stored[recentKey] : [];
    await chrome.storage.local.set({ [recentKey]: [id, ...recent.filter(value => value !== id)].slice(0, 12) });
  }

  function renderResults(results, status) {
    if (!picker) return;
    const grid = picker.querySelector('.lolcast-grid'); grid.replaceChildren();
    status.textContent = results.length ? '' : '검색 결과가 없습니다.';
    for (const item of results) {
      const button = make('button', { type: 'button', className: 'lolcast-result', title: 'GIF 삽입', onclick: () => insertToken(item.id) });
      button.append(make('img', { src: item.previewUrl, alt: 'Tenor GIF 미리보기', loading: 'lazy' }));
      grid.append(button);
    }
  }

  async function showRecent(status, requestId) {
    status.textContent = '최근 사용한 GIF를 불러오는 중…';
    const stored = await chrome.storage.local.get({ [recentKey]: [] });
    const ids = [...new Set(Array.isArray(stored[recentKey]) ? stored[recentKey] : [])].slice(0, 12);
    const resolvedItems = await Promise.all(ids.map(async id => {
      const resolved = await send('LOLCAST_RESOLVE', { id });
      return resolved.ok && resolved.url ? { id, previewUrl: resolved.url } : null;
    }));
    if (!picker || requestId !== picker.searchRequestId) return;
    const byUrl = new Map();
    for (const item of resolvedItems) {
      if (!item) continue;
      const existing = byUrl.get(item.previewUrl);
      if (existing) existing.ids.push(item.id);
      else byUrl.set(item.previewUrl, { ...item, ids: [item.id] });
    }
    const available = [...byUrl.values()];
    if (available.length) {
      status.textContent = '최근 사용한 GIF';
      const grid = picker.querySelector('.lolcast-grid');
      grid.replaceChildren();
      for (const item of available) {
        const card = make('div', { className: 'lolcast-recent-card' });
        const select = make('button', { type: 'button', className: 'lolcast-result', title: 'GIF 삽입', onclick: () => insertToken(item.id) });
        select.append(make('img', { src: item.previewUrl, alt: '최근 사용한 GIF', loading: 'lazy' }));
        const remove = make('button', { type: 'button', className: 'lolcast-recent-remove', text: '×', title: '최근 목록에서 삭제', 'aria-label': '최근 GIF 삭제', onclick: async () => {
          const latest = await chrome.storage.local.get({ [recentKey]: [] });
          const current = Array.isArray(latest[recentKey]) ? latest[recentKey] : [];
          await chrome.storage.local.set({ [recentKey]: current.filter(id => !item.ids.includes(id)) });
          await showRecent(status, requestId);
        } });
        card.append(select, remove);
        grid.append(card);
      }
    }
    else {
      picker.querySelector('.lolcast-grid').replaceChildren();
      status.textContent = ids.length ? '최근 GIF를 불러오지 못했습니다.' : '최근 사용한 GIF가 없습니다.';
    }
  }

  function openPicker() {
    if (picker) { picker.remove(); picker = null; return; }
    picker = make('section', { className: 'lolcast-picker', role: 'dialog', 'aria-label': 'LOLCAST GIF 선택' });
    picker.classList.toggle('lolcast-picker-dark', document.body.classList.contains('lolcast-chat-dark') || isDarkReaderActive());
    const search = make('input', { type: 'search', className: 'lolcast-search', placeholder: 'Tenor GIF 검색', 'aria-label': 'GIF 검색' });
    const close = make('button', { type: 'button', className: 'lolcast-close', text: '×', title: '닫기', onclick: () => { picker.remove(); picker = null; } });
    const status = make('div', { className: 'lolcast-status', text: '검색어를 입력하세요.' });
    picker.append(make('div', { className: 'lolcast-head' }, [search, close]), status, make('div', { className: 'lolcast-grid' }));
    document.body.append(picker); search.focus();
    picker.searchRequestId = 0;
    showRecent(status, picker.searchRequestId);
    let timer;
    search.addEventListener('input', () => { clearTimeout(timer); const q = search.value.trim();
      const requestId = ++picker.searchRequestId;
      if (!q) { showRecent(status, requestId); return; }
      timer = setTimeout(async () => {
      status.textContent = '검색 중…';
      const result = await send('LOLCAST_SEARCH', { query: q });
      if (!picker || requestId !== picker.searchRequestId) return;
      if (result.ok) renderResults(result.results, status); else status.textContent = `검색 실패: ${result.error || 'Tenor 응답 없음'}`;
    }, 350); });
    search.addEventListener('keydown', e => { if (e.key === 'Escape') { picker.remove(); picker = null; } });
  }

  function addButton() {
    const field = input();
    if (!field) return;
    const group = field.closest('.input-group') || field.parentElement;
    if (!group || group.querySelector('.lolcast-button')) return;

    const addon = make('span', { className: 'input-group-btn lolcast-addon' });
    const button = make('button', {
      type: 'button', className: 'btn btn-default btn-xs lolcast-button',
      text: 'GIF', title: 'LOLCAST GIF 선택', onclick: openPicker
    });
    addon.append(button);
    const existingAddon = [...group.children].find(child => child.classList.contains('input-group-btn'));
    if (existingAddon) group.insertBefore(addon, existingAddon);
    else field.insertAdjacentElement('afterend', addon);
  }

  function applyChatTheme(enabled) {
    themeRevision += 1;
    const dark = enabled || isDarkReaderActive();
    const panel = first(LOLCAST_SELECTORS.chatPanel);
    if (panel) panel.classList.toggle('lolcast-chat-dark', dark);
    if (input() || messageRoot()) document.body.classList.toggle('lolcast-chat-dark', dark);
    if (picker) picker.classList.toggle('lolcast-picker-dark', dark);
    const button = document.querySelector('.lolcast-theme-toggle');
    if (button) {
      button.textContent = dark ? '밝게' : '다크';
      button.title = dark ? '채팅 다크모드 끄기' : '채팅 다크모드 켜기';
      button.setAttribute('aria-label', button.title);
      button.setAttribute('aria-pressed', String(enabled));
    }
  }

  function isDarkReaderActive() {
    return document.documentElement.hasAttribute('data-darkreader-mode') ||
      document.documentElement.hasAttribute('data-darkreader-scheme') ||
      Boolean(document.querySelector('style[data-darkreader-mode], style[data-darkreader-inline-bgcolor]'));
  }

  function addThemeButton() {
    const field = input();
    if (!field) return;
    const group = field.closest('.input-group') || field.parentElement;
    if (!group || group.querySelector('.lolcast-theme-toggle')) return;
    const button = make('button', {
      type: 'button', className: 'btn btn-default btn-xs lolcast-theme-toggle',
      text: '다크', title: '채팅 다크모드 켜기', 'aria-label': '채팅 다크모드 켜기',
      'aria-pressed': 'false', onclick: async event => {
        if (window !== window.top && document.referrer.startsWith('https://lolcast.kr/')) {
          window.parent.postMessage({ source: 'lolcast-gif', action: 'toggle-theme' }, 'https://lolcast.kr');
          return;
        }
        const stored = await chrome.storage.local.get({ [darkModeKey]: false });
        await chrome.storage.local.set({ [darkModeKey]: !stored[darkModeKey] });
      }
    });
    const addon = make('span', { className: 'input-group-btn lolcast-theme-addon' });
    addon.append(button);
    const existingAddon = [...group.children].find(child => child.classList.contains('input-group-btn'));
    if (existingAddon) group.insertBefore(addon, existingAddon);
    else field.insertAdjacentElement('afterend', addon);
  }

  function startParentThemeBridge() {
    const syncFromSite = () => {
      const enabled = document.body.classList.contains('dark-mode');
      chrome.storage.local.set({ [darkModeKey]: enabled });
      applyChatTheme(enabled);
    };
    window.addEventListener('message', event => {
      if (event.origin !== 'https://lolcast.kr' || event.data?.source !== 'lolcast-gif' || event.data.action !== 'toggle-theme') return;
      document.querySelector('#theme-toggle-btn')?.click();
      requestAnimationFrame(syncFromSite);
    });
    document.querySelector('#theme-toggle-btn')?.addEventListener('click', () => requestAnimationFrame(syncFromSite));
    syncFromSite();
  }

  function isNearChatBottom(list) {
    return list.scrollHeight - list.clientHeight - list.scrollTop <= 48;
  }

  function keepChatAtBottom(list) {
    const scroll = () => { list.scrollTop = list.scrollHeight; };
    requestAnimationFrame(() => {
      scroll();
      requestAnimationFrame(scroll);
    });
  }

  async function convertTextNode(node) {
    if (convertedTextNodes.has(node)) return;
    const text = node.nodeValue || '';
    const matches = [...text.matchAll(TOKEN_RE)];
    if (!matches.length) return;
    const list = node.parentElement?.closest('#chattings');
    const wasNearBottom = Boolean(list && isNearChatBottom(list));
    convertedTextNodes.add(node);
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const match of matches) {
      fragment.append(document.createTextNode(text.slice(cursor, match.index)));
      // match[1]: 투명 유니코드 포맷, match[2]: 기존 {lolcast-gif:...} 포맷
      const rawId = match[1] ? fromInvisibleToken(match[1]) : match[2];
      const result = await send('LOLCAST_RESOLVE', { id: rawId });
      if (!result.ok || !result.url) {
        fragment.append(document.createTextNode(match[0]));
      } else {
        const image = make('img', {
          className: 'lolcast-inline-gif', src: result.url,
          alt: 'LOLCAST GIF', loading: 'lazy', width: '72', height: '72'
        });
        image.addEventListener('error', () => image.replaceWith(document.createTextNode(match[0])), { once: true });
        fragment.append(image);
      }
      cursor = match.index + match[0].length;
    }
    fragment.append(document.createTextNode(text.slice(cursor)));
    const shouldKeepBottom = wasNearBottom && list?.isConnected && isNearChatBottom(list);
    node.replaceWith(fragment);
    if (shouldKeepBottom) keepChatAtBottom(list);
  }

  function scan(root = messageRoot()) {
    if (!root) return;
    for (const selector of LOLCAST_SELECTORS.messageText) {
      if (root.matches?.(selector)) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(convertTextNode);
      }
      root.querySelectorAll(selector).forEach(talk => {
        const walker = document.createTreeWalker(talk, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(convertTextNode);
      });
    }
  }

  function start() {
    addButton(); addThemeButton(); scan();
    if (window === window.top) startParentThemeBridge();
    const initialThemeRevision = themeRevision;
    chrome.storage.local.get({ [darkModeKey]: false }).then(value => {
      if (themeRevision === initialThemeRevision) applyChatTheme(Boolean(value[darkModeKey]));
    });
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes[darkModeKey]) applyChatTheme(Boolean(changes[darkModeKey].newValue));
    });
    const observer = new MutationObserver(records => { addButton(); addThemeButton(); for (const record of records) record.addedNodes.forEach(node => { if (node.nodeType === Node.ELEMENT_NODE) scan(node); }); });
    observer.observe(document.body, { childList: true, subtree: true });
    setInterval(addButton, 1500);
    setInterval(() => {
      const dark = isDarkReaderActive();
      if (dark !== document.body.classList.contains('lolcast-chat-dark') && (input() || messageRoot())) applyChatTheme(false);
    }, 1000);
  }
  start();
})();