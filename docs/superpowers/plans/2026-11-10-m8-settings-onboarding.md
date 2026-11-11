# M8 설정 창·온보딩 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지금 있는 기능의 사용자 설정을 모두 다루는 설정 창(F7)과 첫 실행 3단계 온보딩(F0)을 만들고, 트레이·바·바 메뉴·팔레트의 "설정"이 settings.json 대신 설정 창을 열게 한다.

**Architecture:** 판단은 순수 모듈에 둔다. 설정 패치 검사·적용은 `shared/settings/`, 단축키 바꾸기·녹화, 설정 서비스, 사용자 파일 저장(템플릿·기준 예시·가명 사전·용어 삭제)은 `main/` 아래 의존성 주입 모듈로 두고 가짜로 시험한다. 설정 창은 일반(포커스를 받는) Electron 창 하나로, 열 때 만들고 닫으면 없앤다(`#/settings`, 첫 실행은 같은 창의 `#/onboarding`). 설정 창 IPC는 그 창의 webContents가 보낸 것만 받는다. 화면은 왼쪽 탭 목록(등록표)과 오른쪽 내용이며, 바뀐 값은 그 자리에서 저장한다(바꾼 필드만 보내고 main이 파일을 다시 읽어 그 필드만 고친다 — 트레이·바 메뉴로 바꾼 값을 덮지 않는다).

**Tech Stack:** Electron 45, electron-vite, React 19, TypeScript, Tailwind v4 토큰(§14-4), Vitest, PowerShell 스모크(Windows)

**Spec:** `docs/superpowers/specs/2026-11-05-sure-mate-design.md` — §5(창·로컬 파일), §6(단축키 규칙·온보딩), §7(템플릿 필드·자리표시자·기준 예시·AI 대상), §8(분류·사전·사내 도메인·표기·보관 시간), §9(용어 사전), §14(F7 설정 탭), §14-1(바 설정 항목), §14-4(디자인), §16(키보드만으로 사용, 원자적 저장, 로그, 메모리) · `docs/decisions.md`

## Global Constraints

- 앱은 네트워크 요청을 보내지 않는다. 설정 창도 CSP·`sandbox:true`·`contextIsolation:true`·`spellcheck:false`를 쓴다. AI 주소는 http/https만 받는다(`isOpenableUrl`).
- 설정 창 IPC는 설정 창 webContents가 보낸 것만 받는다(`ipc.ts`의 `sentBy`와 같은 방식). renderer가 보낸 값은 모두 main에서 다시 검사한다.
- 로그에는 id·개수·길이·종류만 남긴다. 사내 도메인, 가명 사전 이름, 템플릿 본문, 기준 예시 글, 용어·설명, 사용자 AI 주소는 남기지 않는다.
- 사용자 파일 저장은 원자적(임시 파일 → 디스크 반영 → 이름 바꾸기, EPERM·EBUSY·EACCES면 50·100·200·400ms 다시 시도)이며, 읽을 때 문제가 있었던 파일은 처음 저장하기 전에 `<이름>.broken-<시각>` 사본을 남긴다(용어 파일과 같은 규칙).
- 한글 입력 규칙(§6): 조합 중에는 Enter·화살표·Tab으로 동작하지 않고, 키는 `e.code`+보조키로 비교한다. 입력칸의 저장은 조합이 끝난 뒤(blur 또는 조합 아닌 Enter).
- 설정 창은 키보드만으로 모든 항목을 쓸 수 있다(§16): 탭 목록은 ↑↓·Home·End, 내용은 Tab 순서, 보이는 포커스 링.
- 디자인 토큰(§14-4)만 쓴다. 새 화면 전 디자인 스킬을 부른다(CLAUDE.md). 이 세션에서 쓸 수 있는 것은 frontend-design뿐이며 없는 스킬은 사용자에게 알린다.
- 시험·미리 보기 자료는 가상 이름만(가상자동차, XY방산).
- 펫·워크스페이스·말하듯 입력 탭은 이 계획에 없다(M6·M7이 회사에서 진행 중). 탭 등록표에 한 줄을 더하면 붙도록 만든다.
- 라이트 테마(Should 12)·설정 전체 내보내기(Should 11)는 하지 않는다.
- Win32·창 동작은 Windows 스모크(t19)로 확인한다.

## Review Focus

