# M1 팔레트 뼈대·네이티브 검증 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 단축키로 뜨는 팔레트 뼈대를 만들고, 한글 입력·창 제어·선택 텍스트 가져오기·붙여넣기·설치 파일이 회사 PC에서 될지 실제로 검증한다.

**Architecture:** electron-vite(main/preload/renderer) 구조. 순수 로직(단축키 규칙, 중복 실행 방지, 좌표 계산, 설정 병합, 클립보드 판단)은 `src/shared`·`src/main/**`의 작은 모듈로 나눠 Vitest로 검증하고, Win32 호출은 `src/main/native/`의 koffi 바인딩 뒤에 숨긴다. 검증용 기능은 팔레트의 "개발:" 명령으로 노출한다.

**Tech Stack:** Electron 45.x, electron-vite, React, TypeScript, Tailwind CSS v4, cmdk 1.1.1, koffi 3.x, Vitest, electron-builder 26.18.x

**Spec:** `docs/superpowers/specs/2026-11-05-sure-mate-design.md` (§0, §5, §6, §10, §15, §16, §18)

**다음 단계(이 계획 밖):** M2 템플릿·프롬프트·AI 대상 → M3 가명 처리 → M4 용어 사전·사이드 패널·상용구 → M5 워크스페이스 → M6 말하듯 입력·설정·온보딩·파일 가명 처리. M1 보고를 받은 뒤 각각 계획을 쓴다.

## Global Constraints

- Electron `45.x` 정확한 버전 고정(`-E`), electron-builder `26.18.x`, koffi `3.x`, cmdk `1.1.1`. x64만 빌드.
- 모든 BrowserWindow: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `spellcheck: false`.
- 앱은 네트워크 요청을 보내지 않는다. renderer CSP: `default-src 'self'; style-src 'self' 'unsafe-inline'`.
- clipboard는 main 프로세스에서만, Electron 44+ 비동기 API(`clipboard.read/write/readText/writeText`, `ClipboardItem`)로 쓴다.
- HWND는 koffi에서 BigInt로 나온다. IPC·로그·JSON에는 10진 문자열로만 넘긴다.
- 좌표: Electron `screen`·BrowserWindow는 DIP, koffi Win32는 물리 픽셀. 변환은 `screen.dipToScreenRect`/`screenToDipRect`로 `src/main/native/coords.ts`에서만 한다.
- 기본 단축키: 팔레트 `Ctrl+Alt+Space`, 조회 `Ctrl+Alt+W`. 단축키 반복 무시 250ms, 같은 항목 중복 실행 방지 300ms, 표시 직후 blur 무시 150ms.
- 데이터 폴더: `app.getPath('userData')` = `%APPDATA%\Sure-Mate`(앱 이름 `Sure-Mate`). 로그에는 선택한 글·클립보드 내용을 남기지 않는다(길이만).
- package.json `author`·설치 파일 게시자·copyright는 `Sure-Mate`. 실명 금지.
- 셸은 PowerShell(`&&` 대신 `;`).
- 각 태스크 끝에 커밋한다. 브랜치는 `m1-shell`. 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- 단축키를 누르고 있거나(자동 반복) 빠르게 두 번 누르면 팔레트가 깜빡이지 않고 한 번만 반응해야 한다 → Task 3 `HotkeyManager` 반복 무시 테스트.
- 붙여넣기·포커스 복귀 직전에 대상 창이 닫혔거나 관리자 권한 창이면 앱이 죽지 않고 "복사만" 안내로 끝나야 한다 → Task 9 `pasteDecision` 테스트.
- 아무것도 선택하지 않고 가져오기를 하면 제한 시간 안에 `text: null`로 끝나고 클립보드는 그대로여야 한다 → Task 9 `shouldRestoreClipboard`·`captureDecision` 테스트.
- `settings.json`이 깨졌거나 사람이 잘못 고쳤으면 기본값으로 뜨고 원본은 옆에 남아야 한다 → Task 4 테스트.
- 배율이 다른 모니터에서 팔레트를 띄워도 크기가 720×460 DIP로 유지돼야 한다 → Task 2 `needsResize` 테스트 + Task 5 수동 확인.

---

### Task 1: 저장소와 데스크톱 뼈대

**Files:**
- Create: `SURE/.gitignore`, `SURE/README.md`, `SURE/CLAUDE.md`, `SURE/docs/decisions.md`
- Create (scaffold): `SURE/desktop/**` (electron-vite react-ts)
- Create: `SURE/desktop/electron-builder.yml`, `SURE/desktop/vitest.config.ts`, `SURE/desktop/src/shared/smoke.test.ts`

**Interfaces:**
- Produces: `npm run dev`, `npm test`(vitest run), `npm run build:win` 스크립트. 경로 별칭 없음(상대 경로 import).

