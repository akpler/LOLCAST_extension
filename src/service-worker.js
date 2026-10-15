import { searchTenor, decodeGifId } from './providers/tenor.js';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'LOLCAST_SEARCH') {
    searchTenor(message.query).then(results => sendResponse({ ok: true, results }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === 'LOLCAST_RESOLVE') {
    sendResponse({ ok: true, url: decodeGifId(message.id) });
  }
});
