# M2 AI 프롬프트 팔레트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 팔레트에서 프롬프트를 고르면 선택한 글을 가져와 확인 화면을 보여 주고, Enter로 완성된 프롬프트를 클립보드에 넣고 AI 사이트를 연다. 팔레트는 v4 디자인 토큰과 Pretendard로 새로 입힌다.

**Architecture:** 템플릿 채우기·쿼리 해석·AI 대상 결정은 `src/shared/`의 순수 함수다. main의 프롬프트 세션(`src/main/prompts/`)이 선택 글 가져오기(M1 `captureSelection`)와 렌더·실행을 맡고, 주입식이라 가짜로 시험한다. renderer는 목록과 확인 화면만 그리고, 미리 보기는 IPC로 main에 요청한다(가명 처리가 M3에서 같은 자리에 끼어든다).

**Tech Stack:** Electron 45.2.3, React 19, TypeScript, Tailwind v4, cmdk 1.1.1, Vitest 5, Pretendard 1.3.9(woff2, SIL OFL)

**Spec:** `docs/superpowers/specs/2026-11-05-sure-mate-design.md` (v4) — §6 F0, §7 F1, §10, §14-4 디자인 시스템, §16

## Global Constraints

- 버전 고정: Electron 45.2.3, koffi 3.3.7, cmdk 1.1.1, electron-builder 26.18.0. 새 npm 패키지는 넣지 않는다(Pretendard는 파일로 넣는다).
- 앱은 네트워크 요청을 보내지 않는다. AI 사이트는 `shell.openExternal`로 기본 브라우저에서 연다(http/https만).
- 로그에는 선택한 글·클립보드·프롬프트 내용을 남기지 않는다(길이·id만). 오류 문구는 `errorText()`.
- 모든 창: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `spellcheck: false`. CSP `default-src 'self'`.
- 익명: 코드·리소스·커밋에 실명 금지. 작성자 "Sure-Mate".
- 순수 로직은 Vitest로 먼저(TDD). 셸은 PowerShell, 커밋 메시지는 파일로 `git commit -F`.
- 한글 입력: 조합 중(`isImeComposing`)에는 Enter·화살표·Tab으로 동작하지 않는다. 키 비교는 `e.code`(필요하면 `e.key`도).
- 디자인: §14-4 토큰만 쓴다(색·모서리·글자 크기). 다크 기본.
- 가명 처리는 M3. M2 확인 화면에는 가명 처리 칩을 그리지 않는다(켜진 것처럼 보이면 안 됨, §1 "실패로 보는 것").

## Review Focus

1. **조합 중 Enter**: 확인 화면 직접 입력칸에서 한글을 조합하다 Enter → 줄바꿈도 실행도 조합 확정 외에는 일어나지 않아야 한다. Ctrl+Enter도 조합 중이면 무시. → Task 8 리듀서 테스트.
2. **가져오기 실패**: 직전 창이 터미널·관리자 권한·사라짐·없음(트레이로 연 경우)이면 키를 보내지 않거나 무해하게 끝나고, 확인 화면이 이유를 보여 주며 클립보드 → 직접 입력 순으로 기본 출처를 고른다. → Task 5 테스트.
3. **아주 긴 입력**: 선택 글 10만 자 → 미리 보기·실행이 멈추지 않고, 2만 자 넘으면 경고. 미리 보기는 앞 4,000자만 그린다. → Task 5·8 테스트.
4. **자리표시자 경계**: 입력 글 안의 `{{clipboard}}` 같은 글자는 다시 채우지 않고, 모르는 자리표시자는 그대로 두고 경고, `{{selection}}`이 없는 템플릿은 경고. → Task 1 테스트.
5. **실행 중복**: 확인 화면에서 Enter를 빠르게 두 번 → 한 번만 복사·열기(300ms 실행 가드 + 세션 비움). → Task 5 테스트.

---

### Task 1: 템플릿 채우기 (순수)

