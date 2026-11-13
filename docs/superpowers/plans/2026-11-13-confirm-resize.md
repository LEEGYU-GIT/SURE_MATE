# 확인 화면 크기 조절·두 칸 배치 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프롬프트 확인 화면을 크게 열고 끌어서 크기를 바꿀 수 있게 하며, 넓은 창에서는 왼쪽 설정 칸·오른쪽 입력/미리 보기 칸으로 배치해 미리 보기가 한눈에 보이게 한다.

**Architecture:** 창 크기·위치 계산은 `shared/palette-rules.ts`의 순수 함수(`confirmBounds`)로 두고, `main/windows/palette-window.ts`가 확인 화면을 띄울 때만 그 크기로 바꾸고 크기 조절을 켠다. 사용자가 바꾼 크기는 설정 `palette.confirmSize`에 저장한다. 배치는 `Confirm.tsx`가 창 너비(880 기준)에 따라 두 칸·한 줄을 고른다.

**Tech Stack:** Electron 45(BrowserWindow), React 19, Tailwind 4(임의 값 변형 `min-[880px]:`), Vitest.

**Spec:** 설계 문서 `docs/superpowers/specs/2026-11-05-sure-mate-design.md` §7 3단계(확인 화면), 2026-11-13 사용자 승인 설계(아래 요약).

> 승인된 설계(2026-11-13): 확인 화면만 기본 1040×760으로 열고 그 뒤로는 지난 크기로 연다. 작업 영역보다 크면 여백 16을 남기고 줄인다(최소 720×460, 작업 영역이 더 작으면 작업 영역에 맞춤). 확인 화면일 때만 가장자리 끌기로 크기를 바꾸고 바꾼 크기는 기억한다. 'Esc 목록으로'는 720×460으로 돌아간다. 너비 880 이상은 왼쪽 320 칸(넣을 글·가명 처리·바뀐 이름·AI)과 오른쪽 칸(직접 입력 약 1/3, 미리 보기 나머지), 미만은 지금처럼 한 줄 배치에 미리 보기 최소 높이를 둔다. 미리 보기 글 14px·밝은 회색. 키보드 흐름은 그대로, 첫 안내는 오른쪽 칸을 덮는다.

## Global Constraints

- 검색 목록·용어 상세·개발 출력 화면은 720×460 고정 그대로다.
- 확인 화면 기본 1040×760, 최소 720×460, 작업 영역 여백 16, 가로 가운데·위 22%(아래로 넘치면 위로 당김).
- 두 칸 기준 창 너비 880, 왼쪽 칸 320.
- 미리 보기: `text-body`(14px), 템플릿 글 `text-fg-2`, 넣은 글 형광펜·가명 청록 유지.
- 키보드 흐름(Tab 순서 넣을 글 → 가명 → 바뀐 이름 → AI → 입력칸, ←→, Alt+M, Ctrl+Enter, Esc)과 `confirm-state.ts`는 바꾸지 않는다.
- 모든 BrowserWindow 규칙(contextIsolation 등)은 그대로. 로그에는 크기 숫자만 남긴다.
- 문서(설계·결정 기록)는 문체 지침('~다', 금지어 사전)을 따른다.

## Review Focus

- 저장된 크기가 지금 모니터 작업 영역보다 크다(큰 모니터에서 키운 뒤 노트북으로 옮김) → 작업 영역 안(여백 16)으로 줄여 연다. Task 1 시험.
- 작업 영역이 최소 크기+여백보다 작다(1280×720 150% → 약 853×480 DIP) → 최소보다 작아도 화면 안에 맞춘다. Task 1 시험.
- 설정 파일의 `palette.confirmSize`가 깨졌다(문자열·음수·0·지나치게 큼) → 무시하고 기본 크기로 연다. Task 1 시험.
- 프로그램이 `setBounds`로 바꾼 크기에도 `resized`가 온다 → 끌어서 바꾼 크기만 저장한다(마지막으로 정한 크기와 2 DIP 넘게 다를 때만). Task 2.
- 'Esc 목록으로' 뒤 검색 목록이 큰 창에 남는다 → 검색 크기(720×460)로 돌아가고 크기 조절이 꺼진다. Task 2.

---

### Task 1: 확인 화면 창 자리 계산과 크기 설정

