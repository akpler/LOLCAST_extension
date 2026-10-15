const TENOR_MEDIA = /^https:\/\/media\.tenor\.com\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+$/;

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
  // URL.pathname은 한글을 이미 퍼센트 인코딩하므로 그대로 토큰에 담습니다.
  try { decodeURIComponent(match[2]); } catch { return null; }
  return `${match[1]}~${match[2]}`;
}

export function decodeGifId(id) {
  if (typeof id !== 'string' || id.length > 4096) return null;
  const compact = id.match(/^([A-Za-z0-9_-]{6,})~([A-Za-z0-9_.%~-]+\.gif)$/i);
  if (compact) {
    try {
      const filename = decodeURIComponent(compact[2]);
      if (!filename.endsWith('.gif') || /[\\/]/.test(filename)) return null;
      return `https://media.tenor.com/${compact[1]}/${compact[2]}`;
    } catch { return null; }
  }

  // 이미 전송된 기존 Base64 URL 토큰의 호환성을 유지합니다.
  if (!/^[A-Za-z0-9_-]{8,4096}$/.test(id)) return null;
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
  return [...urls].slice(0, 24).map(url => ({ id: encodeGifId(url), previewUrl: url }));
}
