# LOLCAST GIF Chrome Extension

타겟: `https://lolcast.kr/` 오른쪽 채팅 패널 (채팅 iframe: `https://insagirl-toto.appspot.com/chatting/lgic/`)

## 설치

1. Chrome에서 `chrome://extensions`를 엽니다.
2. 개발자 모드를 켭니다.
3. `압축해제된 확장 프로그램 로드`를 선택하고 이 폴더를 지정합니다. `manifest.json`이 바로 들어 있는 폴더여야 합니다.
4. 타겟 채팅 페이지를 새로고침합니다.

## GitHub 공개 배포

이 저장소는 Chrome Web Store에 등록하지 않은 개발자용 확장 프로그램입니다. GitHub 저장소의 `Actions`가 태그를 기준으로 설치용 ZIP을 만들고 `Releases`에 첨부합니다.

```text
git tag v0.1.0
git push origin v0.1.0
```

사용자는 GitHub Release에서 `lolcast-gif-v0.1.0.zip`을 내려받아 압축을 풀고, 압축을 푼 폴더를 Chrome의 `chrome://extensions` → 개발자 모드 → `압축해제된 확장 프로그램 로드`로 선택합니다. Chrome은 보안상 ZIP 파일을 직접 설치하지 않으므로, 최종 사용자는 압축을 풀어야 합니다.

## 동작

GIF 버튼은 오른쪽 패널의 채팅 입력줄 안, 기존 `^^` 버튼 바로 왼쪽에 추가됩니다. 버튼으로 Tenor 검색 결과를 열고 GIF를 선택하면 입력창에 `{lolcast-gif:ID}`가 삽입됩니다. 서버에는 이 문자열만 전송되며 GIF URL은 전송하지 않습니다. 설치된 사용자의 확장 프로그램은 ID를 내부적으로 해석하여 GIF를 표시하고, 실패하면 원문을 그대로 둡니다.

현재 ID는 Tenor 미디어 URL을 확장 프로그램 내부에서만 복원할 수 있는 URL-safe opaque token입니다. 따라서 채팅 메시지에는 `https://` 주소가 들어가지 않습니다.

## 제한 및 교체 지점

Tenor 공식 API 키를 사용하지 않습니다. `src/providers/tenor.js`가 Tenor 검색 HTML에서 `media.tenor.com` GIF 주소를 추출하므로 Tenor 웹사이트 구조가 바뀌면 이 파일만 수정하면 됩니다. 검색 결과가 브라우저에서 보이지 않을 경우 확장 프로그램 카드의 사이트 액세스에서 Tenor 접근을 허용하세요.

즐겨찾기/최근 GIF 저장을 위한 `chrome.storage.local` 기반 ID 저장 구조는 포함되어 있으며, 현재 UI는 최근 목록을 다음 확장에서 연결할 수 있게 분리되어 있습니다.

## 테스트

- 버튼 표시: 타겟 페이지 새로고침 후 입력창 옆 `GIF` 버튼 확인
- 검색: 버튼 → 검색어 입력 → 미리보기 클릭
- 전송: 입력창에 토큰이 삽입되는지 확인 후 기존 전송 방식으로 전송
- 수신 변환: `#chattings`에 토큰이 들어간 메시지가 추가되면 GIF로 교체
- 실패 동작: 잘못된 토큰은 원문 유지
- 비설치 사용자: 서버에는 토큰만 남으므로 확장 프로그램이 없으면 문자열만 표시