**Files:**
- Modify: `desktop/src/shared/palette-rules.ts`, `desktop/src/shared/palette-rules.test.ts`
- Modify: `desktop/src/shared/settings/settings.ts`(`palette.confirmSize?`), `desktop/src/main/settings/settings-store.ts`(읽기), `desktop/src/main/settings/settings-store.test.ts`

**Interfaces:**
- Produces: `CONFIRM_SIZE = { width: 1040, height: 760 }`, `CONFIRM_MIN = { width: 720, height: 460 }`, `confirmBounds(workArea: Rect, saved: Size | null): Rect`, `parseConfirmSize(raw: unknown): Size | null`(정수로 반올림, 너비 320~8000·높이 240~8000 밖이면 null), `Settings['palette']['confirmSize']?: { width: number; height: number }`.

- [ ] **Step 1: 실패하는 시험** — `palette-rules.test.ts`에 `describe('confirmBounds')`
  - 1920×1040, 저장 없음 → `{ x: 440, y: 229, width: 1040, height: 760 }`
  - 1600×852 → `{ x: 280, y: 76, width: 1040, height: 760 }`(22%면 아래로 넘쳐 위로 당김: 852−16−760)
  - 1024×536(1280×720 125%) → `{ x: 16, y: 16, width: 992, height: 504 }`
  - 853×480 → `{ x: 16, y: 16, width: 821, height: 448 }`(최소보다 작아도 화면 안)
  - 저장 1200×900, 작업 영역 1920×1040 → `{ x: 360, y: 124, width: 1200, height: 900 }`(22%=229면 넘쳐 1040−16−900)
  - 저장 3000×2000 → 작업 영역 1920×1040에서 `{ x: 16, y: 16, width: 1888, height: 1008 }`
  - 저장 600×300(최소보다 작음) → 720×460으로 키움
  - 보조 모니터 `{ x: -1920, y: 0, width: 1920, height: 1040 }` → `x: -1480`
  - `parseConfirmSize`: `{ width: 1100.4, height: 800 }` → `{ width: 1100, height: 800 }`; `'big'`, `{ width: -1, height: 800 }`, `{ width: 9000, height: 800 }`, `null` → `null`
- [ ] **Step 2:** `npx vitest run src/shared/palette-rules.test.ts` → FAIL(함수 없음)
- [ ] **Step 3:** `confirmBounds`·`parseConfirmSize` 구현. 너비 = clamp(원함, min(CONFIRM_MIN, 작업 영역−32), 작업 영역−32), 높이도 같다. y = 작업 영역 위 + max(16, min(round(높이×0.22), 높이−16−창 높이)).
- [ ] **Step 4:** 같은 시험 PASS
- [ ] **Step 5:** `settings-store.test.ts`에 `palette.confirmSize` 읽기 시험(정상 값 유지, 깨진 값은 없앰)을 쓰고 FAIL 확인 → `mergeSettings`에서 `parseConfirmSize`로 읽어 있을 때만 넣음 → PASS
- [ ] **Step 6:** `npm test`, `npm run typecheck` 통과 후 커밋 `feat: 확인 화면 창 크기 계산과 크기 설정(palette.confirmSize)`

### Task 2: 팔레트 창이 확인 화면일 때만 크게 열고 크기 조절

**Files:**
- Modify: `desktop/src/main/windows/palette-window.ts`, `desktop/src/main/index.ts`

**Interfaces:**
- Consumes: Task 1의 `confirmBounds`, `CONFIRM_MIN`, `needsResize`.
- Produces: `createPaletteWindow(opts: { getDisplayMode(): DisplayMode; getConfirmSize(): Size | null; saveConfirmSize(size: Size): void })`, `paletteBackToList(): void`.