- [ ] **Step 1:** `SURE`에서 `git init`, 기본 브랜치 `main`. `.gitignore`: `node_modules/`, `out/`, `dist/`, `build/`, `*.log`, `.env*`.
- [ ] **Step 2:** `CLAUDE.md` 작성: 설계 문서 §0의 "최신 변화" 5개 항목 그대로, Global Constraints 요약, "익명 유지: 코드·설정·설치 파일에 실명 금지".
- [ ] **Step 3:** `SURE`에서 `npm create @quick-start/electron@latest desktop -- --template react-ts` 실행. 대화형 질문이 나오면 updater·mirror는 No. 대화형으로 막히면 electron-vite 공식 react-ts 템플릿 구조(main/preload/renderer, `electron.vite.config.ts`, tsconfig 3종)를 직접 만든다.
- [ ] **Step 4:** 버전 고정 설치(`desktop`에서): `npm i -D -E electron@45 electron-builder@26.18`, `npm i -E cmdk@1.1.1 koffi@3`, `npm i -D tailwindcss @tailwindcss/vite vitest`. 설치 전 목록을 사용자에게 보고한 상태여야 한다(이 계획 승인으로 갈음).
- [ ] **Step 5:** package.json: `"name": "sure-mate"`, `"productName": "Sure-Mate"`, `"author": "Sure-Mate"`, scripts `"test": "vitest run"`, `"build:win": "electron-vite build && electron-builder --win --x64"`. koffi가 main 번들에 들어가지 않고 external로 남는지 `electron.vite.config.ts` 확인.
- [ ] **Step 6:** `electron-builder.yml`: `appId: kr.suremate.app`, `productName: Sure-Mate`, `copyright: Sure-Mate`, `electronLanguages: [ko, en-US]`, `win.target: [{target: nsis, arch: [x64]}]`, `nsis: {oneClick: true, perMachine: false, artifactName: "Sure-Mate-Setup-${version}.${ext}"}`, `publish: null`.
- [ ] **Step 7:** Tailwind v4를 renderer에 연결(`@tailwindcss/vite` 플러그인, `@import "tailwindcss";`). `vitest.config.ts`: `environment: 'node'`, `include: ['src/**/*.test.ts']`.
- [ ] **Step 8:** `src/shared/smoke.test.ts`에 `expect(1 + 1).toBe(2)`. Run: `npm test` → Expected: 1 passed.
- [ ] **Step 9:** Run: `npm run dev` → Expected: 템플릿 창이 뜬다. 창 닫고 종료.
- [ ] **Step 10:** 커밋(`main`): `chore: 저장소와 electron-vite 뼈대`. 이어서 `git switch -c m1-shell`.

### Task 2: 순수 규칙 모듈 (중복 실행·IME·좌표·팔레트 규칙)

**Files:**
- Create: `desktop/src/shared/types.ts`, `desktop/src/shared/execution-guard.ts`, `desktop/src/shared/ime.ts`, `desktop/src/shared/geometry.ts`, `desktop/src/shared/palette-rules.ts`
- Test: 같은 이름의 `*.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  - `type Rect = { x: number; y: number; width: number; height: number }`
  - `interface MonitorInfo { id: string; bounds: Rect; workArea: Rect; scaleFactor: number; isPrimary: boolean; isInternal: boolean }` (DIP)
  - `interface WindowInfo { hwnd: string; title: string; className: string; exe: string; pid: number; rect: Rect; frame: Rect; minimized: boolean; maximized: boolean; cloaked: boolean; elevated: boolean | null; dpi: number }` (rect·frame은 물리 픽셀)
  - `type PaletteGroup = 'prompt' | 'command' | 'workspace' | 'snippet' | 'wiki'`
  - `interface PaletteItem { id: string; group: PaletteGroup; title: string; subtitle?: string; keywords?: string[] }`
  - `type MaskingMode = 'off' | 'restore' | 'remove'`
  - `interface CaptureResult { text: string | null; method: 'ctrl-insert' | 'ctrl-c' | 'none'; elapsedMs: number; restored: boolean; skipped?: 'terminal' | 'elevated' | 'no-foreground' }`
- Produces (함수):
  - `createExecutionGuard(windowMs: number, now?: () => number): (key: string) => boolean` — 마지막 **실행** 기준, `now - last < windowMs`이면 false
  - `createRepeatFilter(windowMs: number, now?: () => number): () => boolean` — 마지막 **수신** 기준, 호출될 때마다 기준 시각 갱신
  - `isImeComposing(e: { isComposing?: boolean; keyCode?: number }): boolean`
  - `leftHalf(area: Rect): Rect`, `frameInsets(windowRect: Rect, frameRect: Rect): { left: number; top: number; right: number; bottom: number }`, `applyFrameInsets(target: Rect, insets): Rect`, `pickOtherMonitor(monitors: MonitorInfo[], currentId: string): MonitorInfo | null`, `rectDiff(a: Rect, b: Rect): number`(네 값 차이의 최대 절댓값)
  - `palettePosition(workArea: Rect, size: { width: number; height: number }): Rect` — 가로 가운데, 위쪽 여백 `round(height × 0.22)`
  - `needsResize(actual: { width: number; height: number }, expected: { width: number; height: number }, tolerance: number): boolean`
  - `shouldHideOnBlur(shownAt: number, now: number, devToolsOpen: boolean): boolean` — 150ms 안이거나 DevTools가 열려 있으면 false

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// execution-guard.test.ts
it('같은 키는 300ms 안에 다시 실행하지 않는다', () => {
  let t = 1000
  const guard = createExecutionGuard(300, () => t)
  expect(guard('a')).toBe(true)
  t = 1299; expect(guard('a')).toBe(false)
  t = 1300; expect(guard('a')).toBe(true)
  expect(guard('b')).toBe(true)
})
it('자동 반복은 마지막 수신 뒤 250ms가 지나야 다시 통과한다', () => {
  let t = 0
  const pass = createRepeatFilter(250, () => t)
  const seen = [0, 100, 200, 449, 700].map((ms) => { t = ms; return pass() })
  expect(seen).toEqual([true, false, false, false, true])
})
// ime.test.ts
it('조합 중 판단', () => {
  expect(isImeComposing({ isComposing: true, keyCode: 13 })).toBe(true)
  expect(isImeComposing({ isComposing: false, keyCode: 229 })).toBe(true)
  expect(isImeComposing({ isComposing: false, keyCode: 13 })).toBe(false)
  expect(isImeComposing({})).toBe(false)
})
// geometry.test.ts
it('왼쪽 절반', () => {
  expect(leftHalf({ x: 1920, y: 0, width: 2560, height: 1400 })).toEqual({ x: 1920, y: 0, width: 1280, height: 1400 })
  expect(leftHalf({ x: 0, y: 0, width: 1365, height: 720 })).toEqual({ x: 0, y: 0, width: 682, height: 720 })
})
it('보이지 않는 테두리 보정', () => {
  const insets = frameInsets({ x: 93, y: 100, width: 814, height: 607 }, { x: 100, y: 100, width: 800, height: 600 })
  expect(insets).toEqual({ left: 7, top: 0, right: 7, bottom: 7 })
  expect(applyFrameInsets({ x: 0, y: 0, width: 960, height: 1040 }, insets)).toEqual({ x: -7, y: 0, width: 974, height: 1047 })
})
it('다른 모니터 고르기', () => {
  const m = (id: string, isPrimary: boolean) => ({ id, isPrimary, isInternal: false, scaleFactor: 1, bounds: { x: 0, y: 0, width: 1, height: 1 }, workArea: { x: 0, y: 0, width: 1, height: 1 } })
  expect(pickOtherMonitor([m('1', true), m('2', false)], '1')?.id).toBe('2')
  expect(pickOtherMonitor([m('1', true)], '1')).toBeNull()
})
it('rectDiff', () => {
  expect(rectDiff({ x: 0, y: 0, width: 100, height: 100 }, { x: 3, y: -2, width: 100, height: 108 })).toBe(8)
})
// palette-rules.test.ts
it('팔레트 위치', () => {
  expect(palettePosition({ x: 0, y: 0, width: 1920, height: 1040 }, { width: 720, height: 460 })).toEqual({ x: 600, y: 229, width: 720, height: 460 })
})
it('크기 재조정 필요 여부', () => {
  expect(needsResize({ width: 1080, height: 690 }, { width: 720, height: 460 }, 2)).toBe(true)
  expect(needsResize({ width: 721, height: 460 }, { width: 720, height: 460 }, 2)).toBe(false)
})
it('blur로 숨길지', () => {
  expect(shouldHideOnBlur(1000, 1100, false)).toBe(false)
  expect(shouldHideOnBlur(1000, 1150, false)).toBe(true)
  expect(shouldHideOnBlur(1000, 5000, true)).toBe(false)
})
```

