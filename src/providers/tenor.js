const TENOR_MEDIA = /^https:\/\/media\.tenor\.com\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=\%-]+$/;

function cleanUrl(value) {
  try {
    const url = new URL(value.replaceAll('\\/', '/'));
    return url.protocol === 'https:' && url.hostname === 'media.tenor.com' ? url.href : null;
  } catch { return null; }
}

export function encodeGifId(mediaUrl) {
  const url = cleanUrl(mediaUrl);
  if (!url) return null;
  const parsed = new URL(url);
  const match = parsed.pathname.match(/^\/([A-Za-z0-9_-]{6,})\/(.+\.gif)$/i);
  if (!match) return null;

  let id = match[1];
  // 16자리 Tenor 미디어 ID 중 'AAAAM'으로 끝나는 기본 포맷은 5글자를 생략해 길이를 최소화합니다.
  if (id.length === 16 && id.endsWith('AAAAM')) {
    id = id.slice(0, -5);
  }
  return id;
}

export function decodeGifId(id) {
  if (typeof id !== 'string' || id.length > 4096) return null;

  // 1. 기존 'ID~파일명.gif' 포맷 호환 유지
  const compact = id.match(/^([A-Za-z0-9_-]{6,})~([A-Za-z0-9_.%~-]+\.gif)$/i);
  if (compact) {
    try {
      const filename = decodeURIComponent(compact[2]);
      if (!filename.endsWith('.gif') || /[\\/]/.test(filename)) return null;
      return `https://media.tenor.com/${compact[1]}/${compact[2]}`;
    } catch { return null; }
  }

  // 2. 신규 단축 ID 포맷 (파일명 제거됨, 11자리 또는 16자리 미디어 ID)
  if (/^[A-Za-z0-9_-]{10,24}$/.test(id)) {
    const fullId = id.length === 11 ? `${id}AAAAM` : id;
    return `https://media.tenor.com/${fullId}/a.gif`;
  }

  // 3. 구버전 Base64 전체 URL 토큰 호환 유지
  if (!/^[A-Za-z0-9_-]{25,4096}$/.test(id)) return null;
  try {
    const padded = id.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - id.length % 4) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    const url = new TextDecoder().decode(bytes);
    return TENOR_MEDIA.test(url) ? url : null;
  } catch { return null; }
}

export async function searchTenor(query) {
  const term = String(query || '').trim().slice(0, 80);
  if (!term) return [];
  const response = await fetch(`https://tenor.com/search/${encodeURIComponent(term)}-gifs`, { credentials: 'omit' });
  if (!response.ok) throw new Error(`Tenor HTTP ${response.status}`);
  const html = await response.text();
  const urls = new Set();
  const pattern = /https?:\\?\/\\?\/media\.tenor\.com\\?\/[^"'\\s<>]+/g;
  for (const match of html.match(pattern) || []) {
    const url = cleanUrl(match);
    if (url && /\.gif(?:\?|$)/i.test(url)) urls.add(url);
  }
  return [...urls].slice(0, 24).map(url => ({ id: encodeGifId(url), previewUrl: url })).filter(item => item.id);
}