- [ ] **Step 1:** `showPalette`: `payload.mode === 'confirm'`이면 `confirmBounds(display.workArea, getConfirmSize())`, `setMinimumSize(min(CONFIRM_MIN, 계산 크기))`, `setResizable(true)`; 아니면 지금처럼 `palettePosition(…, SIZE)`, `setResizable(false)`. 지금 모드와 마지막으로 정한 크기(`lastSize`)를 기억한다. 배율 버그 확인(`needsResize`)은 정한 크기로 한다.
- [ ] **Step 2:** `win.on('resized')`: 확인 화면이고 보이며 `needsResize(getBounds(), lastSize, 2)`일 때만 `saveConfirmSize({ width, height })`(로그 `palette.confirmResize` 크기 숫자만).
- [ ] **Step 3:** `paletteBackToList()`: 보이고 확인 화면이면 지금 모니터(`screen.getDisplayMatching`)의 검색 자리로 `setResizable(false)`·`setMinimumSize(720, 460)`·`setBounds`. `index.ts`의 `cancelPrompt`에서 `session.cancel()` 뒤 부른다.
- [ ] **Step 4:** `index.ts`의 `createPaletteWindow`에 `getConfirmSize: () => settings.palette.confirmSize ?? null`, `saveConfirmSize`(`changeSettings`로 `palette.confirmSize`만 바꿈, 실패는 로그) 연결.
- [ ] **Step 5:** `npm run typecheck`, `npm test`, `npx electron-vite build` 통과 후 커밋 `feat: 확인 화면을 크게 열고 끌어서 크기를 바꾸면 기억한다`

### Task 3: 확인 화면 두 칸 배치와 미리 보기 가독성

**Files:**
- Modify: `desktop/src/renderer/src/palette/Confirm.tsx`
- Modify: `desktop/src/renderer/src/preview/scenes.tsx`(확인 화면 넓은 장면 추가)

**Interfaces:**
- Consumes: 없음(창 크기는 뷰포트 너비로 판단).
- Produces: 미리 보기 장면 `confirm-wide`(1040×760, 선택한 글), `confirm-wide-input`(1040×760, 직접 입력에 글), `confirm-wide-tip`(1040×760, 첫 안내), 기존 `confirm-*`는 720×460 한 줄 배치 확인용.

- [ ] **Step 1:** 몸통을 `min-[880px]:grid min-[880px]:grid-cols-[320px_minmax(0,1fr)]`로 바꾼다. 왼쪽: 넣을 글·가명 처리(모드, 요약, Alt+M)·바뀐 이름(넓은 배치에서는 남는 높이까지 스크롤)·AI를 위에서 아래로, 이름표는 칩 위. 오른쪽: 직접 입력(넓은 배치 높이 약 1/3, 최소 120) + 미리 보기(나머지). 좁은 배치는 지금 순서를 유지하고 미리 보기에 최소 높이 96을 두며 몸통이 넘치면 스크롤한다.
- [ ] **Step 2:** 미리 보기 글을 `text-body`·`text-fg-2`로, 넣은 글(mark)은 `text-fg`, 가명은 지금처럼 `font-semibold text-brand`.
- [ ] **Step 3:** 첫 안내: 넓은 배치에서는 오른쪽 칸을 덮고 꼬리가 왼쪽(가명 처리 줄 높이)을 가리킨다. 안내가 보이는 동안 왼쪽의 바뀐 이름·AI도 `inert`로 흐리게 둔다(Tab 순서가 넣을 글 → 가명 → [알겠어요]이므로).
- [ ] **Step 4:** `scenes.tsx`에 세 장면을 더하고 미리 보기 빌드를 1040×760·720×460으로 캡처해 확인한다(넘침·잘림·초점 테두리).
- [ ] **Step 5:** `npm test`, `npm run typecheck` 통과 후 커밋 `feat: 확인 화면을 넓은 창에서 두 칸으로, 미리 보기 글을 크고 밝게`

### Task 4: 설계·결정 기록

**Files:**
- Modify: `docs/superpowers/specs/2026-11-05-sure-mate-design.md`(§7 3단계), `docs/decisions.md`

- [ ] **Step 1:** 설계 §7 3단계에 창 크기(기본 1040×760·기억·끌기·최소 720×460·여백 16)와 두 칸 배치(880 기준)를 적는다.
- [ ] **Step 2:** 결정 기록에 2026-11-13 항목(사용자 요청: 입력·미리 보기가 좁아 한눈에 보이지 않음)을 더한다.
- [ ] **Step 3:** 커밋 `docs: 확인 화면 크기 조절·두 칸 배치 결정 기록과 설계 §7`
- [ ] **Step 4(Windows 확인, 사용자):** 가장자리 끌기, 다시 열 때 크기 유지, 'Esc 목록으로' 뒤 검색 크기, 배율이 다른 모니터로 옮긴 뒤 크기.