- [ ] **Step 2:** Run: `npm test` → Expected: FAIL(모듈 없음).
- [ ] **Step 3:** 위 Interfaces의 시그니처대로 다섯 파일 구현.
- [ ] **Step 4:** Run: `npm test` → Expected: 모두 PASS.
- [ ] **Step 5:** 커밋 `feat: 팔레트 공통 규칙 모듈`.

### Task 3: 단축키 관리자

**Files:**
- Create: `desktop/src/main/hotkeys/accelerator-rules.ts`, `desktop/src/main/hotkeys/hotkey-manager.ts`
- Test: `desktop/src/main/hotkeys/accelerator-rules.test.ts`, `desktop/src/main/hotkeys/hotkey-manager.test.ts`

**Interfaces:**
- Consumes: `createRepeatFilter` (Task 2)
- Produces:
  - `checkAccelerator(accelerator: string): { level: 'ok' | 'warn' | 'block'; reason?: string }` — 대소문자 무시. block: `Super`/`Meta`/`Cmd`/`Command`/`AltGr` 포함, `F12` 포함, Ctrl·Alt 둘 다 없음. warn: `Alt+Space`, `Ctrl+Space`, `Ctrl+Shift+Space`.
  - `interface ShortcutBackend { register(acc: string, cb: () => void): boolean; unregister(acc: string): void }`
  - `type HotkeyId = 'palette' | 'lookup'`
  - `type BindResult = { ok: true } | { ok: false; reason: 'in-use' | 'blocked'; detail?: string }`
  - `class HotkeyManager { constructor(backend: ShortcutBackend, now?: () => number); bind(id: HotkeyId, acc: string, handler: () => void): BindResult; rebind(id: HotkeyId, acc: string): BindResult; suspendAll(): void; resumeAll(): { failed: HotkeyId[] }; current(id: HotkeyId): string | undefined }` — 각 handler는 `createRepeatFilter(250)`로 감싼다. rebind 실패 시 이전 조합을 다시 등록한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// accelerator-rules.test.ts