1. **단축키 녹화가 끝나지 않는 경우:** 녹화 중 Esc, 창 닫기, 녹화 칸을 벗어남, 30초 동안 아무 키도 없음, 등록 실패 → 모든 전역 단축키가 다시 살아 있고 이전 조합이 그대로다. → Task 5 테스트.
2. **설정 창이 열린 채 다른 곳에서 바꾼 값:** 트레이·바 메뉴·팔레트 명령으로 가명 처리 모드나 바 모양을 바꾼 뒤 설정 창에서 다른 항목을 바꾸면, 앞서 바꾼 값이 되돌아가지 않고 설정 창 화면도 새 값으로 바뀐다. → Task 1·4 테스트.
3. **renderer가 보낸 잘못된 값:** 알 수 없는 키, 범위를 벗어난 숫자, 경로 문자가 든 기준 예시 종류, 너무 긴 목록·글, http/https가 아닌 주소 → 저장하지 않고 이유를 돌려준다. → Task 1·8·9·10 테스트.
4. **손으로 고친 사용자 파일:** 깨진 `templates/*.json`·`masking-dictionary.json`이 있거나 다른 이름의 개인 템플릿 파일이 있을 때 설정 창에서 저장해도 그 파일들의 항목을 잃지 않는다(깨진 파일은 사본, 다른 파일은 건드리지 않음). → Task 8·9 테스트.
5. **온보딩을 끝내지 않은 첫 실행:** 온보딩 창을 닫거나 앱을 끝내면 다음 실행 때 다시 뜨고, 그동안에도 팔레트 단축키는 후보 중 비어 있는 첫 조합으로 등록돼 있다. → Task 12 테스트.

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `shared/settings/settings.ts` | `Settings` 타입·`DEFAULT_SETTINGS`를 main에서 옮긴다(화면도 같은 타입). `main/settings/settings-store.ts`는 다시 내보낸다 |
| `shared/settings/settings-patch.ts` | 설정 창이 보내는 패치의 타입·검사·적용 |
| `shared/masking/mask.ts`(수정) | 빼기 모드 표기를 옵션으로 받는다 |
| `main/settings/settings-service.ts` | 설정 창의 읽기·패치 저장·바뀜 알림, 저장 뒤 실행 중 반영(자동 실행) |
| `main/hotkeys/hotkey-change.ts` | 조합 검사, 녹화(모든 단축키 잠시 해제·되살리기), 바꾸기·실패 되돌리기·저장, 온보딩 후보 |
| `main/files/atomic-write.ts` | 원자적 저장·다시 시도·깨진 파일 사본(용어 저장에서 꺼낸다) |
| `main/prompts/personal-templates.ts` | 내 템플릿 파일(`templates/my-templates.json`) 저장·삭제, 팩 가져오기·내보내기 |
| `main/prompts/references.ts`(수정) | 기준 예시 문서 목록·저장·삭제 |
| `main/masking/dictionary-store.ts`(수정) | 가명 사전 저장, 가져오기·내보내기 |
| `main/glossary/glossary-runtime.ts`(수정) | 내 용어 삭제 |
| `main/windows/settings-window.ts` | 설정 창 만들기·하나만 열기·닫으면 없애기, 경로 바꾸기 |
| `main/settings/settings-ipc.ts` | `settings:*` IPC(설정 창이 보낸 것만) |
| `renderer/src/settings/*` | 설정 창 화면(탭 등록표, 탭별 화면, 입력 도우미) |
| `renderer/src/onboarding/*` | 온보딩 3단계 |
| `renderer/src/preview/scenes.tsx`(수정) | 설정·온보딩 미리 보기 장면 |
| `scripts/smoke/t19-settings.ps1`, `t19-run.ps1` | Windows 스모크 |

## IPC 계약 (모든 채널은 설정 창 webContents만)

- `settings:get` → `SettingsSnapshot`
- `settings:update(patch: unknown)` → `{ ok: true; snapshot: SettingsSnapshot } | { ok: false; errors: string[] }`
- `settings:changed` (main → 설정 창) `SettingsSnapshot` — 어디서든 설정이 바뀌면
- `settings:hotkey-check(id, acc)` → `HotkeyCheck`, `settings:hotkey-record(on: boolean)`, `settings:hotkey-set(id, acc)` → `HotkeySetResult`
- `settings:templates`·`settings:template-save(draft)`·`settings:template-delete(id)`·`settings:template-import`·`settings:template-export`
- `settings:references`·`settings:reference-save(kind, text)`·`settings:reference-delete(kind)`
- `settings:dictionary`·`settings:dictionary-save(terms)`·`settings:dictionary-import`·`settings:dictionary-export`
- `settings:glossary`·`settings:glossary-save(draft, o)`·`settings:glossary-delete(id)`·`settings:glossary-import`·`settings:glossary-export`
- `settings:open-file(which: 'settings' | 'logs')`, `onboarding:progress`(main → 창), `onboarding:finish`, `settings:open-onboarding`

`SettingsSnapshot = { settings: Settings; aiTargets: AiTarget[]; hotkeys: Record<HotkeyId, { acc: string | null; registered: boolean }>; displays: { id: string; label: string; primary: boolean }[]; prompts: { id: string; name: string }[]; packaged: boolean }`

---

### Task 1: 설정 타입 옮기기와 패치 검사

**Files:**
- Create: `desktop/src/shared/settings/settings.ts`, `desktop/src/shared/settings/settings-patch.ts`
- Modify: `desktop/src/main/settings/settings-store.ts`(타입·기본값을 shared에서 가져와 다시 내보냄)
- Test: `desktop/src/shared/settings/settings-patch.test.ts`