**Files:**
- Create: `desktop/src/shared/template/types.ts`, `desktop/src/shared/template/fill.ts`
- Test: `desktop/src/shared/template/fill.test.ts`

**Interfaces:**
- Produces:
  - `type TemplateMasking = 'default' | 'off' | 'restore' | 'remove'`
  - `interface Template { id; name; aliases: string[]; kind: 'prompt' | 'snippet'; group?; description?; body; masking?: TemplateMasking; aiTarget?: string; scope: 'builtin' | 'personal' | 'imported' }` (§7 그대로)
  - `interface TermDef { term: string; definition: string }`
  - `interface FillContext { input: string; clipboard: string; now: Date; terms(input: string): TermDef[]; reference(kind: string): string | null }`
  - `fillTemplate(body: string, ctx: FillContext): { text: string; warnings: string[] }`

- [ ] **Step 1: 실패하는 테스트**

```ts
const ctx = (over: Partial<FillContext> = {}): FillContext => ({
  input: '본문', clipboard: '클립', now: new Date(2026, 10, 8, 14, 5), terms: () => [], reference: () => null, ...over
})
it('선택 글·날짜·시간을 채운다', () => {
  expect(fillTemplate('날짜 {{date}} {{time}}\n{{selection}}', ctx()).text).toBe('날짜 2026-11-08 14:05\n본문')
})
it('넣은 글 안의 자리표시자는 다시 채우지 않는다', () => {
  expect(fillTemplate('{{selection}}', ctx({ input: '{{clipboard}}' })).text).toBe('{{clipboard}}')
})
it('모르는 자리표시자는 두고 경고한다', () => {
  const r = fillTemplate('{{selection}} {{foo}}', ctx())
  expect(r.text).toBe('본문 {{foo}}'); expect(r.warnings).toContain('알 수 없는 자리표시자: {{foo}}')
})
it('{{terms}}에 넣을 용어가 없으면 그 줄을 뺀다', () => {
  expect(fillTemplate('가\n{{terms}}\n나 {{selection}}', ctx()).text).toBe('가\n나 본문')
})
it('용어가 있으면 머리말과 목록으로 채운다', () => {
  const r = fillTemplate('{{terms}}', ctx({ terms: () => [{ term: 'MC/DC', definition: '변경 조건/결정 커버리지' }] }))
  expect(r.text).toBe('다음은 우리 회사에서 쓰는 용어 뜻입니다.\n- MC/DC: 변경 조건/결정 커버리지')
})
it('기준 예시가 없으면 그 줄을 빼고 경고한다', () => {
  const r = fillTemplate('{{reference:회의록}}\n{{selection}}', ctx())
  expect(r.text).toBe('본문'); expect(r.warnings[0]).toContain('회의록')
})
it('중괄호 안 공백을 허용하고, {{selection}}이 없으면 경고한다', () => {
  expect(fillTemplate('{{ selection }}', ctx()).text).toBe('본문')
  expect(fillTemplate('고정 문장', ctx()).warnings).toContain('이 템플릿에는 {{selection}} 자리가 없어 입력한 글이 들어가지 않아요')
})
it('템플릿 줄바꿈 CRLF를 LF로 맞춘다', () => {
  expect(fillTemplate('a\r\n{{selection}}', ctx()).text).toBe('a\n본문')
})
```

- [ ] **Step 2: 실행해 실패 확인** — `npx vitest run src/shared/template/fill.test.ts` → FAIL(모듈 없음)
- [ ] **Step 3: 구현** — 본문 CRLF→LF, 줄 단위로 `{{terms}}`(용어 없음)·`{{reference:X}}`(없음) 줄을 먼저 빼고, 한 번의 `replace(/\{\{\s*([a-z]+)(?::([^}]*))?\s*\}\}/g, …)`로 채운다(넣은 글은 다시 훑지 않음). 날짜는 로컬 `YYYY-MM-DD`, 시간 `HH:mm`.
- [ ] **Step 4: 통과 확인** — 같은 명령 → PASS, 이어서 `npx vitest run`
- [ ] **Step 5: 커밋** — `feat: 템플릿 채우기(자리표시자, 용어 줄 빼기, 한 번에 채우기)`