it('규칙', () => {
  expect(checkAccelerator('Ctrl+Alt+Space')).toEqual({ level: 'ok' })
  for (const a of ['Super+Space', 'Ctrl+F12', 'AltGr+K', 'K', 'Shift+K']) expect(checkAccelerator(a).level).toBe('block')
  for (const a of ['Alt+Space', 'ctrl+space', 'Ctrl+Shift+Space']) expect(checkAccelerator(a).level).toBe('warn')
})
// hotkey-manager.test.ts
class FakeBackend implements ShortcutBackend {
  taken = new Set<string>(); registered = new Map<string, () => void>()
  register(acc: string, cb: () => void) { if (this.taken.has(acc) || this.registered.has(acc)) return false; this.registered.set(acc, cb); return true }
  unregister(acc: string) { this.registered.delete(acc) }
  fire(acc: string) { this.registered.get(acc)?.() }
}
it('다른 앱이 쓰는 조합이면 in-use', () => {
  const b = new FakeBackend(); b.taken.add('Alt+Space')
  expect(new HotkeyManager(b).bind('palette', 'Alt+Space', () => {})).toEqual({ ok: false, reason: 'in-use' })
})
it('막힌 조합은 등록을 시도하지 않는다', () => {
  const b = new FakeBackend(); const r = new HotkeyManager(b).bind('palette', 'Super+Space', () => {})
  expect(r.ok).toBe(false); expect(b.registered.size).toBe(0)
})
it('rebind 실패하면 이전 조합으로 되돌린다', () => {
  const b = new FakeBackend(); const m = new HotkeyManager(b)
  m.bind('palette', 'Ctrl+Alt+Space', () => {}); b.taken.add('Alt+`')
  expect(m.rebind('palette', 'Alt+`').ok).toBe(false)
  expect(m.current('palette')).toBe('Ctrl+Alt+Space'); expect(b.registered.has('Ctrl+Alt+Space')).toBe(true)
})
it('누르고 있을 때의 반복은 무시한다', () => {
  let t = 0; const b = new FakeBackend(); const m = new HotkeyManager(b, () => t); let n = 0
  m.bind('palette', 'Ctrl+Alt+Space', () => n++)
  for (const ms of [0, 100, 200, 449, 700]) { t = ms; b.fire('Ctrl+Alt+Space') }
  expect(n).toBe(2)
})
it('suspendAll 뒤 resumeAll은 다시 등록하고 실패한 id를 알려 준다', () => {
  const b = new FakeBackend(); const m = new HotkeyManager(b)
  m.bind('palette', 'Ctrl+Alt+Space', () => {}); m.bind('lookup', 'Ctrl+Alt+W', () => {})
  m.suspendAll(); expect(b.registered.size).toBe(0)
  b.taken.add('Ctrl+Alt+W'); expect(m.resumeAll()).toEqual({ failed: ['lookup'] })
})
```

- [ ] **Step 2:** Run: `npm test` → Expected: FAIL.
- [ ] **Step 3:** 두 파일 구현.
- [ ] **Step 4:** Run: `npm test` → Expected: PASS.
- [ ] **Step 5:** 커밋 `feat: 단축키 관리자(충돌 확인·되돌리기·반복 무시)`.

### Task 4: 설정 저장소

**Files:**
- Create: `desktop/src/main/settings/settings-store.ts`
- Test: `desktop/src/main/settings/settings-store.test.ts`

**Interfaces:**
- Consumes: `MaskingMode` (Task 2)
- Produces:
  - `interface Settings { version: 1; hotkeys: { palette: string; lookup: string }; palette: { display: 'cursor' | 'primary' | 'active' }; launchAtLogin: boolean; masking: { mode: MaskingMode }; onboardingDone: boolean }`
  - `const DEFAULT_SETTINGS: Settings = { version: 1, hotkeys: { palette: 'Ctrl+Alt+Space', lookup: 'Ctrl+Alt+W' }, palette: { display: 'cursor' }, launchAtLogin: true, masking: { mode: 'restore' }, onboardingDone: false }`
  - `mergeSettings(raw: unknown): Settings` — 키별로 타입이 맞는 값만 받고 나머지는 기본값
  - `loadSettings(dir: string): Promise<Settings>` — 없으면 기본값, JSON이 깨졌으면 `settings.corrupt-<epochMs>.json`으로 옮기고 기본값
  - `saveSettings(dir: string, s: Settings): Promise<void>` — `settings.json.tmp`에 쓰고, 기존 파일을 `settings.json.bak`으로 복사한 뒤 rename

- [ ] **Step 1: 실패하는 테스트 작성** (`fs.mkdtemp(os.tmpdir())`로 임시 폴더)

```ts
it('파일이 없으면 기본값', async () => { expect(await loadSettings(dir)).toEqual(DEFAULT_SETTINGS) })
it('일부만 있으면 기본값과 합친다', async () => {
  await writeFile(join(dir, 'settings.json'), JSON.stringify({ hotkeys: { palette: 'Alt+`' } }))
  const s = await loadSettings(dir)
  expect(s.hotkeys.palette).toBe('Alt+`'); expect(s.hotkeys.lookup).toBe('Ctrl+Alt+W')
})
it('타입이 틀린 값은 기본값', async () => {
  await writeFile(join(dir, 'settings.json'), JSON.stringify({ launchAtLogin: 'yes', masking: { mode: 'weird' } }))
  const s = await loadSettings(dir)
  expect(s.launchAtLogin).toBe(true); expect(s.masking.mode).toBe('restore')
})
it('깨진 JSON은 옆으로 옮기고 기본값', async () => {
  await writeFile(join(dir, 'settings.json'), '{oops')
  expect(await loadSettings(dir)).toEqual(DEFAULT_SETTINGS)
  expect((await readdir(dir)).some((f) => /^settings\.corrupt-\d+\.json$/.test(f))).toBe(true)
})
it('저장은 원자적이고 이전 파일을 .bak으로 남긴다', async () => {
  await saveSettings(dir, DEFAULT_SETTINGS)
  await saveSettings(dir, { ...DEFAULT_SETTINGS, onboardingDone: true })
  expect(JSON.parse(await readFile(join(dir, 'settings.json'), 'utf8')).onboardingDone).toBe(true)
  expect(JSON.parse(await readFile(join(dir, 'settings.json.bak'), 'utf8')).onboardingDone).toBe(false)
  expect(await readdir(dir)).not.toContain('settings.json.tmp')
})
```

- [ ] **Step 2:** Run: `npm test` → Expected: FAIL.
- [ ] **Step 3:** 구현.
- [ ] **Step 4:** Run: `npm test` → Expected: PASS.
- [ ] **Step 5:** 커밋 `feat: 설정 저장소(기본값 병합·원자적 저장·깨진 파일 보관)`.

### Task 5: 팔레트 창·트레이·단일 실행·포커스 복귀 (main)

**Files:**
- Create: `desktop/src/main/windows/palette-window.ts`, `desktop/src/main/tray.ts`, `desktop/src/main/log.ts`, `desktop/src/main/ipc.ts`, `desktop/src/shared/ipc-channels.ts`, `desktop/src/preload/index.ts`, `desktop/src/preload/api.d.ts`
- Create (임시, Task 8에서 교체): `desktop/src/main/native/foreground.ts` — `getForegroundWindow(): string | null`, `setForeground(hwnd: string): boolean` (koffi 최소 바인딩)
- Modify: `desktop/src/main/index.ts`

**Interfaces:**
- Consumes: `HotkeyManager`(Task 3), `loadSettings`/`saveSettings`(Task 4), `palettePosition`/`needsResize`/`shouldHideOnBlur`(Task 2)
- Produces:
  - `createPaletteWindow(): BrowserWindow` — 옵션: `width: 720, height: 460, show: false, frame: false, type: 'toolbar', skipTaskbar: true, resizable: false, backgroundThrottling: false, roundedCorners: true, backgroundMaterial: 'acrylic'`, `webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }`
  - `showPalette(payload?: ShownPayload): void` — 직전 HWND 저장 → 표시 모니터(설정 `palette.display`) → `palettePosition` → `setBounds` → `show()` → `getBounds()`가 `needsResize(…, 2)`이면 한 번 더 `setBounds` → `webContents.send('palette:shown', payload)`
  - `hidePalette(opts: { restoreFocus: boolean }): void` — 숨긴 뒤 `restoreFocus`면 저장해 둔 HWND로 `setForeground`
  - `getPreviousHwnd(): string | null`
  - `type ShownPayload = { mode: 'search' } | { mode: 'dev-output'; title: string; text: string }`
  - IPC(`ipc-channels.ts`): `palette:shown`(main→renderer), `palette:hide`, `palette:run-item`(renderer→main, `itemId: string`), `app:get-status`(→ `{ paletteHotkey: string; maskingMode: MaskingMode }`)
  - preload: `window.sureMate = { hide(): void; runItem(id: string): Promise<void>; getStatus(): Promise<{ paletteHotkey: string; maskingMode: MaskingMode }>; onShown(cb: (p: ShownPayload) => void): () => void }`
  - `log(event: string, data?: Record<string, unknown>): void` — `logs/YYYY-MM-DD.log`에 JSON 한 줄씩 추가

- [ ] **Step 1:** `index.ts`: `app.setName('Sure-Mate')`, `app.setAppUserModelId('kr.suremate.app')`, `requestSingleInstanceLock()`(실패하면 quit, `second-instance`에서 `showPalette()`), `whenReady`에서 설정 로드 → 팔레트 창 생성 → 트레이 → `HotkeyManager`에 `globalShortcut` 백엔드로 `palette` 바인드(토글: 보이면 숨기고 아니면 표시). 등록 실패 시 트레이 풍선 알림(`tray.displayBalloon`)으로 "단축키 X는 다른 앱이 사용 중" 표시. `--hidden` 인자가 있어도 동작은 같다(창은 처음부터 숨김). `setLoginItemSettings({ openAtLogin: settings.launchAtLogin, args: ['--hidden'] })`.
- [ ] **Step 2:** blur 처리: `blur` 이벤트에서 `shouldHideOnBlur(shownAt, Date.now(), webContents.isDevToolsOpened())`가 true면 `hidePalette({ restoreFocus: false })`.
- [ ] **Step 3:** 트레이 메뉴: "팔레트 열기", "가명 처리: 되돌리기"(M1에선 표시만), "단축키 일시 중지"(`suspendAll`/`resumeAll` 토글), "종료". 툴팁: `Sure-Mate · 팔레트 Ctrl+Alt+Space`.
- [ ] **Step 4:** Run: `npm run dev` → 확인: (a) 메모장에 포커스를 둔 채 `Ctrl+Alt+Space` → 팔레트가 마우스 있는 모니터 위쪽 22% 지점에 뜸 (b) Esc(Task 6 전에는 트레이 "팔레트 열기"로 확인) 또는 바깥 클릭 시 숨고 메모장에 포커스가 돌아와 바로 타자 가능 (c) 키를 누르고 있어도 한 번만 반응 (d) 앱을 두 번 실행하면 두 번째는 종료되고 팔레트가 뜸 (e) 배율이 다른 모니터로 마우스를 옮겨 띄워도 크기 720×460 DIP 유지(로그의 bounds 확인).
- [ ] **Step 5:** 커밋 `feat: 팔레트 창·트레이·단일 실행·포커스 복귀`.

### Task 6: 팔레트 화면 (cmdk, 한글 입력 규칙, 상태 표시줄)

**Files:**
- Create: `desktop/src/renderer/src/palette/Palette.tsx`, `desktop/src/renderer/src/palette/StatusBar.tsx`, `desktop/src/renderer/src/palette/DevOutput.tsx`, `desktop/src/renderer/src/palette/mock-items.ts`, `desktop/src/renderer/src/palette/filter-items.ts`
- Test: `desktop/src/renderer/src/palette/filter-items.test.ts` (vitest include에 `src/renderer/**/*.test.ts` 추가)
- Modify: `desktop/src/renderer/src/App.tsx`, `desktop/src/renderer/index.html`(CSP), `desktop/src/main/ipc.ts`

**Interfaces:**
- Consumes: `window.sureMate`(Task 5), `PaletteItem`·`isImeComposing`·`createExecutionGuard`(Task 2)
- Produces:
  - `filterItems(items: PaletteItem[], query: string): PaletteItem[]` — M1 임시: 소문자 비교로 title·keywords 포함 여부, 빈 검색어면 전체. M3·M6에서 랭커로 교체.
  - `MOCK_ITEMS: PaletteItem[]` — 구역별 2~3개(프롬프트 "회의록 정리", 워크스페이스 "QA 모드", 상용구 "결함 리포트", 위키 "MC/DC" 등) + Task 7~9의 개발 명령 id: `dev.imeLogger`, `dev.listWindows`, `dev.moveToOtherMonitor`, `dev.pasteTest`, `dev.clipboardExcludeTest`
  - 구역 순서와 이름: 프롬프트, 명령, 워크스페이스, 상용구, 위키

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('빈 검색어면 전체', () => { expect(filterItems(MOCK_ITEMS, '')).toHaveLength(MOCK_ITEMS.length) })
it('제목과 키워드에서 대소문자 무시로 찾는다', () => {
  const items = [{ id: 'w', group: 'wiki', title: 'MC/DC', keywords: ['커버리지'] }] as PaletteItem[]
  expect(filterItems(items, 'mc/dc').map((i) => i.id)).toEqual(['w'])
  expect(filterItems(items, '커버')).toHaveLength(1)
  expect(filterItems(items, '없는말')).toHaveLength(0)
})
```

