// 타겟 사이트 DOM 변경 시 이 파일만 우선 수정합니다.
globalThis.LOLCAST_SELECTORS = Object.freeze({
  input: ['#ichatinput', 'input[placeholder="채팅을 입력하세요."]', 'textarea[placeholder*="채팅"]'],
  inputGroup: ['#inputs.input-group', '#ichatinput'],
  messages: ['#chattings'],
  messageText: ['.talk'],
  chatPanel: ['#chat-panel'],
  chatMenu: ['#mobile-chat-menu-bar']
});