### Task 2: 기본 프롬프트 팩 8종과 템플릿 불러오기

**Files:**
- Create: `desktop/resources/prompts.json`, `desktop/src/shared/template/pack.ts`, `desktop/src/main/prompts/template-store.ts`
- Test: `desktop/src/shared/template/pack.test.ts`, `desktop/src/main/prompts/template-store.test.ts`

**Interfaces:**
- Consumes: Task 1 `Template`
- Produces:
  - 팩 형식 `{ format: 'sure-mate-templates', version: 1, templates: Template[] }` (scope는 파일이 아니라 불러온 곳이 정함)
  - `parseTemplatePack(raw: unknown, scope: Template['scope']): { templates: Template[]; errors: string[] }`
  - `loadTemplates(userDir: string, builtin: unknown): Promise<{ templates: Template[]; errors: string[] }>` — 기본 팩 + `<userDir>/templates/*.json`(팩), 같은 id면 개인 것이 이긴다

- [ ] **Step 1: 실패하는 테스트**
  - `pack.test.ts`: 기본 팩(`resources/prompts.json` import)이 오류 없이 8개, id 중복 없음, 모두 `kind:'prompt'`, 모든 본문에 `{{selection}}`·`추측하지`·`초안`이 있음, 가명 기본값은 "표준·규격 조항 찾기"와 "협업 문서 요약(실명 유지)"만 `off`이고 나머지는 `restore`(§7 표).
  - 잘못된 항목(id 형식 `/^[a-z0-9][a-z0-9.-]{0,63}$/` 위반, 빈 이름, 41자 이상 이름, 2만 자 넘는 본문, 모르는 masking)은 건너뛰고 `errors`에 이유를 남긴다.
  - `template-store.test.ts`(임시 폴더): 개인 팩의 같은 id가 기본을 덮고, 깨진 JSON 파일은 건너뛰고 오류에 파일 이름을 남긴다.
- [ ] **Step 2: 실행해 실패 확인** — `npx vitest run src/shared/template src/main/prompts` → FAIL
- [ ] **Step 3: 구현** — `prompts.json`에 §7 표의 8종 초안을 쓴다. 각 본문은 역할 한 줄, 할 일, 출력 형식(표·목록), "모르면 모른다고 쓰고 추측하지 마세요", "결과는 사람이 검토할 초안입니다", `{{terms}}` 줄, 종류가 맞으면 `{{reference:<종류>}}` 줄, 마지막에 구분선과 `{{selection}}`. 별칭에 영문 입력용 단어도 하나씩 넣는다(예: 회의록 정리 → `meeting`). 정적분석·표준 조항 프롬프트는 출품 ②③ 원문이 되므로 형식을 가장 자세히 쓴다.
- [ ] **Step 4: 통과 확인** — 같은 명령 → PASS, `npx vitest run`
- [ ] **Step 5: 커밋** — `feat: 기본 프롬프트 팩 8종과 템플릿 불러오기`

### Task 3: AI 대상과 설정

**Files:**
- Create: `desktop/src/shared/ai-targets.ts`
- Modify: `desktop/src/main/settings/settings-store.ts` (설정에 `ai` 추가)
- Test: `desktop/src/shared/ai-targets.test.ts`, `desktop/src/main/settings/settings-store.test.ts`