- [ ] **Step 2:** Run: `npm test` → Expected: FAIL.
- [ ] **Step 3:** `filter-items.ts`, `mock-items.ts` 구현 → `npm test` PASS.
- [ ] **Step 4:** `Palette.tsx`: cmdk `Command`(`shouldFilter={false}`, `loop`), 입력값은 controlled `query`, 목록은 `useDeferredValue(query)`로 `filterItems`. `onShown`에서 query 초기화·입력 포커스. `onKeyDown`: `isImeComposing(e.nativeEvent)`면 아무것도 하지 않음, `e.code === 'Escape'`면 입력 blur 후 `sureMate.hide()`. `onSelect`는 `createExecutionGuard(300)` 통과 시에만 `sureMate.runItem(id)`. `ShownPayload.mode === 'dev-output'`이면 `DevOutput`(제목 + `<pre>` 스크롤)을 보여 주고 Esc로 닫는다.
- [ ] **Step 5:** `StatusBar.tsx`: `getStatus()`로 "가명 처리: 되돌리기 · 팔레트 Ctrl+Alt+Space". 모드가 `off`면 주황색.
- [ ] **Step 6:** `index.html` CSP를 Global Constraints 값으로. Tailwind로 어두운 배경(아크릴이 안 될 때도 읽히도록 `bg-zinc-900/90`), 선택 항목 강조.
- [ ] **Step 7:** Run: `npm run dev` → 확인: (a) "회의록" 한글 입력 후 바로 Enter → 콘솔 로그에 `runItem` 한 번만 (b) "mc" 입력 시 MC/DC 표시 (c) Esc로 닫히고 원래 창 포커스 복귀 (d) 다시 열면 검색어가 비어 있음.
- [ ] **Step 8:** 커밋 `feat: 팔레트 화면(cmdk·한글 조합 처리·상태 표시줄)`.