**Interfaces:**
- Produces: `Settings`·`DEFAULT_SETTINGS`(shared), `type SettingsPatch = { palette?: { display }; launchAtLogin?: boolean; onboardingDone?: boolean; masking?: Partial<{ mode; categories: Partial<Record<MaskCategory, boolean>>; internalDomains: string[]; ttlHours: number; removeLabels: Partial<Record<MaskCategory, string>> }>; ai?: Partial<{ defaultTarget: string; custom: AiTarget[] }>; bar?: Partial<Omit<BarSettings, 'positions'>> }`, `validateSettingsPatch(raw: unknown, cur: Settings): { ok: true; patch: SettingsPatch } | { ok: false; errors: string[] }`, `applySettingsPatch(cur: Settings, patch: SettingsPatch): Settings`, `SETTINGS_LIMITS = { internalDomains: 50, domainLength: 253, ttlHours: { min: 1, max: 72 }, customTargets: 10, targetName: 40, removeLabel: 20 }`

- [ ] **Step 1: 실패하는 테스트**
  - 알 수 없는 최상위 키(`hotkeys`, `version`, `foo`)·알 수 없는 하위 키 → `ok:false`, 오류 글에 키 이름
  - `palette.display`가 `cursor|primary|active` 밖, `masking.mode` 밖, `ttlHours` 0·73·1.5, `bar.opacity` 0.5, `bar.wikiCardWidth` 600, `bar.pinnedPrompts` 6개·없는 템플릿 id 허용(존재 검사는 화면 몫)·65자 id → `ok:false`
  - `internalDomains`: `'Example.COM '` → `'example.com'`(앞뒤 공백 제거·소문자), 중복 제거, `'http://a.com'`·`'a'`·`'a..com'`·51개 → `ok:false`
  - `ai.custom`: 이름 41자, 주소 `file:///c:/x`·`javascript:x`, 기본 대상 id(`claude`)와 같은 id, 11개 → `ok:false`. 주소가 없으면 "복사만" 대상으로 받는다
  - `ai.defaultTarget`: 같은 패치의 `custom`까지 더한 목록에 없는 id → `ok:false`
  - `removeLabels`: 빈 글·21자·줄바꿈·`{`·`}` → `ok:false`
  - `applySettingsPatch`: 패치에 없는 필드는 `cur` 그대로(특히 `bar.positions`, `hotkeys`, `masking.mode`를 안 보낸 패치가 모드를 바꾸지 않음), `categories`는 보낸 분류만 바꾼다
- [ ] **Step 2: 실패 확인** — `npx vitest run src/shared/settings` → FAIL(모듈 없음)
- [ ] **Step 3: 구현** — 검사 규칙은 `settings-store.ts`의 `mergeSettings`·`sanitizeBarSettings`·`sanitizeAiTargets`·`BAR_LIMITS`와 같은 값을 쓴다(한쪽에서 가져다 쓴다, 따로 적지 않는다).
- [ ] **Step 4: 통과** — 같은 명령 PASS, `npm test`, `npm run typecheck`
- [ ] **Step 5: 커밋** — `feat: 설정 창이 보내는 값의 검사와 적용`

### Task 2: 빼기 모드 표기 바꾸기

**Files:**
- Modify: `desktop/src/shared/masking/mask.ts`, `desktop/src/shared/settings/settings.ts`(`masking.removeLabels`, 기본 `{}`), `desktop/src/main/settings/settings-store.ts`(`mergeSettings` 검사), 가명 처리 호출부(`masking-service.ts`)
- Test: `desktop/src/shared/masking/mask.test.ts`, `desktop/src/main/settings/settings-store.test.ts`

**Interfaces:**
- Produces: `MaskOptions.removeLabels?: Partial<Record<MaskCategory, string>>`, `removeModeNotice(labels)`(머리말 예시 글이 바뀐 표기를 쓴다)

- [ ] **Step 1: 실패하는 테스트** — `removeLabels: { client: '협력사', ip: '[주소]' }`면 빼기 모드 결과가 `협력사A`, `협력사B`, `[주소]`이고 나머지는 기본 표기; 되돌리기 모드 토큰(`CLIENT_A`)은 그대로; 머리말이 `'협력사A', '[주소]'`를 예로 든다; `mergeSettings`는 잘못된 표기(빈 글·21자·줄바꿈)를 버리고 나머지를 지킨다.
- [ ] **Step 2: 실패 확인** — FAIL
- [ ] **Step 3: 구현** — 표기 표는 기본값에 사용자 값을 덮어 만든다. 되돌리기 토큰은 바꾸지 않는다(되돌리기가 이 토큰을 찾는다).
- [ ] **Step 4: 통과** — PASS, `npm test`
- [ ] **Step 5: 커밋** — `feat: 빼기 모드 표기를 설정으로 바꾸기`