**Interfaces:**
- Produces:
  - `interface AiTarget { id: string; name: string; url?: string }`
  - `BUILTIN_AI_TARGETS`: `claude`(https://claude.ai), `chatgpt`(https://chatgpt.com), `gemini`(https://gemini.google.com), `copy`(이름 "복사만", url 없음)
  - `isOpenableUrl(url: string): boolean` — http/https만
  - `allAiTargets(custom: AiTarget[]): AiTarget[]` — 기본 + 올바른 사용자 대상(id 중복이면 기본이 이김)
  - `pickAiTarget(o: { override?: string; template?: string; defaultId: string; targets: AiTarget[] }): AiTarget` — override > 템플릿 > 기본값 > `claude`
  - Settings: `ai: { defaultTarget: string; custom: AiTarget[] }`, 기본 `{ defaultTarget: 'claude', custom: [] }`

- [ ] **Step 1: 실패하는 테스트** — `isOpenableUrl('javascript:alert(1)')`·`file:///c:/x` false, https true; `pickAiTarget` 우선순위 3단계와 없는 id면 다음 단계로; 설정 병합에서 `custom`의 잘못된 url 항목 제거, `defaultTarget`이 목록에 없으면 `claude`.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/shared/ai-targets.test.ts src/main/settings` → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — PASS, `npx vitest run`
- [ ] **Step 5: 커밋** — `feat: AI 대상 목록과 기본 대상 설정`

### Task 4: 접두어 검색과 팔레트 항목

**Files:**
- Create: `desktop/src/shared/palette-query.ts`, `desktop/src/main/prompts/palette-items.ts`
- Modify: `desktop/src/renderer/src/palette/filter-items.ts`, `desktop/src/renderer/src/palette/Palette.tsx`, `desktop/src/shared/ipc-channels.ts`, `desktop/src/preload/index.ts`, `desktop/src/main/ipc.ts`
- Delete: `desktop/src/renderer/src/palette/mock-items.ts` (구역 정의는 `palette-query.ts`로)
- Test: `desktop/src/shared/palette-query.test.ts`, `desktop/src/main/prompts/palette-items.test.ts`, `desktop/src/renderer/src/palette/filter-items.test.ts`

**Interfaces:**
- Consumes: Task 2 `Template`
- Produces:
  - `PALETTE_GROUPS: { id: PaletteGroup; label: string }[]` (프롬프트·명령·워크스페이스·상용구·위키 순)
  - `parseQuery(q: string): { scope: PaletteGroup | null; text: string }` — `/` 프롬프트, `>` 명령, `?` 위키, `!` 상용구, `@` 워크스페이스. 전각(／＞？！＠)도 같다.
  - `filterItems(items, query)` — 범위를 먼저 거르고 제목·부제·키워드에서 찾음(M4에서 랭커로 교체)
  - `buildPaletteItems(templates: Template[], commands: PaletteItem[]): PaletteItem[]` — 프롬프트 id는 `prompt:<templateId>`, 부제는 description, 키워드는 별칭+그룹
  - IPC `palette:list-items` → `PaletteItem[]`, preload `listItems()`

- [ ] **Step 1: 실패하는 테스트** — `parseQuery('/회의')` → `{scope:'prompt', text:'회의'}`, `parseQuery('？mcdc')` → wiki, `parseQuery('회의')` → scope null; `filterItems`가 `/`로 명령을 빼고, 키워드로 찾음; `buildPaletteItems`가 템플릿 순서를 지키고 snippet은 상용구 구역으로.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/shared/palette-query.test.ts src/main/prompts/palette-items.test.ts src/renderer/src/palette` → FAIL
- [ ] **Step 3: 구현** — main은 시작할 때 템플릿을 불러 두고(`loadTemplates`), `palette:list-items`에 프롬프트와 개발 명령을 돌려준다. renderer는 팔레트가 보일 때마다 목록을 받아 그린다. M1 가짜 워크스페이스·상용구·위키 항목은 지운다.
- [ ] **Step 4: 통과 확인** — PASS, `npx vitest run`, `npm run typecheck`
- [ ] **Step 5: 커밋** — `feat: 접두어 검색과 실제 프롬프트 목록`

### Task 5: 프롬프트 세션 (필요할 때 선택 글 가져오기, 렌더, 실행)

**Files:**
- Create: `desktop/src/main/prompts/prompt-session.ts`
- Modify: `desktop/src/shared/ipc-channels.ts` (타입)
- Test: `desktop/src/main/prompts/prompt-session.test.ts`

**Interfaces:**
- Consumes: Task 1 `fillTemplate`, Task 3 `AiTarget`/`pickAiTarget`, M1 `CaptureResult`
- Produces (`ipc-channels.ts`):
  - `type PromptSource = 'selection' | 'clipboard' | 'input'`
  - `interface PromptDraft { templateId: string; name: string; group?: string; selection: { length: number; skipped?: CaptureSkipReason | 'nothing-selected' }; clipboardLength: number; defaultSource: PromptSource; targets: { id: string; name: string }[]; target: string }`
  - `interface PromptRequest { source: PromptSource; input?: string; target: string }`
  - `interface PromptPreview { text: string; truncated: boolean; inputLength: number; warnings: string[] }`
  - `interface PromptRunResult { ok: boolean; message: string }`
- Produces (`prompt-session.ts`): `createPromptSession(deps: PromptSessionDeps)` → `{ prepare(templateId): Promise<void>; preview(req): PromptPreview; run(req): Promise<PromptRunResult>; cancel(): void }`
  - deps: `findTemplate`, `hidePaletteAndRefocus(): Promise<boolean>`(직전 창이 없으면 false), `capture(): Promise<CaptureResult>`, `readClipboard(): Promise<string>`, `showConfirm(draft)`, `fill(template, input, clipboard)`, `writeClipboard(text)`, `openUrl(url): Promise<void>`, `notify(message)`, `log(event, data)`, `targets(): { list: AiTarget[]; defaultId: string }`, `now(): number`

- [ ] **Step 1: 실패하는 테스트 (가짜 deps)**
  - 선택 글을 가져오면 `defaultSource:'selection'`, 길이만 담긴 draft로 `showConfirm`.
  - 직전 창이 없으면 가져오기를 부르지 않는다. 터미널로 건너뛰면 `selection.skipped:'terminal'`, 클립보드가 있으면 기본 출처 `clipboard`, 둘 다 없으면 `input`.
  - `preview`는 고른 출처의 글로 채우고, 2만 자 넘으면 경고 `입력이 2만 자를 넘어요(…자). AI가 앞부분만 읽을 수 있어요`, 미리 보기 글은 4,000자에서 자르고 `truncated:true`.
  - `run`: 클립보드에 전체 프롬프트, `claude`면 그 url을 열고 알림 "복사했어요 · Claude를 열었어요. Ctrl+V로 붙여넣으세요.", `copy`면 열지 않고 "복사했어요. 붙여넣을 곳에서 Ctrl+V를 누르세요."
  - `log`로 넘어간 값에 입력 글·프롬프트가 없다(길이·id·출처·대상만).
  - `run`을 연달아 두 번 부르면 두 번째는 `{ ok:false }`(세션이 비었음), 클립보드 쓰기는 한 번.
  - 입력이 비면 `{ ok:false, message:'넣을 글이 없어요. 글을 선택하거나 직접 입력해 주세요.' }`.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/main/prompts/prompt-session.test.ts` → FAIL
- [ ] **Step 3: 구현** — 세션은 하나만 두고 10분 지나면 버린다. 선택 글은 main 메모리에만 두고 renderer에는 길이와 미리 보기로만 보낸다.
- [ ] **Step 4: 통과 확인** — PASS, `npx vitest run`
- [ ] **Step 5: 커밋** — `feat: 프롬프트 세션(필요할 때 가져오기, 미리 보기, 실행)`

### Task 6: IPC 연결과 확인 모드 표시

**Files:**
- Modify: `desktop/src/shared/ipc-channels.ts`, `desktop/src/preload/index.ts`, `desktop/src/preload/index.d.ts`, `desktop/src/main/ipc.ts`, `desktop/src/main/index.ts`, `desktop/src/main/windows/palette-window.ts`
- Test: 기존 테스트 + Task 9 스모크

**Interfaces:**
- Consumes: Task 5 세션, Task 4 `palette:list-items`
- Produces: `ShownPayload`에 `{ mode: 'confirm'; draft: PromptDraft }` 추가. IPC `prompt:preview`(invoke), `prompt:run`(invoke), `prompt:cancel`(send). preload `previewPrompt(req)`, `runPrompt(req)`, `cancelPrompt()`. `runItem('prompt:<id>')` → `session.prepare(id)`.

- [ ] **Step 1:** `hidePaletteAndRefocus`는 `hidePalette({ restoreFocus: true })` 뒤 직전 창이 실제로 앞에 왔는지 80ms 안에 확인해 boolean을 돌려준다. 알림은 Electron `Notification`(`silent: true`, 제목 "Sure-Mate"). main의 `fill` 래퍼는 `fillTemplate`에 현재 시각, `<userData>/references/<종류>.txt`(없으면 null, 4,000자 넘으면 경고 추가), 용어 목록(M4 전까지 빈 목록)을 넘긴다.
- [ ] **Step 2:** `npm run typecheck`, `npx vitest run` → 모두 통과
- [ ] **Step 3: 커밋** — `feat: 프롬프트 확인 모드 IPC 연결`

### Task 7: 디자인 토큰, Pretendard, 팔레트 새 디자인

**Files:**
- Create: `desktop/src/renderer/src/design/tokens.css`, `desktop/src/renderer/src/assets/fonts/PretendardVariable.woff2`, `desktop/src/renderer/src/assets/fonts/OFL.txt`
- Modify: `desktop/src/renderer/src/assets/tailwind.css`, `desktop/src/renderer/src/main.tsx`, `desktop/src/renderer/src/palette/Palette.tsx`, `StatusBar.tsx`, `DevOutput.tsx`
- Test: `desktop/src/renderer/src/design/tokens.test.ts`

**Interfaces:**
- Produces: §14-4 표의 CSS 변수 전부(`--ink`, `--surface-bar`, `--surface-flyout`, `--surface-palette`, `--text-1/2/3`, `--line`, `--brand`, `--brand-strong`, `--highlight`, `--warn`, `--danger`, `--cheek`, `--lens`, `--mist`)와 `--radius-window: 8px`, `--radius-control: 4px`, 글자 크기 `--fs-caption:12px` `--fs-small:13px` `--fs-body:14px` `--fs-input:16px` `--fs-title:20px`. Tailwind `@theme`에 같은 이름으로 연결.

- [ ] **Step 1: 실패하는 테스트** — `tokens.test.ts`가 `tokens.css`를 읽어 위 변수가 §14-4 값 그대로 있는지 확인한다.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/renderer/src/design` → FAIL
- [ ] **Step 3: 구현** — Pretendard 1.3.9 `PretendardVariable.woff2`와 OFL을 npm 꾸러미에서 꺼내 넣고 `@font-face`로 등록(CSP: 같은 출처라 허용). 본문 글꼴 `'Segoe UI Variable', 'Pretendard Variable', 'Malgun Gothic', sans-serif`. 팔레트: 입력칸 16px·높이 56, 구역 머리글 12px `--text-3`, 행 높이 40·모서리 4·선택 행 `rgba(255,255,255,0.08)`와 왼쪽 2px `--brand` 막대, 오른쪽에 종류 표시. 상태 줄: 가명 처리 모드(끔이면 `--warn` 글자 "가명 처리 끔"), 기본 AI 대상, 키 안내 "↵ 실행 · Esc 닫기". 포커스 링 `:focus-visible` 2px `--brand`.
- [ ] **Step 4: 통과 확인** — PASS, `npm run typecheck`, 실제 앱 화면 캡처를 보고 §14-4와 맞는지 확인(125%)
- [ ] **Step 5: 커밋** — `feat: 디자인 토큰과 Pretendard, 팔레트 새 디자인`

### Task 8: 확인 화면

**Files:**
- Create: `desktop/src/renderer/src/palette/confirm-state.ts`, `desktop/src/renderer/src/palette/Confirm.tsx`
- Modify: `desktop/src/renderer/src/palette/Palette.tsx`
- Test: `desktop/src/renderer/src/palette/confirm-state.test.ts`

**Interfaces:**
- Consumes: Task 5 `PromptDraft`/`PromptRequest`/`PromptPreview`, Task 7 토큰
- Produces: `confirmReducer(state, action)`, `initialConfirmState(draft)`, `keyToAction(e: { code: string; key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; isComposing: boolean }, state): ConfirmAction | null`
  - state: `{ source: PromptSource; target: string; input: string; focus: 'source' | 'target' | 'input' | 'run' }`
  - 키: Tab/Shift+Tab 초점 이동(입력칸은 출처가 `input`일 때만), ←/→ 초점 칩의 값 바꾸기(쓸 수 없는 출처는 건너뜀), Enter 실행(입력칸 안에서는 줄바꿈), Ctrl+Enter 어디서나 실행, Esc 목록으로. 조합 중이면 `null`.

- [ ] **Step 1: 실패하는 테스트** — 선택 글이 없으면 ←/→가 선택 출처를 건너뜀, 대상은 끝에서 처음으로 돌아감, 입력칸에서 Enter는 실행이 아님, Ctrl+Enter는 실행, 조합 중 Enter·Ctrl+Enter는 `null`, 출처를 `input`으로 바꾸면 초점이 입력칸으로.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/renderer/src/palette/confirm-state.test.ts` → FAIL
- [ ] **Step 3: 구현** — 화면: 머리(프롬프트 이름·그룹, "Esc 목록으로"), 출처 칩 3개(선택한 글 N자 / 클립보드 N자 / 직접 입력, 못 쓰는 칩은 흐리게 + 이유 이름표), AI 대상 칩, 출처가 `input`이면 입력칸, 미리 보기(120ms 늦춰 `previewPrompt` 요청, 앞 4,000자, 잘렸으면 "…앞 4,000자만 보여요"), 경고 목록(`--warn`), 아래 실행 줄("↵ 복사하고 Claude 열기"). 실행은 300ms 가드.
- [ ] **Step 4: 통과 확인** — PASS, `npm run typecheck`, `npx vitest run`
- [ ] **Step 5: 커밋** — `feat: 프롬프트 확인 화면`

### Task 9: 실제 앱 확인과 기록

**Files:**
- Create: `desktop/scripts/smoke/t14-prompt.ps1`
- Modify: `desktop/scripts/smoke/README.md`, `docs/decisions.md`

- [ ] **Step 1:** t14: 설정의 기본 AI 대상을 `copy`로 바꾼 채(끝나면 되돌림) 시험 창의 글을 선택 → 팔레트 단축키 → `/` → Enter(첫 프롬프트 "회의록 정리") → 확인 화면에서 Enter → 클립보드에 선택 글과 "추측하지"가 들어 있는지, 로그 `prompt.run`에 길이만 있는지, 시험 창의 글이 바뀌지 않았는지 확인. 선택 없이 한 번 더: 확인 화면 기본 출처가 클립보드인지.
- [ ] **Step 2:** `powershell -File desktop/scripts/smoke/run-smoke.ps1 -Script t14-prompt.ps1` → 위 항목 모두 통과, t11도 다시 통과
- [ ] **Step 3:** 확인 화면 캡처(125%)를 보고 §14-4와 다른 곳을 고친다.
- [ ] **Step 4:** `docs/decisions.md`에 이번 결정(팔레트를 열 때가 아니라 프롬프트를 고를 때 가져오기, 알림은 Windows 알림, 미리 보기 4,000자) 기록, 커밋 — `test: 프롬프트 흐름 스모크 시험과 결정 기록`