### Task 7: 한글 입력 기록기

**Files:**
- Create: `desktop/src/renderer/src/ime-logger/ImeLogger.tsx`, `desktop/src/main/windows/ime-logger-window.ts`
- Modify: `desktop/src/renderer/src/App.tsx`(해시 `#/ime-logger`면 기록기), `desktop/src/main/ipc.ts`(`dev.imeLogger` 실행 시 창 열기)

**Interfaces:**
- Consumes: `palette:run-item`(Task 5)
- Produces: `openImeLoggerWindow(): BrowserWindow` — 일반 창(프레임 있음, 800×600, `spellcheck: false`). 화면: 입력칸 1개, 기록 표(시각 ms, type, key, code, keyCode, isComposing, data, inputType, value), [JSON 복사] [지우기] 버튼. 기록 대상: `keydown`, `keyup`, `compositionstart`, `compositionupdate`, `compositionend`, `beforeinput`, `input`.

- [ ] **Step 1:** 구현.
- [ ] **Step 2:** Run: `npm run dev` → 팔레트에서 "개발: 한글 입력 기록기" 실행 → 확인: "가나" 입력 중 '나'를 조합하는 상태에서 Enter·↓·Esc·Tab·Space를 하나씩 누르며 기록이 쌓인다. Windows 설정 > 한국어 IME > "이전 버전의 Microsoft IME 사용" 켜고 끈 두 상태 모두 기록.
- [ ] **Step 3:** 두 상태의 JSON을 `docs/reports/ime-log-new.json`, `docs/reports/ime-log-legacy.json`으로 저장하고, Enter가 조합 중에 몇 번(keydown 몇 개, isComposing 값) 들어오는지 `docs/decisions.md`에 한 줄로 결론("현재 isComposing||229 처리로 충분 / pendingEnter 필요").
- [ ] **Step 4:** 커밋 `feat: 한글 입력 기록기와 IME 이벤트 기록`.

### Task 8: 창 목록·창 옮기기 (koffi)

**Files:**
- Create: `desktop/src/main/native/win32.ts`(바인딩), `desktop/src/main/native/windows.ts`, `desktop/src/main/native/coords.ts`, `desktop/src/main/dev/dev-commands.ts`
- Modify: `desktop/src/main/native/foreground.ts`(windows.ts로 흡수), `desktop/src/main/ipc.ts`

