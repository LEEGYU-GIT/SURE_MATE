# Sure-Mate 프로젝트 규칙

설계: `docs/superpowers/specs/2026-11-05-sure-mate-design.md` · 결정 기록: `docs/decisions.md`

## 기억에 의존하면 틀리기 쉬운 최신 변화

- Electron 44부터 clipboard가 W3C 방식으로 바뀌었다. renderer에서 못 쓰고(main 전용), `read`/`write`/`readText`/`writeText`가 Promise를 돌려주며, `write()`는 `ClipboardItem[]`를 받는다. `readHTML`·`readRTF`·`readImage`·`availableFormats`·`readBuffer`·`writeBuffer`는 없어졌다. OS 고유 형식은 `'electron application/osclipboard;format="<이름>"'`로 다룬다. Electron 44부터 Windows 32비트(ia32) 빌드도 없다.
- koffi 3.x는 네이티브 바이너리가 플랫폼별 선택 패키지(`@koromix/koffi-win32-x64`)로 나뉘었고 포인터가 BigInt다. `JSON.stringify`가 BigInt에서 실패하므로 HWND는 IPC·저장 전에 10진 문자열로 바꾼다.
- Electron 맞춤법 검사기는 기본으로 켜져 있고 사전을 Google CDN에서 내려받는다. 모든 창에서 `spellcheck: false`.
- Electron `globalShortcut`은 Windows에서 RegisterHotKey를 쓰고, 이미 다른 앱이 잡은 조합이면 `register()`가 false를 돌려줄 뿐 오류를 내지 않는다. 누르고 있으면 콜백이 반복된다.
- 좌표: Electron `screen`·BrowserWindow는 DIP, koffi로 얻는 Win32 좌표는 물리 픽셀. 변환은 `src/main/native/coords.ts`에서만 한다.

## 버전 고정

Electron 45.x(정확한 버전), electron-builder 26.18.x, koffi 3.x, cmdk 1.1.1, es-hangul 2.4.x. x64만 빌드.

## 규칙

- 모든 BrowserWindow: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `spellcheck: false`.
- 앱은 네트워크 요청을 보내지 않는다. 외부 폰트·CDN 금지.
- 로그에는 선택한 글·클립보드·프롬프트·가명 대응표 내용을 남기지 않는다(길이만).
- 순수 로직은 작은 모듈로 나누고 Vitest로 먼저 테스트한다(`npm test`).
- 셸은 PowerShell이다(`&&` 대신 `;` 또는 `if ($?)`).
- **익명 유지:** 코드·설정·설치 파일·커밋에 실명을 넣지 않는다. 작성자 표기는 "Sure-Mate".

## 실행 환경 함정

- Claude Code(VS Code 확장)에서 띄운 셸에는 `ELECTRON_RUN_AS_NODE=1`이 넘어와 Electron이 일반 Node로 실행된다(`app`이 undefined). 앱을 실행할 때는 이 변수를 지운다. 예: `cmd /c "set ELECTRON_RUN_AS_NODE=& npm run dev"`.