### Task 3: 원자적 저장 꺼내기

**Files:**
- Create: `desktop/src/main/files/atomic-write.ts`
- Modify: `desktop/src/main/glossary/glossary-store.ts`(꺼낸 함수를 쓴다)
- Test: `desktop/src/main/files/atomic-write.test.ts`

**Interfaces:**
- Produces: `writeFileAtomic(path: string, text: string, o?: { fs?: AtomicFs; sleep?: (ms: number) => Promise<void> }): Promise<void>`, `keepBrokenCopy(path: string, now: Date, fs?): Promise<string | null>`(사본 이름, 원본이 없으면 null)

- [ ] **Step 1: 실패하는 테스트** — 임시 파일 이름이 겹치지 않음; 이름 바꾸기가 EPERM이면 50·100·200·400ms 뒤 다시 시도해 성공; 다섯 번째 실패는 던지고 임시 파일을 지움; ENOSPC는 바로 던짐; 사본 이름이 `<이름>.broken-YYYYMMDD-HHmmss`이고 원본은 그대로. 기존 `glossary-store.test.ts`가 그대로 통과.
- [ ] **Step 2: 실패 확인** — FAIL
- [ ] **Step 3: 구현** — `glossary-store.ts`의 저장·다시 시도·사본 코드를 옮긴다(동작 같음).
- [ ] **Step 4: 통과** — PASS, `npm test`
- [ ] **Step 5: 커밋** — `refactor: 원자적 저장과 깨진 파일 사본을 함께 쓰는 모듈로`

### Task 4: 설정 서비스

**Files:**
- Create: `desktop/src/main/settings/settings-service.ts`
- Test: `desktop/src/main/settings/settings-service.test.ts`

**Interfaces:**
- Consumes: Task 1 `validateSettingsPatch`·`applySettingsPatch`, `settingsWriter.change`
- Produces: `createSettingsService(d: { current(): Settings; change(update: (cur: Settings) => Settings): Promise<void>; aiTargets(s: Settings): AiTarget[]; hotkeys(): SettingsSnapshot['hotkeys']; displays(): SettingsSnapshot['displays']; prompts(): SettingsSnapshot['prompts']; packaged(): boolean; setLoginItem(open: boolean): void; log(event, data): void }): { snapshot(): SettingsSnapshot; update(raw: unknown): Promise<UpdateResult>; changed(): void; onChanged(cb: (s: SettingsSnapshot) => void): () => void }`

- [ ] **Step 1: 실패하는 테스트** — `update`는 검사 실패면 `change`를 부르지 않고 오류를 돌려준다; 성공하면 `change`에 넘긴 함수가 그때의 `cur`(다른 곳에서 바뀐 값 포함)에 패치만 덮는다; `launchAtLogin`이 바뀌고 `packaged()`면 `setLoginItem`을 부른다(아니면 부르지 않음); 로그에는 바뀐 필드 이름만(`settings.update { fields: ['bar.opacity'] }`, 값 없음); `changed()`는 구독자에게 새 스냅숏을 보낸다.
- [ ] **Step 2: 실패 확인** — FAIL
- [ ] **Step 3: 구현** — `index.ts`의 `applySettings`가 끝에 `settingsService.changed()`를 부르게 연결하는 일은 Task 6에서 한다.
- [ ] **Step 4: 통과** — PASS
- [ ] **Step 5: 커밋** — `feat: 설정 창의 읽기·저장·바뀜 알림`

### Task 5: 단축키 바꾸기와 녹화

**Files:**
- Create: `desktop/src/main/hotkeys/hotkey-change.ts`
- Modify: `desktop/src/main/hotkeys/hotkey-manager.ts`(필요하면 `tryRegister(acc): boolean` — 등록해 보고 바로 푼다)
- Test: `desktop/src/main/hotkeys/hotkey-change.test.ts`

**Interfaces:**
- Consumes: `HotkeyManager`(`rebind`, `suspendAll`, `resumeAll`, `current`), `checkAccelerator`
- Produces: `type HotkeyCheck = { level: 'ok' | 'warn' | 'block' | 'in-use' | 'same-as-other'; reason?: string }`, `type HotkeySetResult = { ok: true; acc: string; warning?: string } | { ok: false; reason: string }`, `createHotkeyChanger(d: { manager; save(id: HotkeyId, acc: string): Promise<void>; timers: Timers; log }): { check(id, acc): HotkeyCheck; startRecording(): void; stopRecording(): void; set(id, acc): Promise<HotkeySetResult>; candidates(): { acc: string; available: boolean; suggested: boolean }[]; dispose(): void }`, `RECORD_TIMEOUT_MS = 30000`, `ONBOARDING_CANDIDATES = ['Alt+Space', 'Ctrl+Alt+Space', 'Alt+`']`