**Interfaces:**
- Consumes: `WindowInfo`·`MonitorInfo`·`leftHalf`·`frameInsets`·`applyFrameInsets`·`pickOtherMonitor`·`rectDiff`(Task 2), `showPalette`(Task 5), `log`(Task 5)
- Produces:
  - `win32.ts`: koffi 3로 user32(`EnumWindows`, `GetWindowTextW`, `GetClassNameW`, `IsWindowVisible`, `GetWindow`, `GetWindowLongPtrW`, `GetWindowThreadProcessId`, `GetForegroundWindow`, `SetForegroundWindow`, `ShowWindow`, `GetWindowPlacement`, `SetWindowPos`, `GetWindowRect`, `GetDpiForWindow`, `IsIconic`, `IsZoomed`), dwmapi(`DwmGetWindowAttribute`: `DWMWA_CLOAKED`=14, `DWMWA_EXTENDED_FRAME_BOUNDS`=9), kernel32(`OpenProcess` `PROCESS_QUERY_LIMITED_INFORMATION`=0x1000, `QueryFullProcessImageNameW`, `CloseHandle`), advapi32(`OpenProcessToken`, `GetTokenInformation` TokenElevation=20). 함수 시그니처는 koffi 3 문서(https://koffi.dev, 마이그레이션 가이드)를 확인하고 작성한다.
  - `windows.ts`: `listWindows(): WindowInfo[]`(보이고, 제목 있고, `WS_EX_TOOLWINDOW` 아니고, 소유자 없고, cloaked 아니고, 자기 프로세스 창이 아닌 것), `getWindowInfo(hwnd: string): WindowInfo | null`, `getForegroundWindow(): string | null`, `setForeground(hwnd: string): boolean`, `moveWindow(hwnd: string, targetPhysical: Rect): { before: Rect; after: Rect; steps: number }` — 최소화·최대화면 `ShowWindow(SW_RESTORE=9)` 먼저, 테두리 보정(`frameInsets`/`applyFrameInsets`), 대상 모니터 DPI가 현재와 다르면 ① 좌상단만 옮기고 ② 최종 크기로 한 번 더(`steps: 2`), `SWP_NOZORDER|SWP_NOACTIVATE`.
  - `coords.ts`: `toPhysical(dipRect: Rect): Rect`(`screen.dipToScreenRect(null, rect)`), `toDip(physicalRect: Rect): Rect`, `getMonitors(): MonitorInfo[]`(Electron `screen.getAllDisplays()`, `isInternal`은 `display.internal`)
  - `dev-commands.ts`: `runDevCommand(id: string): Promise<void>` — `dev.listWindows`: `listWindows()`를 표로 만들어 `showPalette({ mode: 'dev-output', … })` + 로그. `dev.moveToOtherMonitor`: `getPreviousHwnd()` 창을 `pickOtherMonitor`의 `leftHalf(workArea)`(DIP→물리)로 옮기고 before/after/목표와의 `rectDiff`(보이는 테두리 기준)를 출력.

- [ ] **Step 1:** `win32.ts`·`windows.ts`·`coords.ts` 구현. HWND는 BigInt → 10진 문자열.
- [ ] **Step 2:** Run: `npm run dev` → "개발: 창 목록" → 확인: 메모장·탐색기·Chrome 등이 실행 파일·제목·위치·DPI와 함께 나오고, 작업 표시줄·숨은 창·Sure-Mate 자신은 없다. 관리자 권한으로 띄운 메모장은 `elevated: true`.
- [ ] **Step 3:** 메모장을 최대화한 뒤 포커스 → 팔레트 → "개발: 직전 창을 다른 모니터 왼쪽 절반으로" → 확인: 다른 모니터 왼쪽 절반에 붙고 출력의 `rectDiff ≤ 10`. 배율이 다른 모니터 쪽(150%→100%, 100%→150%) 모두 시험해 `steps`와 diff를 기록. 모니터가 하나면 "다른 모니터 없음" 안내.
- [ ] **Step 4:** 결과(앱별·방향별 diff)를 `docs/reports/2026-11-08-m1-spike.md`의 "창 옮기기" 표에 적는다.
- [ ] **Step 5:** 커밋 `feat: 창 목록·창 옮기기(koffi, 배율 혼합 대응)`.

### Task 9: 선택 텍스트 가져오기·붙여넣기·클립보드 기록 제외

**Files:**
- Create: `desktop/src/main/native/input.ts`, `desktop/src/main/native/selection.ts`, `desktop/src/main/native/clipboard-logic.ts`
- Test: `desktop/src/main/native/clipboard-logic.test.ts`
- Modify: `desktop/src/main/native/win32.ts`(`SendInput`, `GetAsyncKeyState`, `GetClipboardSequenceNumber` 추가), `desktop/src/main/dev/dev-commands.ts`, `desktop/src/main/index.ts`(`lookup` 단축키 바인드)

**Interfaces:**
- Consumes: `getForegroundWindow`/`getWindowInfo`/`setForeground`(Task 8), `HotkeyManager`(Task 3), `CaptureResult`(Task 2), `showPalette`(Task 5)
- Produces:
  - `clipboard-logic.ts`: `isTerminalExe(exe: string): boolean`(경로에서 파일 이름만 비교, 대소문자 무시: `windowsterminal.exe`, `cmd.exe`, `powershell.exe`, `pwsh.exe`, `conhost.exe`, `openconsole.exe`, `mintty.exe`, `putty.exe`, `wsl.exe`), `shouldRestoreClipboard(seqAfterOurCopy: number, seqNow: number): boolean`, `captureDecision(target: WindowInfo | null): { action: 'capture' } | { action: 'skip'; reason: 'terminal' | 'elevated' | 'no-foreground' }`, `pasteDecision(target: { exists: boolean; elevated: boolean | null }): { action: 'paste' } | { action: 'copy-only'; reason: 'target-gone' | 'elevated' }`
  - `input.ts`: `waitModifiersReleased(timeoutMs: number): Promise<boolean>`(Ctrl·Alt·Shift·Win, 10ms 간격 폴링), `sendChord(keys: Array<'CONTROL' | 'SHIFT' | 'MENU' | 'INSERT' | 'C' | 'V'>): number`(눌렀다 역순으로 떼기, SendInput 반환값)
  - `selection.ts`: `captureSelection(opts?: { timeoutMs?: number }): Promise<CaptureResult>`(기본 500ms; 순서는 설계 문서 §10 그대로, 백업·복원은 text/plain·text/html·text/rtf·image/png만), `pasteText(hwnd: string, text: string): Promise<{ ok: boolean; reason?: string }>`(§10 붙여넣기 순서, 붙여넣기 뒤 자동 복원 안 함), `writeExcludedFromHistory(text: string): Promise<{ ok: boolean; error?: string }>`(`ClipboardItem`에 text/plain + `'electron application/osclipboard;format="ExcludeClipboardContentFromMonitorProcessing"'` 1바이트)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('터미널 판별', () => {
  for (const e of ['WindowsTerminal.exe', 'C:\\Windows\\System32\\cmd.exe', 'powershell.exe', 'pwsh.exe', 'conhost.exe', 'mintty.exe', 'putty.exe'])
    expect(isTerminalExe(e)).toBe(true)
  expect(isTerminalExe('WINWORD.EXE')).toBe(false)
})
it('사용자가 그사이 복사했으면 되돌리지 않는다', () => {
  expect(shouldRestoreClipboard(42, 42)).toBe(true)
  expect(shouldRestoreClipboard(42, 43)).toBe(false)
})
it('가져오기 대상 판단', () => {
  const w = (exe: string, elevated: boolean | null) => ({ exe, elevated } as WindowInfo)
  expect(captureDecision(null)).toEqual({ action: 'skip', reason: 'no-foreground' })
  expect(captureDecision(w('cmd.exe', false))).toEqual({ action: 'skip', reason: 'terminal' })
  expect(captureDecision(w('notepad.exe', true))).toEqual({ action: 'skip', reason: 'elevated' })
  expect(captureDecision(w('notepad.exe', false))).toEqual({ action: 'capture' })
})
it('붙여넣기 대상 판단', () => {
  expect(pasteDecision({ exists: false, elevated: null })).toEqual({ action: 'copy-only', reason: 'target-gone' })
  expect(pasteDecision({ exists: true, elevated: true })).toEqual({ action: 'copy-only', reason: 'elevated' })
  expect(pasteDecision({ exists: true, elevated: false })).toEqual({ action: 'paste' })
})
```

- [ ] **Step 2:** Run: `npm test` → Expected: FAIL.
- [ ] **Step 3:** `clipboard-logic.ts` 구현 → `npm test` PASS.
- [ ] **Step 4:** `input.ts`, `selection.ts` 구현. `lookup` 단축키(`Ctrl+Alt+W`) → `captureSelection()` → `showPalette({ mode: 'dev-output', title: '선택 텍스트 가져오기', text: <method·elapsedMs·restored·skipped + 앞 200자> })`. 로그에는 글자 수만. 개발 명령 `dev.pasteTest`: 직전 창에 "Sure-Mate 붙여넣기 시험 <시각>" 붙여넣기, `dev.clipboardExcludeTest`: 제외 표시를 단 글을 클립보드에 쓰고 "Win+V를 열어 기록에 없는지 확인하세요" 출력.
- [ ] **Step 5:** Run: `npm run dev` → 확인(각각 결과를 보고서 표에 기록): 메모장·Word·HWP·Chrome·Excel 셀에서 글을 선택하고 `Ctrl+Alt+W` → 글이 맞게 나오고 걸린 시간, 원래 클립보드(미리 복사해 둔 다른 글)가 돌아오는지. 아무것도 선택하지 않았을 때 500ms 안에 `text: null`이고 클립보드 그대로. 명령 프롬프트에서는 `skipped: terminal`. 메모장에 붙여넣기 시험이 한 번만 붙는지. Win+V 기록 제외 시험 결과.
- [ ] **Step 6:** 커밋 `feat: 선택 텍스트 가져오기·붙여넣기·클립보드 기록 제외 시험`.

### Task 10: 시험용 설치 파일과 M1 보고서

**Files:**
- Create: `docs/reports/2026-11-08-m1-spike.md`(Task 8·9에서 채운 표 포함), `docs/reports/company-pc-checklist.md`
- Modify: `docs/decisions.md`

**Interfaces:**
- Consumes: Task 1의 `build:win`

- [ ] **Step 1:** Run: `npm run build:win` → Expected: `desktop/dist/Sure-Mate-Setup-<version>.exe` 생성. 파일 크기 기록.
- [ ] **Step 2:** `desktop/dist/win-unpacked/resources/app.asar.unpacked` 아래에 koffi win32-x64 `.node`가 있는지 확인(`Get-ChildItem -Recurse -Filter *.node`). 없으면 electron-builder `asarUnpack`에 koffi 경로를 넣고 다시 빌드.
- [ ] **Step 3:** 설치 파일 실행 → 확인: UAC 창 없이 `%LOCALAPPDATA%\Programs\Sure-Mate`에 설치, 시작 메뉴 바로 가기 생성, 실행 후 `Ctrl+Alt+Space`·"개발: 창 목록"·`Ctrl+Alt+W`가 개발 모드와 같게 동작, 설정 > 앱에서 제거 후 폴더가 남지 않음(`%APPDATA%\Sure-Mate`는 남아도 됨). 설치 파일 속성의 게시자·저작권에 실명이 없는지 확인.
- [ ] **Step 4:** `company-pc-checklist.md`: 설계 문서 §20 "11/9 회사 PC 점검"을 체크 박스로 옮기고, 이번 빌드 기준으로 해 볼 순서(설치 → SmartScreen 반응 기록 → 단축키 → 창 목록·옮기기 → 앱별 선택 텍스트 → 붙여넣기 → Win+V 기록)를 적는다.
- [ ] **Step 5:** `2026-11-08-m1-spike.md` 마무리: 실행 화면 확인 결과, `npm test` 결과(통과 수), 한글 입력 기록 결론, 창 옮기기 표, 선택 텍스트 표, 클립보드 기록 제외 결과, 설치 파일 크기, 새로 보인 위험, M2 계획 초안 순서.
- [ ] **Step 6:** Run: `npm test` → Expected: 모두 PASS.
- [ ] **Step 7:** 커밋 `chore: 시험용 설치 파일 확인과 M1 보고서`. 사용자에게 보고하고 멈춘다(설계 문서 §18 8단계).