- [ ] **Step 1: 실패하는 테스트**(가짜 등록부)
  - `check`: Win 조합·F12·오른쪽 Alt/Ctrl 조합 → block, `Ctrl+Space` → warn(IDE 자동완성), 다른 앱이 잡은 조합 → in-use, 다른 단축키와 같은 조합 → same-as-other
  - `startRecording` → 모든 단축키 해제, `stopRecording` → 되살림; 두 번 시작해도 한 번 되살림; 30초 동안 멈추지 않으면 저절로 되살림; `dispose`도 되살림
  - `set` 성공 → 새 조합 등록·`save` 호출·결과 ok(warn이면 `warning`); in-use → 이전 조합이 그대로 등록돼 있고 `save` 없음; 녹화 중 `set` → 먼저 되살린 뒤 바꾼다
  - `candidates`: `Alt+Space`는 비어 있을 때만 후보, 제안은 `Ctrl+Alt+Space`(쓰는 중이면 `Alt+``)
- [ ] **Step 2: 실패 확인** — FAIL
- [ ] **Step 3: 구현** — 로그 `hotkey.change { id, ok, reason }`(조합 글은 남겨도 된다: 사용자 글이 아님).
- [ ] **Step 4: 통과** — PASS
- [ ] **Step 5: 커밋** — `feat: 단축키 녹화와 바꾸기, 실패하면 되돌리기`

### Task 6: 설정 창과 IPC 연결

**Files:**
- Create: `desktop/src/main/windows/settings-window.ts`, `desktop/src/main/settings/settings-ipc.ts`
- Modify: `desktop/src/main/index.ts`, `desktop/src/preload/index.ts`, `desktop/src/shared/ipc-channels.ts`, `desktop/src/renderer/src/App.tsx`(경로 `#/settings`·`#/onboarding`), `desktop/src/main/windows/overlay-window.ts`의 `RendererRoute`
- Test: `desktop/src/main/windows/settings-window.test.ts`(창 옵션), `desktop/src/main/settings/settings-ipc.test.ts`

**Interfaces:**
- Produces: `settingsWindowOptions(preload: string, route: '/settings' | '/onboarding'): BrowserWindowConstructorOptions`(설정 880×640·최소 720×520, 온보딩 640×560 고정, `show:false`, `titleBarStyle:'hidden'`, `titleBarOverlay`(색은 토큰 `--surface-palette-solid`·`--text-2`, 높이 40), `backgroundColor:'#1E212A'`, `autoHideMenuBar:true`, sandbox·contextIsolation·`spellcheck:false`), `openSettingsWindow(route): void`(이미 열려 있으면 그 경로로 바꾸고 앞으로), `settingsContentsId(): number | null`, `registerSettingsIpc(d: SettingsIpcDeps)`, preload `window.sureMate.settings.*`

- [ ] **Step 1: 실패하는 테스트** — 창 옵션 값; IPC는 다른 webContents가 보낸 요청에 `ok:false`(handle)·무시(on); `settings:update`가 서비스의 `update`에 그대로 넘김; `hotkey-set`의 id가 `palette|lookup` 밖이면 거절.
- [ ] **Step 2: 실패 확인** — FAIL
- [ ] **Step 3: 구현** — 창이 `closed`되면 녹화를 멈추게 `hotkeyChanger.stopRecording()`(Review Focus 1). `applySettings` 끝에서 `settingsService.changed()`. 아직 탭 화면은 빈 뼈대(제목만).
- [ ] **Step 4: 통과** — PASS, `npm test`, `npm run typecheck`, `npx electron-vite build`
- [ ] **Step 5: 커밋** — `feat: 설정 창과 설정 IPC`

### Task 7: 설정 화면 뼈대와 일반·AI 대상·바 탭

**Files:**
- Create: `desktop/src/renderer/src/settings/SettingsApp.tsx`, `tabs.ts`(등록표), `GeneralTab.tsx`, `AiTab.tsx`, `BarTab.tsx`, `controls.tsx`(토글·라디오 묶음·슬라이더·목록 편집 공통), `settings-state.ts`, `pinned-prompts.ts`
- Modify: `renderer/src/preview/fake-api.ts`·`scenes.tsx`
- Test: `settings-state.test.ts`, `pinned-prompts.test.ts`, `tabs.test.ts`

**Interfaces:**
- Produces: `SETTINGS_TABS: { id: SettingsTabId; label: string; render(): JSX.Element }[]`(순서: 일반, 단축키, AI 대상, 프롬프트·상용구, 가명 처리, 용어 사전, 바), `settingsReducer`(스냅숏 받기·저장 중·저장 결과·오류), `pinnedPromptsReducer`(더하기 5개까지·빼기·위아래 옮기기·없는 템플릿 표시)

- [ ] **Step 1: 디자인 방향** — frontend-design: 팔레트와 같은 토큰, 왼쪽 탭 목록(너비 200), 제목 줄은 창 끌기 영역, 항목은 "이름 + 한 줄 설명 + 조작"의 행, 저장 결과는 화면 아래 조용한 상태 줄. 행 높이·간격은 메뉴(§14-4)와 같은 4의 배수.
- [ ] **Step 2: 실패하는 테스트** — 탭 등록표 순서와 id가 겹치지 않음; 탭 목록 키보드(↑↓ 이동, Home·End, 조합 중 무시); 저장 실패면 화면 값을 마지막 스냅숏으로 되돌리고 오류를 보임; `settings:changed`가 오면 편집 중이 아닌 칸만 새 값으로; 고정 프롬프트 6번째 더하기 거절·옮기기 끝에서 멈춤.
- [ ] **Step 3: 실패 확인** — FAIL
- [ ] **Step 4: 구현** — 일반: 팔레트 표시 모니터, 로그인 시 자동 실행(개발 실행이면 "설치본에서만 적용" 안내), 처음 안내 다시 보기, 설정 파일 열기·로그 폴더 열기. AI 대상: 기본 대상 라디오, 사용자 대상 더하기·고치기·지우기(이름·주소, 주소 없으면 복사만). 바: 모양·가장자리·모니터·고정 프롬프트(5개까지, 순서)·자동 숨김·투명도·위키 카드 너비·숨김 시간·세로 위치 처음으로. 미리 보기 장면 `settings-general`, `settings-ai`, `settings-bar`.
- [ ] **Step 5: 통과·화면 확인** — PASS, `npm test`, `npm run typecheck`, 미리 보기 캡처(배율 1·1.25·1.5)
- [ ] **Step 6: 커밋** — `feat: 설정 화면 뼈대와 일반·AI 대상·바`

### Task 8: 가명 처리 탭과 가명 사전 편집

**Files:**
- Create: `renderer/src/settings/MaskingTab.tsx`, `DictionaryEditor.tsx`, `domains.ts`
- Modify: `main/masking/dictionary-store.ts`(저장·가져오기·내보내기), `settings-ipc.ts`
- Test: `domains.test.ts`, `dictionary-store.test.ts`

**Interfaces:**
- Produces: `saveMaskDictionary(userDir: string, terms: unknown, now: Date): Promise<{ ok: true; count: number } | { ok: false; errors: string[] }>`, `parseDomainsInput(text: string): { domains: string[]; invalid: string[] }`

- [ ] **Step 1: 실패하는 테스트** — 사전 저장은 `parseMaskDictionary`로 다시 검사(분류 밖·빈 이름 거절), 원자적, 읽을 때 오류가 있던 파일은 사본; 가져오기는 사전 파일 형식만(다른 형식·5MB 넘음 거절); 내보내기 파일에 사전 그대로; 도메인 입력 쉼표·줄바꿈 나누기, 잘못된 것 따로.
- [ ] **Step 2: 실패 확인** — FAIL
- [ ] **Step 3: 구현** — 탭: 기본 모드(세 행 설명은 메뉴와 같은 글), 분류별 켜기·끄기(사전 4·패턴 5), 사내 도메인, 대응표 보관 시간(1~72시간), 빼기 표기 9개, 사전 편집(목록·더하기·고치기·지우기, 분류·이름·별칭), 사전 가져오기·내보내기(내보내기 전 "고객사 목록이 들어 있으니 사내에서만 공유" 확인). 미리 보기 장면 `settings-masking`.
- [ ] **Step 4: 통과·화면 확인** — PASS, 캡처
- [ ] **Step 5: 커밋** — `feat: 가명 처리 설정과 가명 사전 편집`

### Task 9: 프롬프트·상용구 탭(목록·편집기)

**Files:**
- Create: `main/prompts/personal-templates.ts`, `renderer/src/settings/PromptsTab.tsx`, `TemplateEditor.tsx`, `template-editor.ts`
- Modify: `settings-ipc.ts`, `index.ts`(저장 뒤 템플릿 캐시 무효화·바 다시 그림)
- Test: `personal-templates.test.ts`, `template-editor.test.ts`

**Interfaces:**
- Produces: `MY_TEMPLATES_FILE = 'my-templates.json'`, `savePersonalTemplate(userDir, draft: unknown, now): Promise<{ ok: true; id: string } | { ok: false; errors: string[] }>`, `deletePersonalTemplate(userDir, id, now)`, `insertPlaceholder(body: string, caret: number, token: string): { body: string; caret: number }`, `previewTemplate(t: Template, terms, references): FillResult`(가짜 입력은 가상 회의 메모)

- [ ] **Step 1: 실패하는 테스트** — 저장은 `parseTemplatePack`으로 검사하고 `templates/my-templates.json`에만 쓴다(다른 개인 파일 그대로); 기본 템플릿을 고치면 같은 id로 내 파일에 저장(기본값 덮기), 지우면 기본값으로 돌아감; 다른 개인 파일의 템플릿은 "복사해서 고치기"만(새 id); 내 파일이 깨져 있으면 사본 뒤 저장; 자리표시자 넣기는 커서 자리에, 선택한 글을 바꿈; 미리 보기는 모르는 자리표시자를 경고로.
- [ ] **Step 2: 실패 확인** — FAIL
- [ ] **Step 3: 구현** — 목록(기본·내 것·가져온 것 표시, 검색), 편집기(이름·별칭·종류·묶음·설명·본문·자리표시자 단추·가명 기본값·AI 대상·미리 보기), 저장·지우기·기본값으로. 저장하지 않고 다른 항목으로 가면 묻는다. 미리 보기 장면 `settings-prompts`, `settings-prompt-edit`.
- [ ] **Step 4: 통과·화면 확인** — PASS, 캡처
- [ ] **Step 5: 커밋** — `feat: 프롬프트·상용구 목록과 편집기`

### Task 10: 기준 예시 문서와 템플릿 팩 가져오기·내보내기

**Files:**
- Modify: `main/prompts/references.ts`, `main/prompts/personal-templates.ts`, `renderer/src/settings/PromptsTab.tsx`, `settings-ipc.ts`
- Create: `renderer/src/settings/ReferencesPanel.tsx`
- Test: `references.test.ts`, `personal-templates.test.ts`

**Interfaces:**
- Produces: `listReferenceKinds(templates: Template[], userData): { kind: string; length: number | null; usedBy: string[] }[]`, `saveReference(userData, kind, text): Promise<{ ok: true } | { ok: false; reason: string }>`(종류 규칙은 `readReference`의 KIND, 20,000자 넘으면 거절, 4,000자 넘으면 경고만), `deleteReference`, `importTemplatePack(userDir, text): { added: number; replaced: number; errors: string[] }`, `exportTemplatePack(templates): string`

- [ ] **Step 1: 실패하는 테스트** — 종류 이름에 `..`·`/`·`\`·`:` → 거절; 템플릿 본문의 `{{reference:회의록}}`이 목록에 사용처와 함께; 저장 원자적; 가져오기는 `imported` 범위로 별도 파일(`imported-<시각>.json`)에, 같은 id면 "바꿈"으로 셈; 내보내기는 내 템플릿만 팩 형식.
- [ ] **Step 2: 실패 확인** — FAIL
- [ ] **Step 3: 구현** — 대화상자는 부모 창을 설정 창으로. 미리 보기 장면 `settings-references`.
- [ ] **Step 4: 통과·화면 확인** — PASS, 캡처
- [ ] **Step 5: 커밋** — `feat: 기준 예시 문서와 템플릿 팩 가져오기·내보내기`

### Task 11: 용어 사전 탭

**Files:**
- Create: `renderer/src/settings/GlossaryTab.tsx`
- Modify: `main/glossary/glossary-runtime.ts`(`remove(id)`), `main/glossary/pack-commands.ts`(대화상자 부모 창을 받을 수 있게), `settings-ipc.ts`
- Test: `glossary-runtime.test.ts`

**Interfaces:**
- Produces: `GlossaryRuntime.remove(id: string): Promise<{ ok: true } | { ok: false; reason: 'builtin' | 'missing' | 'save-failed' }>`

- [ ] **Step 1: 실패하는 테스트** — 내 용어·가져온 용어는 지움, 기본 용어는 `builtin`으로 거절(기본 용어를 고친 내 사본을 지우면 기본으로 돌아감), 없는 id는 `missing`, 저장 실패는 던지지 않고 `save-failed`, 로그는 id만.
- [ ] **Step 2: 실패 확인** — FAIL
- [ ] **Step 3: 구현** — 목록(출처 표시, 검색은 기존 랭커), 더하기·고치기(팔레트 `WikiEdit`의 폼 규칙을 함께 씀), 지우기(확인), 용어 팩 가져오기·내보내기 단추. 미리 보기 장면 `settings-glossary`.
- [ ] **Step 4: 통과·화면 확인** — PASS, 캡처
- [ ] **Step 5: 커밋** — `feat: 설정의 용어 사전`

### Task 12: 단축키 탭과 온보딩

**Files:**
- Create: `renderer/src/settings/HotkeysTab.tsx`, `renderer/src/settings/accelerator-input.ts`, `renderer/src/onboarding/Onboarding.tsx`, `onboarding-state.ts`
- Modify: `main/index.ts`(첫 실행이면 온보딩, 프롬프트 실행 결과를 온보딩에 알림), `settings-ipc.ts`
- Test: `accelerator-input.test.ts`, `onboarding-state.test.ts`, `main/settings/first-run.test.ts`

**Interfaces:**
- Consumes: Task 5 `createHotkeyChanger`, Task 4 서비스
- Produces: `acceleratorFromKey(k: { code; ctrlKey; altKey; shiftKey; metaKey; isComposing }): { acc: string } | { pending: true } | { cancel: true } | { invalid: string }`, `onboardingReducer`(1 단축키 → 2 AI·가명 처리·자동 실행 → 3 따라 해 보기 → 끝), `shouldShowOnboarding(s: Settings, argv: string[]): boolean`

- [ ] **Step 1: 실패하는 테스트**
  - `acceleratorFromKey`: Ctrl+Alt+Space → `Ctrl+Alt+Space`, Alt+Backquote → ``Alt+` ``, 보조키만 → pending, Esc → cancel, Win(meta) → invalid, 조합 중 → pending, 보조키 없는 글자 → invalid("보조키와 함께")
  - 온보딩: 1단계는 고른 단축키 등록이 성공해야 다음, 2단계 기본값(제안 AI, 가명 후 되돌리기, 자동 실행 켬), 3단계는 해 보기 성공이나 "건너뛰기"로 끝, 뒤로 가면 고른 값이 남음
  - `shouldShowOnboarding`: `onboardingDone`이 false면 true(`--hidden`으로 시작해도 첫 실행은 띄운다), true면 false
- [ ] **Step 2: 실패 확인** — FAIL
- [ ] **Step 3: 구현** — 단축키 탭: 두 단축키의 지금 조합·등록 상태, "바꾸기" 누르면 녹화 칸(녹화 중 안내, Esc 취소), 경고·막힘·사용 중 안내를 그 자리에. 온보딩: ① 후보 3개(비어 있는지 표시, 제안 표시)와 직접 녹화, ② 주로 쓰는 AI·가명 처리 기본 모드·자동 실행, ③ 가상 회의 메모를 선택해 두고 "단축키 → 회의록 → Enter"를 따라 하면(앱이 `meeting-notes` 실행 결과를 알림) 완료 화면, 끝내면 `onboardingDone: true`. 미리 보기 장면 `settings-hotkeys`, `onboarding-1`~`3`.
- [ ] **Step 4: 통과·화면 확인** — PASS, 캡처
- [ ] **Step 5: 커밋** — `feat: 단축키 바꾸기 화면과 첫 실행 안내`

### Task 13: 설정 여는 곳 바꾸기

**Files:**
- Modify: `main/tray.ts`(설정… 항목), `main/index.ts`(`openSettings` → 설정 창), `main/bar/bar-actions.ts`, 팔레트 명령(`cmd.open-settings` "설정 열기"), `docs/decisions.md`
- Test: `tray.test.ts`(있으면)·`bar-actions.test.ts`·`palette-items.test.ts`

- [ ] **Step 1: 실패하는 테스트** — 트레이 메뉴에 "설정"이 "팔레트 열기" 다음; 팔레트 명령 `cmd.open-settings`가 검색 "설정"·"settings"로 맨 위; 바 설정 단추·바 메뉴 "설정 열기"가 `openSettingsWindow('/settings')`를 부름(파일 열기 아님).
- [ ] **Step 2: 실패 확인** — FAIL
- [ ] **Step 3: 구현** — settings.json 열기는 설정 창 일반 탭의 "설정 파일 열기"로만 남긴다.
- [ ] **Step 4: 통과** — PASS, `npm test`
- [ ] **Step 5: 커밋** — `feat: 트레이·바·팔레트에서 설정 창 열기`

### Task 14: Windows 스모크와 기록

**Files:**
- Create: `desktop/scripts/smoke/t19-settings.ps1`, `t19-run.ps1`
- Modify: `scripts/smoke/README.md`, `docs/decisions.md`, `docs/reports/company-pc-checklist.md`

- [ ] **Step 1: t19** — t19-run은 설정을 백업하고 `onboardingDone:false`로 시작 → 온보딩 창이 뜨는지(`settings.window { route: '/onboarding' }`) → 키보드로 1·2단계 진행(단축키 그대로, AI 복사만) → 3단계 건너뛰기 → `onboardingDone:true`; 팔레트 `>설정` → 설정 창(`settings.window { route: '/settings' }`), 앞 창이 설정 창; 키보드만으로 바 탭 → 투명도 줄이기 → settings.json·`bar.place` 다시 그림; 가명 처리 탭 → 모드 끔 → 트레이 툴팁 기록; 단축키 탭 → 팔레트 단축키를 ``Alt+` ``로 녹화 → 새 조합으로 팔레트가 뜸 → 원래대로; 녹화 중 창 닫기 → 단축키가 살아 있음(Review Focus 1); 설정 창 닫기 → Sure-Mate 프로세스 수가 열기 전과 같음(창을 없앰); 로그에 사용자 글 없음. 캡처: 탭마다 1장, 온보딩 3장.
- [ ] **Step 2: 실행** — Windows에서 `t19-run.ps1` 실행, 판정 줄 모두 True. 실패하면 앱·스크립트를 구분해 고친다.
- [ ] **Step 3: 기록** — README 표·확인 방법, 결정 기록(이 계획의 결정과 Ruling), 회사 PC 점검표(설정 창·온보딩 항목).
- [ ] **Step 4: 커밋** — `test: 설정 창·온보딩 스모크 시험과 기록`
