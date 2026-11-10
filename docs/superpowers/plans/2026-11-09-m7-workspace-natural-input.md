# M7 워크스페이스(지금 모니터 구성)·말하듯 입력 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자가 놓은 창 배치를 "지금 배치 저장"으로 기록하고, 같은 모니터 구성에서 팔레트(`@`)·바 펼침 창·워크스페이스 단축키로 불러오면 각 창이 저장 위치 ±10px 안에 다시 놓이며 창마다 결과를 알린다(F4 §11, v4 범위). 접두어 없이 "회의록 정리해줘", "보고서 모드로 바꿔줘", 영문 모드로 친 "ghldmlfhr wjdflgownj"를 입력해도 AI 없이 맞는 항목이 맨 위에 오고, 맨 위 후보에 의도를 표시하며, 선택한 문장을 기억하고, 같은 점수는 최근·자주 쓴 항목이 앞선다(F6 §13, §6, M4가 미룬 §9 동점 순서).

**Architecture:**
- 워크스페이스: 판단은 모두 순수 모듈이다. 모니터 구성 지문·DIP 비율 계산·창 읽기·제목 규칙·창 짝짓기·복원 계획·결과 문구는 `shared/workspace/`, 복원 순서(최소화·최대화 해제 → 이동 → 확인 → 한 번 더 이동 → 최대화 → z-순서 → 포커스 복귀)와 저장·불러오기 흐름(한 번에 하나, 다른 구성 확인)은 `main/workspace/`에 주입식으로 두고 가짜 창·가짜 시계로 시험한다(`capture-flow.ts`와 같은 방식). Win32(`native/windows.ts`)·`screen`(`native/coords.ts`)·대화상자는 얇은 연결부만 둔다. 편집 화면은 팔레트 안 화면이다(위키 추가·수정과 같은 방식).
- 말하듯 입력: `resources/intents.json` 단어 목록으로 입력 문장을 변형 검색어 몇 개와 의도 목록으로 바꾸고(`shared/natural/understand.ts`), M4 랭커를 여러 검색어·가산점·후보 지목·동점 선호를 받는 `rankAll`로 확장해 점수를 매긴다. 검색은 지금처럼 renderer에서 수행하고, main은 단어 목록(사용자 덮어쓰기본)·학습 연결(`phrase-map.json`)·사용 기록(`usage.json`)을 IPC로 전달하며 선택한 항목을 기록한다.

**Tech Stack:** Electron 45.2.3, React 19, TypeScript, Tailwind v4, Vite 8, Vitest, koffi 3. 새 의존성 없음(es-hangul은 package.json에 없으므로 영문 자판 → 한글 조합은 `shared/text/hangul.ts`에 직접 구현한다).

**Spec:** `docs/superpowers/specs/2026-11-05-sure-mate-design.md` (§11 F4·§13 F6 핵심, §3 범위, §5 로컬 파일, §6 접두어·의도 표시·빈 화면, §9 점수·동점 순서, §14 설정 탭, §14-1 바 워크스페이스 항목, §14-4 디자인 시스템, §16, §17, §19) · M5 계획 `docs/superpowers/plans/2026-11-09-m5-bar.md` · M6 계획 `docs/superpowers/plans/2026-11-09-m6-mallang-mate.md` · `docs/decisions.md` · `docs/reports/2026-11-08-m1-spike.md`(창 옮기기: 같은 모니터 왼쪽 절반 차이 0px, 배율이 다른 모니터는 미확인)

**M5·M6에서 사용하는 이름:** M5·M6 완료 후 시작한다. 아래 이름은 두 계획의 Interfaces를 그대로 따른다. 실제 코드가 계획과 다르면 실제 코드를 따르고 작업 보고에 기록한다.
- M5: T2 `createFakeApi`·`FakeFixtures`·`Scene`·`SCENES`·`<Desktop>`·`scripts/preview/shoot.sh` · T4 `Timers`·`realTimers` · T7 `FlyoutContent`의 `{ kind: 'workspace-menu'; workspaces; canSave }`·`MenuContent`·`FlyoutController.toggleMenu`·`close` · T8 `FlyoutAction`·`parseFlyoutAction`·`MenuRow`·`menu-model.ts`·`WorkspaceMenu.tsx`·IPC `flyoutAction` · T10 `createBarRuntime`·`createBarActions`의 `toggleMenu('workspace-menu', 'workspace')`·`shownView`·`ShownPayload`의 `query`·`applySettings` · T11 `buildPaletteItems(…, { barShape })`·`cmd.bar-shape` · T12 `ShownPayload { mode: 'wiki' }` · T13 스모크 도우미 `ClickAt`·`HoverAt`·`ShotRect`·`LastBarPlace`·`TopmostIsApp`, `run-smoke.ps1 -TimeoutSec`, `t18-run.ps1`의 설정 백업 방식
- M6: T10 `HotkeyId`의 `'pet-control'`·`buildPaletteItems(…, { petVisible })` · T11 `WaitLog`·`t19-run.ps1`
- M1~M4(코드에 있음): `listWindows`·`getWindowInfo`·`moveWindow`·`getForegroundWindow`·`setForeground`·`selfElevated`(`native/windows.ts`), `getMonitors`·`toDip`·`toPhysical`(`native/coords.ts`), `win32()`·`nativeStatus()`, `rectDiff`(`shared/geometry.ts`), `HotkeyManager`·`checkAccelerator`·`acceleratorKeyCode`, `buildSearchIndex`·`rank`·`compactOf`(`shared/search/ranker.ts`), `foldForMatch`, `disassemble`·`toQwerty`(`shared/text/hangul.ts`), `buildPaletteIndex`·`filterItems`·`groupItems`·`withWikiAdd`·`MAX_ROWS`(`renderer/src/palette/filter-items.ts`), `palette-search.test.ts`, `createGlossaryCache`·`saveUserEntries`·`RENAME_RETRY_MS`·`SaveIo`(`glossary-store.ts`), `ensureMaskDictionaryFile`과 "가명 사전 열기" 명령, `waitPickKeysReleased`·`PICK_KEYS_WAIT_MS`, `createExecutionGuard`, `isImeComposing`, index.ts의 `runItem`·`reportFileErrors`·`warn`

**이번에 하지 않는 것:**
- 모니터 구성별 저장과 역할(주·보조·내장) 이동(Should 8): 워크스페이스마다 배치를 하나만 저장한다. `layouts`는 지문을 키로 하는 객체로 유지하고 모니터 역할도 기록해 Should 8이 이어서 사용한다.
- 꺼져 있는 앱 실행(Should 10), 설정 전체 내보내기(Should 11), AI 이름이 들어간 문장으로 AI 대상 바꾸기(Should 7). "클로드로 회의록 정리"는 프롬프트 의도로만 처리한다.
- 설정 화면(11/15)의 워크스페이스·말하듯 입력 탭: 그 작업이 이번 편집 화면 컴포넌트(`WorkspaceEditor`)를 탭에 포함하고 단어 목록·학습 내용 편집을 추가한다. 그때까지 단어 목록은 "말하듯 입력 단어 목록 열기" 명령으로 파일을 연다.
- 말랑 메이트의 배치 복원 반응(§14-2 반응 표에 없음).

**사용자 확인이 필요한 결정(§0: 설계와 다르게 진행하기 전에 확인):**
1. 편집 화면 위치: §11은 편집 UI를 "설정 화면"에 두지만 설정 창은 11/15 작업이다. 이 계획은 편집 화면을 팔레트 안 화면(720×460 DIP)으로 만들고 11/15 설정 화면이 같은 컴포넌트를 사용한다. 비용: 창 목록이 넓은 화면 대신 스크롤된다.
2. 학습(Should 9) 일부 포함: §13 7단계 점수식에 학습 가산점이 있고 M4가 동점 순서의 학습 연결을 M7로 미뤘다. 맨 위가 아닌 후보의 Shift+Enter "기억하고 실행"만 두고, 학습 내용 보기·지우기는 11/15 설정 화면이 추가한다. 비용: 잘못 기억시키면 같은 문장에서 다른 후보를 다시 기억시켜 교체한다.
3. 최소화된 창은 저장하지 않고 건너뛴 수를 알린다. 최소화된 창의 GetWindowRect는 화면 밖 값이고 원래 위치는 GetWindowPlacement가 필요하다. 비용: 저장 전에 최소화를 해제해야 한다.
4. 새 로컬 파일 `usage.json`(항목 id·횟수·마지막 시각): §9 동점 순서의 "최근·자주 쓴 항목"과 §6 빈 화면의 "최근 실행 항목"을 다시 시작해도 유지하는 데 필요하고 §5 파일 목록에는 없다.

## Global Constraints

- 리눅스 서버: 명령은 `desktop/`에서 Node 22로 실행한다. 기본 `node`는 v12이므로 먼저 `export PATH="$(git rev-parse --show-toplevel)/../../tools/node22/bin:$PATH"`를 실행하고 `node --version`(22 이상)을 확인한다. 리눅스에서 가능한 검증은 `npx vitest run <파일>`, `npm test`, `npm run typecheck`, `npx electron-vite build`, 미리 보기 캡처뿐이다. 실제 창 이동·Win32·포커스·전역 단축키는 Task 13(Windows)에서만 확인한다.
- 모든 BrowserWindow: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `spellcheck: false`. 이번에는 새 창을 만들지 않는다(편집 화면은 팔레트 안, 메뉴는 M5 펼침 창).
- 앱은 네트워크 요청을 보내지 않는다. 새 npm 의존성을 추가하지 않는다.
- 좌표(§5·CLAUDE.md): 저장·복원 계산은 모두 DIP이고, Win32 물리 픽셀과의 변환은 `native/coords.ts`의 `toDip`·`toPhysical`만 사용한다. 순수 모듈은 변환 함수를 주입받는다.
- Win32는 `win32()`로만 호출한다. `nativeStatus()`가 실패하면 저장·불러오기·단축키 실행은 "보안 프로그램이 Win32 기능을 막아 창을 옮기거나 저장할 수 없어요."로 알리고 아무것도 변경하지 않는다. 팔레트·말하듯 입력·편집 화면 보기는 그대로 동작한다.
- 로그(CLAUDE.md "로그에는 … 내용을 남기지 않는다"): 창 제목·워크스페이스 이름·별칭·입력 문장·학습 문장·의도 단어는 내용이다. 로그에는 id(uuid·고정 id)·건수·길이·사각형·시간만 남기고 오류는 `errorText()`를 사용한다. 알림·화면에는 이름을 표시해도 된다. 시험마다 로그 인자 JSON에 시험 제목·이름(예: '가상자동차 보고서.xlsx - Excel', 'QA 모드')이 없는지 확인한다.
- 저장(§5·§16): 새 파일(`workspaces.json`·`phrase-map.json`·`usage.json`, 사용자 `intents.json`)은 모두 `writeJsonAtomic`(겹치지 않는 임시 파일 → 디스크 반영 → 이름 바꾸기, EPERM·EBUSY·EACCES는 50·100·200·400ms 간격 재시도)으로 저장하고, 읽을 때 UTF-8 BOM을 제거하며, 깨졌거나 일부만 읽힌 파일은 덮어쓰기 전에 `<파일>.broken-<시각>` 사본을 남긴다.
- §11 값: 대상 창은 "보이는 최상위 창 중 제목이 있고, 도구 창·가려진(cloaked) 창·Sure-Mate 자신의 창이 아닌 것", 창마다 "실행 파일 이름(EXCEL.EXE), 제목, 클래스, 상태(보통/최대화), 작업 영역 기준 상대 위치(x, y, w, h를 0~1 비율로), 모니터 역할", 지문은 "모니터 수, 각 해상도·배율·상대 위치, 내장 디스플레이 여부를 정렬해 만든 키", 완료 기준 "±10px", 구성이 다를 때 질문 "다른 모니터 구성에서 저장한 배치예요. 주 모니터로 모을까요?", 결과 예 "5개 중 4개 배치, Excel 못 찾음", 관리자 권한 창은 "건너뛰고 이유를 알린다(UIPI)".
- §13 값: 단어 목록은 코드에 두지 않고 `intents.json`에 둔다. 2단계 끝 기호 `?!.~`와 군말(좀, 그, 저기, 혹시), 3단계 요청 어미(공백을 뺀 문자열 끝에서 긴 것부터 최대 두 번), 4단계 영문·숫자와 한글 경계, 5단계 조사(긴 것부터, "떼기 전 원형도 후보로 남기고 동점이면 원형이 이긴다"), 6단계 의도 단어 7개 분류, 7단계 "후보 점수 = §9 검색 점수 + 의도 가산점 + 학습 가산점. 자동 실행하지 않는다". 설계 목록은 원문 그대로 옮기고, 추가한 단어는 시험에서 설계 원문과 따로 확인한다.
- §6: 접두어 `?` 위키, `!` 상용구, `/` 프롬프트, `@` 워크스페이스, `>` 명령(한/영 상태와 무관). 접두어가 없으면 말하듯 입력이 처리한다. 맨 위 후보에 의도 표시(예: "프롬프트", "배치"). 빈 화면은 최근 실행 항목과 사용 팁 한 줄. 한글 조합 중에는 Enter·화살표·Tab·Space로 동작하지 않고 키는 `e.code`+보조키로 판단한다. 같은 항목을 300ms 안에 두 번 실행하지 않는다. 팔레트를 숨기는 동작은 항목을 선택한 Enter·보조키를 뗀 것을 확인한 뒤에 한다(`waitPickKeysReleased(PICK_KEYS_WAIT_MS)`, 0.6초).
- §9 동점 순서: M4의 "같은 점수면 제목에서 맞은 항목 먼저" 다음에 "학습 연결, 최근·자주 쓴 항목, 짧은 용어 순", 마지막은 추가 순서.
- §16: 용어 2,000개에서 검색 갱신 50ms 이내, 키보드만으로 모든 기능 사용, 원자적 저장.
- 디자인(CLAUDE.md "디자인 작업"): 새 화면(편집 화면, 펼침 창 워크스페이스 메뉴, 팔레트의 의도 표시·기억하기·최근 구역)은 `impeccable` shape(문구는 `design:ux-copy` 또는 `impeccable` clarify)로 시작하고, 미리 보기 캡처(1·1.25·1.5배)에 `design:design-critique`·`design:accessibility-review`를 실행해 지적을 수정한 뒤 다시 캡처한다. 사용할 수 있는 스킬 목록을 먼저 확인하고 없으면 사용자에게 알린다. 색·글자·모양은 §14-4 토큰만 사용하고, 글자 굵기는 400·600, 움직임은 §14-4 값만 사용한다. `impeccable`의 live·generate 기능은 사용하지 않는다.
- 커밋 메시지는 `feat: …`(한국어), 실명 없음. 시험 데이터는 가상 이름(가상자동차, XY방산, 'SureMate-WS-A' 같은 시험 창 제목)만 사용한다.

## Review Focus

1. **복원 중에 창이 바뀜**: 불러오는 동안 창이 닫히거나, 응답 없음 상태이거나, 관리자 권한이거나, 최소화·최대화 상태이거나, 이동을 거부하면 그 창만 건너뛰고 나머지는 배치하며, 알림에 창마다 결과("Excel 못 찾음", "관리자 권한 창이라 건너뜀")가 정확히 표시되고 앱(팔레트·바)이 멈추지 않는다. → Task 3(관리자 권한 건너뜀), Task 4(사라짐·응답 없음·거부·실패·10초 상한·포커스 복귀) 테스트.
2. **같은 프로그램 창 여러 개**: 엑셀 창 2개 중 한 문서를 닫고 다른 문서를 열었으면 제목 규칙이 맞는 창만 짝짓고 나머지 규칙은 "못 찾음"으로 알리며 엉뚱한 창을 그 자리로 이동하지 않는다. 제목이 같은 창 2개는 저장한 제목과 z-순서로 결정된다. → Task 2(제목 규칙 만들기), Task 3(짝짓기) 테스트.
3. **모니터 구성이 바뀜**: 도킹 해제·배율 변경·주 모니터 변경 뒤 불러오면 지문이 달라 먼저 확인하고, 모으기를 선택하면 모든 창이 주 모니터 작업 영역 안(제목 줄 보임)에 놓이며, 왼쪽(음수 좌표) 모니터와 작업 표시줄 위치에도 맞다. 거절하면 아무 창도 이동하지 않는다. → Task 2(지문·비율·화면 밖 방지), Task 3(모으기 계획), Task 5(확인 거절) 테스트.
4. **말하듯 입력의 지나친 해석**: 조사처럼 끝나는 낱말(정확도·평가·결과), 낱말 속 의도 단어(정적분석의 '분석'), 영어 낱말(test·mail·meeting), 한 글자 검색어는 그냥 검색과 같은 결과이고 M4 §9 완료 기준 검색어도 그대로다. → Task 9(문장 이해), Task 10(문장 표와 변화 없음 목록) 테스트.
5. **직접 수정했거나 깨진 파일**: BOM·잘못된 JSON·형식이 다른 `workspaces.json`·`intents.json`·`phrase-map.json`·`usage.json`, 컴파일되지 않는 정규식, 제한을 넘는 값이 있어도 앱이 시작하고 기본값(기본 단어 목록, 빈 기록)을 사용하며, 원본은 사본으로 남고 사용자에게 알린다. → Task 1, Task 9, Task 11 테스트.

## 파일 구조

| 파일 | 책임 |
|---|---|
| `main/storage/atomic-json.ts` | JSON 원자적 저장·읽기·깨진 파일 사본(glossary-store에서 분리) |
| `shared/workspace/types.ts` · `workspace-file.ts` | 워크스페이스 타입·제한, 파일 검사, 기본 이름 |
| `shared/workspace/monitors.ts` · `layout-math.ts` · `capture.ts` | 모니터 키·지문·역할, DIP 비율·화면 밖 방지, 지금 배치 읽기·제목 규칙·앱 이름 |
| `shared/workspace/match.ts` · `restore-plan.ts` | 규칙과 지금 창 짝짓기, 복원 계획(같은 구성·모으기) |
| `shared/workspace/messages.ts` · `edit.ts` · `workspace-ipc.ts` | 결과·안내 문구, 편집 적용, IPC 값 검사 |
| `main/workspace/workspace-store.ts` | `workspaces.json` 읽기·저장·백업 복구 |
| `main/workspace/restore-runner.ts` | 복원 실행 순서(순수, 주입식) |
| `main/workspace/workspace-service.ts` · `workspace-items.ts` · `workspace-hotkeys.ts` | 저장·불러오기 흐름(순수), 팔레트·펼침 창 항목, 단축키 동기화 |
| `main/workspace/workspace-runtime.ts` | Win32·`screen`·대화상자 연결부 |
| `shared/hotkeys/accelerator-format.ts` · `main/hotkeys/hotkey-recording.ts` | 키 입력 → 단축키 문자열, 녹화 중 모든 단축키 잠시 해제(30초 상한) |
| `renderer/src/palette/WorkspaceEditor.tsx` · `MonitorPreview.tsx` · `HotkeyField.tsx` · `monitor-preview.ts` · `workspace-editor-state.ts` · `list-keys.ts` | 편집 화면 |
| `resources/intents.json` · `shared/natural/intent-pack.ts` · `understand.ts` | 말하듯 입력 단어 목록, 문장 → 변형 검색어·의도 |
| `shared/natural/natural-rank.ts` · `usage.ts` | 의도·학습 가산점, 사용 점수·최근 항목 |
| `main/natural/intent-store.ts` · `phrase-store.ts` · `usage-store.ts` · `natural-commands.ts` · `shared/natural/natural-ipc.ts` | 단어 목록 덮어쓰기본·학습·사용 기록 파일, 명령, IPC 값 검사 |
| `renderer/src/palette/palette-hints.ts` | 기억하기 안내·사용 팁 |

---

### Task 1: 원자적 JSON 저장과 워크스페이스 파일

**Files:**
- Create: `desktop/src/main/storage/atomic-json.ts`, `desktop/src/shared/workspace/types.ts`, `desktop/src/shared/workspace/workspace-file.ts`, `desktop/src/main/workspace/workspace-store.ts`
- Modify: `desktop/src/main/glossary/glossary-store.ts`(저장 부분을 `writeJsonAtomic`으로 교체, `SaveIo`·`RENAME_RETRY_MS`는 다시 내보내 기존 시험 유지)
- Test: `desktop/src/main/storage/atomic-json.test.ts`, `desktop/src/shared/workspace/workspace-file.test.ts`, `desktop/src/main/workspace/workspace-store.test.ts`, 기존 `glossary-store.test.ts`

**Interfaces:**
- Consumes: `glossary-store.ts`의 `SaveIo`·`renameWithRetry`·`RENAME_RETRY_MS`(이 파일로 이동), `Rect`
- Produces:
  ```ts
  // main/storage/atomic-json.ts
  interface SaveIo { rename(from: string, to: string): Promise<void>; sleep(ms: number): Promise<void> }
  RENAME_RETRY_MS = [50, 100, 200, 400]
  writeJsonAtomic(path: string, value: unknown, o?: { io?: SaveIo; backup?: boolean }): Promise<void>
  type JsonRead = { kind: 'missing' } | { kind: 'ok'; value: unknown } | { kind: 'broken'; code: string }
  readJsonFile(path: string): Promise<JsonRead>
  keepBrokenCopy(path: string, now?: Date): Promise<string | null>     // `<파일>.broken-<시각>`, 실패하면 null
  // shared/workspace/types.ts
  type MonitorRoleName = 'primary' | 'secondary' | 'internal'
  interface SavedMonitor { key: string; role: MonitorRoleName; bounds: Rect; workArea: Rect; scaleFactor: number }   // DIP
  interface RatioRect { x: number; y: number; w: number; h: number }
  type WindowState = 'normal' | 'maximized'
  interface WindowRule {
    id: string; enabled: boolean
    match: { exe: string; className?: string; titleIncludes?: string; titleRegex?: string }
    savedTitle: string                          // 편집 화면 표시·같은 제목 창 순서용(로그 금지)
    target: { monitor: string /* SavedMonitor.key */; rect: RatioRect; state: WindowState }
    order: number                               // z-순서, 0이 맨 위
  }
  interface SavedLayout { monitors: SavedMonitor[]; windows: WindowRule[] }
  interface Workspace { id: string; name: string; aliases: string[]; hotkey: string | null; layouts: Record<string /* 지문 */, SavedLayout>; updatedAt: string }
  WORKSPACES_FORMAT = 'sure-mate-workspaces'
  WORKSPACE_LIMITS = { workspaces: 30, windows: 40, monitors: 8, name: 40, aliases: 10, alias: 40, title: 200, titleIncludes: 100, titleRegex: 200, exe: 260, className: 256 }
  // shared/workspace/workspace-file.ts
  parseWorkspaces(raw: unknown): { workspaces: Workspace[]; errors: string[] }
  nextWorkspaceName(existing: Pick<Workspace, 'name'>[]): string
  // main/workspace/workspace-store.ts
  WORKSPACES_FILE = 'workspaces.json'
  loadWorkspaces(dir: string): Promise<{ workspaces: Workspace[]; errors: string[]; recovered: boolean }>
  saveWorkspaces(dir: string, list: Workspace[], io?: SaveIo): Promise<void>
  createWorkspaceCache(dir: string, onErrors: (errors: string[]) => void): { get(): Promise<Workspace[]>; save(list: Workspace[]): Promise<void>; invalidate(): void }
  ```

§11의 데이터 모델은 "(제안)"이다. 바꾼 곳: `target.monitor`는 역할 합집합 대신 저장한 모니터 키이고 역할은 배치마다 함께 저장하는 `SavedMonitor.role`에 둔다(지금 구성이 달라도 편집 화면이 저장 당시 모니터를 그리고, Should 8이 역할로 이동한다). `hotkey`는 없으면 `null`, `savedTitle`을 추가한다. Task 13에서 decisions.md에 기록한다.

`writeJsonAtomic`: 폴더 만들기 → `${path}.${uuid}.tmp`에 2칸 들여쓰기 JSON 기록 → `sync()` → `backup`이면 기존 파일을 `.bak`으로 복사 → 이름 바꾸기 재시도 → 실패하면 임시 파일 삭제 후 오류를 다시 던진다. `saveUserEntries`의 동작(깨진 파일 사본 포함)은 그대로다.

`parseWorkspaces` 규칙(오류 문구에는 순번만, 이름·제목 금지. 예: `workspaces.json: 2번째 워크스페이스 — 이름이 없어 건너뜀`):
- 형식·판이 다르면 빈 목록과 오류 하나. 워크스페이스는 30개까지, id(`^[A-Za-z0-9-]{1,64}$`)가 겹치면 뒤의 것을 건너뛴다.
- 이름은 앞뒤 공백을 제거하고 40자로 자르며 비면 건너뛴다. 별칭은 공백 제거·빈 값 제외·대소문자 무시 중복 제거·40자 넘으면 제외·10개까지. hotkey는 40자 이하 문자열이 아니면 null. updatedAt이 날짜로 읽히지 않으면 `new Date(0).toISOString()`.
- 배치: 지문 키는 400자 이하. 모니터는 8개까지이고 key 64자 이하·역할이 정해진 값·사각형 네 값이 유한수이며 너비·높이 > 0·배율 0.5~5여야 한다.
- 창 규칙은 40개까지. exe 1~260자, className 256자, titleIncludes 100자, savedTitle 200자로 자른다. titleRegex는 200자 이하이고 `new RegExp(v, 'iu')`가 되면 유지하고, 안 되면 그 칸만 빼고 오류를 남긴다. `target.monitor`가 그 배치의 모니터 키에 없거나, rect가 유한수가 아니거나 x·y가 −1~2 밖이거나 w·h가 0 이하·2 초과면 그 규칙을 건너뛴다. order는 0 이상 정수가 아니면 배열 순번.

`loadWorkspaces`: 파일이 없으면 빈 목록. 읽기·JSON 실패나 형식이 다르면 `keepBrokenCopy` 후 `.bak`을 같은 규칙으로 읽고, 읽히면 `recovered: true`와 오류 "workspaces.json을 읽지 못해 백업에서 복구했어요". 일부 항목만 건너뛰었으면 그 오류를 돌려주고, 다음 `saveWorkspaces`가 덮어쓰기 전에 사본을 남긴다(M4 용어 파일과 같은 규칙). 저장은 `{ format, version: 1, savedAt, workspaces }`를 `backup: true`로 기록한다. 캐시는 `createGlossaryCache`처럼 수정 시각·크기가 바뀔 때만 다시 읽고 `save` 뒤에는 저장한 목록을 돌려준다.

`nextWorkspaceName`: '배치 1'부터 사용하지 않은 가장 작은 번호(설계에 없는 기본 이름, 사용자가 좌표를 입력하지 않으므로 이름도 나중에 정한다).

- [ ] **Step 1: 실패하는 테스트** —
  - `writeJsonAtomic`: 기록한 내용이 `JSON.stringify(v, null, 2)`와 같고 `.tmp` 파일이 남지 않음; `backup: true`면 이전 내용이 `.bak`; 주입한 rename이 EPERM 두 번 뒤 성공 → sleep `[50, 100]`; EACCES 다섯 번 → 오류를 던지고 `.tmp` 없음; `readJsonFile`: 없음 → missing, BOM 붙은 JSON → ok, `'{'` → broken;
  - `parseWorkspaces`: 정상 예시(워크스페이스 1개, 배치 1개, 모니터 2개, 규칙 3개) → 같은 값·오류 없음; 형식 `'other'` → 빈 목록·오류 1개; 이름 `'  '` → 건너뜀; 이름 50자 → 40자; 별칭 `['qa', 'QA', ' ', 'x'.repeat(50)]` → `['qa']`; hotkey `7` → null; 워크스페이스 31개 → 30개와 오류; titleRegex `'('` → 규칙은 남고 titleRegex 없음·오류; monitor `'nope'` → 그 규칙 제외; rect w 0 → 제외; 규칙 41개 → 40개; 같은 id 두 번 → 앞의 것만; (Review Focus 5) 모든 오류 문구 JSON에 예시의 이름 'QA 모드'와 제목 '가상자동차 보고서.xlsx - Excel'이 없음;
  - `nextWorkspaceName([])` → `'배치 1'`, `[{name:'배치 1'},{name:'배치 3'}]` → `'배치 2'`;
  - store: 저장 → 읽기 같은 값; (Review Focus 5) 본 파일이 `'{'`이고 `.bak`이 정상 → `recovered: true`·`.bak`의 목록·`.broken-*` 사본 존재; 둘 다 깨짐 → 빈 목록·오류·원본 내용 그대로; 규칙 하나가 잘못된 파일 → 읽기 오류 → 다음 저장 전에 `.broken-*` 사본; 캐시는 수정 시각이 같으면 다시 읽지 않음(`utimes`);
  - 기존 `glossary-store.test.ts` 전부 통과.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/main/storage src/shared/workspace src/main/workspace src/main/glossary` → FAIL(모듈 없음)
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — PASS, `npm run typecheck`
- [ ] **Step 5: 커밋** — `feat: 원자적 JSON 저장과 워크스페이스 파일`

### Task 2: 모니터 구성 지문·DIP 배치 계산·지금 배치 읽기

**Files:**
- Create: `desktop/src/shared/workspace/monitors.ts`, `desktop/src/shared/workspace/layout-math.ts`, `desktop/src/shared/workspace/capture.ts`
- Test: `desktop/src/shared/workspace/monitors.test.ts`, `layout-math.test.ts`, `capture.test.ts`

**Interfaces:**
- Consumes: Task 1 타입, `MonitorInfo`·`Rect`·`WindowInfo`(`shared/types.ts`), `foldForMatch`
- Produces:
  ```ts
  monitorKey(m: MonitorInfo): string
  monitorFingerprint(monitors: MonitorInfo[]): string
  monitorRole(m: MonitorInfo): MonitorRoleName
  toSavedMonitor(m: MonitorInfo): SavedMonitor
  monitorOfRect(r: Rect, monitors: { bounds: Rect }[]): number          // 가장 많이 겹치는 모니터 순번, 없으면 -1
  RATIO_DIGITS = 4; MIN_VISIBLE_DIP = 48
  toRatio(frame: Rect, workArea: Rect): RatioRect
  fromRatio(r: RatioRect, workArea: Rect): Rect
  keepOnScreen(r: Rect, workArea: Rect, minVisible?: number): Rect
  EXCLUDED_CLASSES = ['Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd']
  interface CaptureSkipped { minimized: number; excluded: number; offscreen: number; overLimit: number }
  captureLayout(o: { windows: WindowInfo[]; monitors: MonitorInfo[]; toDip(physical: Rect): Rect; newId(): string }): { fingerprint: string; layout: SavedLayout; skipped: CaptureSkipped }
  deriveTitleRules(titles: string[]): (string | null)[]
  appLabel(rule: Pick<WindowRule, 'savedTitle' | 'match'>): string
  ```

값과 규칙:
- 키: `` `${round(bounds.width × scale)}x${round(bounds.height × scale)}@${round(scale × 100)}${isInternal ? 'i' : ''}:${round(bounds.x)},${round(bounds.y)}` ``(물리 해상도·배율 %·내장 표시·DIP 위치). 지문: `` `${모니터 수}|` ``+ 키를 코드 단위 순서로 정렬해 `|`로 연결. 주 모니터는 Windows에서 늘 (0,0)이므로 주 모니터가 바뀌면 위치가 달라져 지문도 달라진다.
- 역할: 주 모니터면 `primary`, 아니고 내장이면 `internal`, 나머지 `secondary`.
- 비율은 작업 영역 기준(§11)이고 소수 넷째 자리로 반올림한다. `fromRatio`는 반올림한 정수 DIP. `keepOnScreen`: 너비·높이가 작업 영역보다 크면 작업 영역 크기로 줄이고 그 축의 위치를 작업 영역 시작으로 설정한다. 그 밖에는 x를 `[wa.x − width + 48, wa.right − 48]`, y를 `[wa.y, wa.bottom − 48]`로 자른다(창 일부와 제목 줄이 보임).
- `captureLayout`: 입력 창은 `listWindows()` 순서(z-순서, 0이 맨 위)다. 클래스가 `EXCLUDED_CLASSES`면 excluded(바탕 화면·작업 표시줄은 제목이 있는 셸 창), 최소화면 minimized, `toDip(frame)`이 어느 모니터와도 겹치지 않으면 offscreen으로 집계하고 건너뛴다. 최대화면 state `maximized`·rect `{0,0,1,1}`, 아니면 `toRatio(dip, 그 모니터 작업 영역)`. order는 남은 창의 순번, 40개를 넘는 창은 overLimit. 규칙 id는 `newId()`, savedTitle은 200자로 자른다. 같은 exe(대소문자 무시) 창마다 `deriveTitleRules`로 titleIncludes를 정한다. `layout.monitors`는 `monitors` 순서의 `toSavedMonitor`.
- `deriveTitleRules`: 창이 1개면 `[null]`(문서 이름이 바뀌어도 그 프로그램 창이면 짝지음). 2개 이상이면 제목을 `' - '`·`' — '`·`' | '`로 구간을 구분하고, 모든 제목의 끝 구간이 (공백 제거·대소문자 무시) 같으면 그 구간을 제거하는 일을 반복한 뒤, 남은 마지막 구간을 규칙으로 한다. 남은 구간이 없거나 다른 창과 규칙이 같으면 그 창들은 null.
- `appLabel`(알림·편집 화면 전용): savedTitle에 구분 기호가 있고 마지막 구간이 1~30자면 그 구간, 아니면 exe에서 확장자를 뺀 이름.

시험 모니터(DIP): 주 모니터 P `{ id: '1', bounds: {0,0,1920,1080}, workArea: {0,0,1920,1040}, scaleFactor: 1, isPrimary: true, isInternal: false }`, 노트북 L `{ id: '2', bounds: {-1920,0,1920,1200}, workArea: {-1920,0,1920,1152}, scaleFactor: 1.5, isPrimary: false, isInternal: true }`. 가짜 `toDip`: 물리 x < 0이면 `{ x: (x + 2880) / 1.5 − 1920, y: y / 1.5, width: w / 1.5, height: h / 1.5 }`, 아니면 그대로.

- [ ] **Step 1: 실패하는 테스트** —
  - `monitorKey(P)` → `'1920x1080@100:0,0'`, `monitorKey(L)` → `'2880x1800@150i:-1920,0'`; `monitorFingerprint([L, P])`와 `([P, L])` 모두 `'2|1920x1080@100:0,0|2880x1800@150i:-1920,0'`; (Review Focus 3) L의 배율만 1.25로 → 다른 지문, P를 x 1920으로 옮기고 L을 주 모니터로 → 다른 지문, `[P]`만 → `'1|1920x1080@100:0,0'`; 역할 P primary·L internal·내장이 아닌 보조 secondary;
  - `toRatio({960,0,960,1040}, P.workArea)` → `{0.5,0,0.5,1}`; `toRatio({100,50,333,777}, P.workArea)` → `{0.0521,0.0481,0.1734,0.7471}`이고 `fromRatio`로 되돌리면 `{100,50,333,777}`; `toRatio({-1920,0,960,576}, L.workArea)` → `{0,0,0.5,0.5}`;
  - `keepOnScreen` P 작업 영역: `{1900,-30,800,600}` → `{1872,0,800,600}`; `{-900,100,800,600}` → `{-752,100,800,600}`; `{-100,0,2500,900}` → `{0,0,1920,900}`; `{0,1030,400,300}` → y 992;
  - `monitorOfRect({1800,0,400,400}, [P, L])` → 0; `{-100,0,300,300}` → 0(P와 200, L과 100 겹침); `{5000,5000,10,10}` → -1;
  - `captureLayout`: 창 6개(z-순서) — ① EXCEL.EXE·XLMAIN·'가상자동차 보고서.xlsx - Excel'·frame `{0,0,960,1040}`, ② EXCEL.EXE·'예산.xlsx - Excel'·`{960,0,960,1040}`, ③ Code.exe·'a.ts - sure - Visual Studio Code'·`{-2880,0,1440,864}`, ④ notepad.exe·'메모 - Windows 메모장'·maximized·`{0,0,1920,1040}`, ⑤ explorer.exe·Progman·'Program Manager', ⑥ chrome.exe·minimized·`{-32000,-32000,160,28}` → 규칙 4개: ①은 titleIncludes '가상자동차 보고서.xlsx'·rect `{0,0,0.5,1}`·monitor P 키·normal·order 0, ②는 '예산.xlsx'·`{0.5,0,0.5,1}`·order 1, ③은 titleIncludes 없음·monitor L 키·`{0,0,0.5,0.5}`·order 2, ④는 maximized·`{0,0,1,1}`·order 3; skipped `{ minimized: 1, excluded: 1, offscreen: 0, overLimit: 0 }`; layout.monitors `[toSavedMonitor(P), toSavedMonitor(L)]`; frame `{5000,5000,100,100}`인 창 → offscreen 1; 보통 창 45개 → 규칙 40개·overLimit 5;
  - (Review Focus 2) `deriveTitleRules(['보고서.xlsx - Excel', '예산.xlsx - Excel'])` → `['보고서.xlsx', '예산.xlsx']`; `(['a.ts - sure - Visual Studio Code', 'b.ts - mate - Visual Studio Code'])` → `['sure', 'mate']`; `(['제목 없음 - Windows 메모장', '제목 없음 - Windows 메모장'])` → `[null, null]`; `(['SureMate-WS-A', 'SureMate-WS-B'])` → 그대로; `(['only - App'])` → `[null]`; `(['x - App', 'x - App', 'y - App'])` → `[null, null, 'y']`;
  - `appLabel`: '보고서.xlsx - Excel' → 'Excel'; 'a.ts - sure - Visual Studio Code' → 'Visual Studio Code'; 'SureMate-WS-A'·powershell.exe → 'powershell'; 제목 ''·EXCEL.EXE → 'EXCEL'; 마지막 구간 40자 → exe 이름.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/shared/workspace` → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — PASS, `npm run typecheck`
- [ ] **Step 5: 커밋** — `feat: 모니터 구성 지문과 지금 창 배치 읽기`

### Task 3: 창 짝짓기와 복원 계획

**Files:**
- Create: `desktop/src/shared/workspace/match.ts`, `desktop/src/shared/workspace/restore-plan.ts`
- Test: `desktop/src/shared/workspace/match.test.ts`, `restore-plan.test.ts`

**Interfaces:**
- Consumes: Task 1·2(`monitorFingerprint`, `monitorKey`, `fromRatio`, `keepOnScreen`, `appLabel`), `foldForMatch`
- Produces:
  ```ts
  type LiveWindow = Pick<WindowInfo, 'hwnd' | 'exe' | 'className' | 'title' | 'minimized' | 'maximized' | 'elevated'>
  assignWindows(rules: WindowRule[], windows: LiveWindow[]): Map<string /* rule id */, LiveWindow>
  interface RestoreStep { ruleId: string; app: string; hwnd: string; target: Rect /* DIP */; dpi: number; state: WindowState }
  type PlanSkip = { ruleId: string; app: string; reason: 'missing' | 'elevated' }
  type RestorePlan =
    | { kind: 'ready'; steps: RestoreStep[]; skipped: PlanSkip[]; total: number; gathered: boolean }
    | { kind: 'needs-gather'; savedMonitors: number; currentMonitors: number }
    | { kind: 'empty' }
  type ReadyPlan = Extract<RestorePlan, { kind: 'ready' }>
  planRestore(o: { workspace: Workspace; monitors: MonitorInfo[]; windows: LiveWindow[]; gather: boolean; selfElevated: boolean | null }): RestorePlan
  ```

짝짓기(§11 "불러올 때" 2단계, 창 하나는 규칙 하나에만):
- 후보: exe가 같고(대소문자 무시), 규칙에 className이 있으면 같으며, titleIncludes는 NFC + `foldForMatch`한 제목에 포함되고, titleRegex는 `new RegExp(re, 'iu')`가 맞는 창.
- 순서: 제목 조건이 있는 규칙을 먼저, 그다음 나머지. 각 무리 안에서는 order 오름차순이다. 규칙마다 아직 배정하지 않은 후보 중에서 접은 제목이 접은 savedTitle과 같은 창을 먼저, 다음은 z-순서(입력 배열 순번)로 하나를 선택한다. 제목 조건이 맞는 창이 없으면 다른 창으로 대신하지 않는다(그 규칙은 "못 찾음").

계획(§11 "불러올 때" 1·6단계, v4 범위):
- 지금 지문의 배치가 있으면 같은 구성이다. 없으면 `gather`가 false일 때 `needs-gather`(저장한 모니터 수는 첫 배치의 `monitors.length`)를 돌려주고, true일 때 첫 배치(추가 순서)를 주 모니터로 모은다. 배치가 하나도 없거나 켜진 규칙이 없으면 `empty`.
- 켜진 규칙마다: 창이 없으면 `missing`, 창이 관리자 권한(`elevated === true`)이고 Sure-Mate가 관리자 권한이 아니면(`selfElevated !== true`) `elevated`(UIPI, §11 7단계)로 건너뛴다. `elevated`가 null(알 수 없음)이면 시도한다.
- 대상 모니터: 같은 구성이면 `monitorKey`가 `target.monitor`와 같은 모니터(없으면 주 모니터), 모으기면 주 모니터. 목표는 `keepOnScreen(fromRatio(rect, 작업 영역), 작업 영역)`, maximized면 작업 영역 그대로. dpi는 `round(scaleFactor × 96)`.
- steps는 order 내림차순(맨 아래 창부터 이동하고 올려 z-순서를 되살린다). total은 켜진 규칙 수.

Task 2의 P·L과 캡처 규칙 4개(①~④)를 사용한다.

- [ ] **Step 1: 실패하는 테스트** —
  - (Review Focus 2) 지금 창 [EXCEL '예산.xlsx - Excel'(z0), EXCEL '기타.xlsx - Excel'(z1), Code(z2)] → ① 규칙은 배정 없음, ② 규칙은 '예산' 창, ③ 규칙은 Code; 같은 exe의 exe만 있는 규칙(order 0)과 제목 규칙(order 5) → 제목 규칙이 맞는 창을 먼저 가져감; 제목 조건 없는 메모장 규칙 2개(savedTitle '메모 - Windows 메모장'·'제목 없음 - Windows 메모장')와 지금 메모장 ['제목 없음 - Windows 메모장'(z0), '메모 - Windows 메모장'(z1)] → 각 규칙이 같은 제목 창; 'excel.exe'와 'EXCEL.EXE'는 같음; className이 다르면 후보 아님; titleRegex `'^가상자동차'`가 '가상자동차 보고서.xlsx - Excel'과 맞음; 창 하나는 규칙 하나에만 배정;
  - 같은 구성 계획(지금 모니터 [P, L], 지금 창 [예산, Code, 메모장]) → steps 순서 메모장(order 3)·Code(2)·예산(1); Code 목표 `{-1920,0,960,576}`·dpi 144; 메모장 목표 P 작업 영역·state maximized; skipped `[{ ruleId: ①, app: 'Excel', reason: 'missing' }]`; total 4;
  - (Review Focus 1) 관리자 권한 창과 `selfElevated: false` → `elevated` 건너뜀, `selfElevated: true` → step, `elevated: null` → step; 꺼진 규칙은 total에서 제외(3);
  - (Review Focus 3) 지금 모니터 [P]만(노트북 분리) → `{ kind: 'needs-gather', savedMonitors: 2, currentMonitors: 1 }`; `gather: true` → 모든 목표가 P 안이고 Code 목표 `{0,0,960,520}`·dpi 96·gathered true; 저장 rect `{x: 0.99, y: 0.97, w: 0.5, h: 0.5}` → 목표 `{1872, 992, 960, 520}`;
  - 배치 없음 → empty; 모든 규칙 꺼짐 → empty.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/shared/workspace` → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — PASS, `npm run typecheck`
- [ ] **Step 5: 커밋** — `feat: 저장한 창 규칙과 지금 창 짝짓기, 복원 계획`

### Task 4: 복원 실행·결과 문구·Win32 연결부

**Files:**
- Create: `desktop/src/main/workspace/restore-runner.ts`, `desktop/src/shared/workspace/messages.ts`
- Modify: `desktop/src/main/native/win32.ts`, `desktop/src/main/native/windows.ts`
- Test: `desktop/src/main/workspace/restore-runner.test.ts`, `desktop/src/shared/workspace/messages.test.ts`

**Interfaces:**
- Consumes: Task 3 `ReadyPlan`·`RestoreStep`, Task 2 `CaptureSkipped`, `rectDiff`, M1 `moveWindow`·`setForeground`·`getForegroundWindow`, M5 T4 `SWP_NOMOVE`
- Produces:
  ```ts
  interface RestorePorts {
    state(hwnd: string): { minimized: boolean; maximized: boolean; hung: boolean; frame: Rect /* 물리 */ } | null
    normalize(hwnd: string, o: { activate: boolean }): void
    move(hwnd: string, physical: Rect, dpi: number): Promise<void>
    maximize(hwnd: string): void
    raise(hwnd: string): void
    toPhysical(dip: Rect): Rect
    foreground(): string | null
    setForeground(hwnd: string): boolean
    sleep(ms: number): Promise<void>
    now(): number
  }
  type OutcomeResult = 'placed' | 'off' | 'gone' | 'hung' | 'blocked' | 'failed' | 'timeout' | 'missing' | 'elevated'
  interface WindowOutcome { ruleId: string; app: string; result: OutcomeResult; diff?: number }
  interface RestoreReport { total: number; placed: number; outcomes: WindowOutcome[]; gathered: boolean; ms: number; maxDiff: number; restoredFocus: boolean }
  RESTORE_TIMING = { settleMs: 120, stateWaitMs: 600, pollMs: 50, verifyDelayMs: 100, retryDelayMs: 200, tolerancePx: 10, maxTotalMs: 10000 }
  createRestoreRunner(p: RestorePorts): { run(plan: ReadyPlan): Promise<RestoreReport> }
  restoreSummary(name: string, r: RestoreReport): string
  saveSummary(o: { name: string; windows: number; skipped: CaptureSkipped }): string
  WORKSPACE_NOTES: { nativeUnavailable: string; busy: string; noWindows: string; limit: string; missing: string; empty: string; saveFailed: string; gatherQuestion: string; gatherDetail(saved: number, current: number): string; gatherYes: string; cancel: string }
  // native/windows.ts
  readWindowState(hwnd: string): { minimized: boolean; maximized: boolean; hung: boolean; frame: Rect } | null
  showWindowNormal(hwnd: string, activate: boolean): void
  showWindowMaximized(hwnd: string): void
  raiseWindow(hwnd: string): void
  moveWindow(hwnd: string, targetPhysical: Rect, targetDpi: number, o?: { async?: boolean }): Promise<{ before: Rect; after: Rect; steps: number }>
  ```

실행 순서(§11 "불러올 때" 3~7단계). 단계마다 시험으로 확인한다:
1. 시작 시각과 `foreground()`를 기억하고, 계획의 skipped를 결과에 먼저 포함한다.
2. step마다: 시작 뒤 10초를 넘었으면 `timeout`. `state`가 null이면 `gone`, `hung`이면 `hung`(응답 없는 창에 호출하지 않음).
3. 최소화·최대화면 `normalize({ activate: false })` → 120ms → 50ms마다 최대 600ms 동안 두 상태가 풀렸는지 확인한다. 안 풀렸으면 `normalize({ activate: true })`로 한 번 더 시도하고, 그래도 안 풀리면 `failed`.
4. `move(hwnd, toPhysical(target), dpi)`(거부하면 `failed`) → 100ms → `state`로 다시 읽어(null이면 `gone`) 차이 `rectDiff(frame, 목표)`를 계산한다.
5. normal인데 차이가 10px을 넘으면 200ms 뒤 한 번 더 이동하고 다시 잰다(배율이 다른 모니터에서 창이 스스로 크기를 바꾼 뒤 최종 크기를 다시 맞춤, §11 4단계).
6. maximized면 `maximize` 뒤 최대 600ms 동안 최대화를 확인해 `placed`, 안 되면 `off`. normal이면 차이 10px 이하 `placed`, 넘고 이동 전 frame과 2px 이내로 그대로면 `blocked`(관리자 권한을 알 수 없던 창이 거부), 나머지 `off`(diff 기록).
7. placed·off인 창은 `raise`로 올린다(맨 아래부터 처리하므로 저장 당시 z-순서가 된다).
8. 끝나면 기억한 창이 있을 때만 `setForeground` 한 번(최소화 해제·최대화가 다른 창을 활성화할 수 있으므로). `placed`는 placed 수, `maxDiff`는 측정한 차이의 최댓값.

보이지 않는 테두리 보정(§11 5단계)과 배율이 다른 모니터로 먼저 옮긴 뒤 크기를 맞추는 두 단계 이동은 기존 `moveWindow`가 수행한다(`frameInsets`·`applyFrameInsets`, DPI가 다르면 60ms 대기). 실행기는 보이는 테두리 기준 물리 사각형만 넘긴다.

Win32 연결부(리눅스에서는 타입 검사만, Task 13에서 Windows로 확인):
```ts
// win32.ts bind에 추가
ShowWindowAsync: user32.func('bool __stdcall ShowWindowAsync(HWND hWnd, int nCmdShow)'),
IsHungAppWindow: user32.func('bool __stdcall IsHungAppWindow(HWND hwnd)'),
// 상수 SW_SHOWNOACTIVATE: 4, SW_SHOWMAXIMIZED: 3, SWP_ASYNCWINDOWPOS: 0x4000
```
`showWindowNormal`은 `ShowWindowAsync(SW_SHOWNOACTIVATE, activate면 SW_RESTORE)`, `showWindowMaximized`는 `ShowWindowAsync(SW_SHOWMAXIMIZED)`, `raiseWindow`는 `SetWindowPos(h, null /* HWND_TOP */, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_ASYNCWINDOWPOS)`, `readWindowState`는 `IsWindow`·`IsIconic`·`IsZoomed`·`IsHungAppWindow`·보이는 테두리다. `moveWindow`의 `async`는 두 `SetWindowPos`에 `SWP_ASYNCWINDOWPOS`를 추가한다. 응답 없는 앱 창에 동기 호출하면 main(팔레트·바)이 멈추므로 비동기 호출과 응답 없음 확인을 함께 사용한다. `SW_SHOWNOACTIVATE`가 최대화 창을 보통 상태로 되돌리는지는 확인 필요(그래서 3단계에 SW_RESTORE 대체가 있다). 개발 명령의 `moveWindow` 호출은 그대로다.

문구 초안(Step 1에서 다듬는다): `restoreSummary`는 `<이름> · 창 <total>개 모두 배치했어요` 또는 `<이름> · 창 <total>개 중 <placed>개 배치`에 까닭별 구간을 ` · `로 연결한다. 까닭 순서와 이름: 못 찾음(missing·gone), 관리자 권한 창이라 건너뜀(elevated·blocked), 응답 없음(hung), 위치가 조금 다름(off), 옮기지 못함(failed·timeout). 구간마다 앱 이름은 두 개까지 `·`로 잇고 나머지는 ` 외 N개`. 모았으면 앞에 `주 모니터로 모았어요 · `. 이름 뒤에는 조사를 붙이지 않는다(받침을 알 수 없는 사용자 이름). `saveSummary`: `<이름> · 창 <windows>개 배치를 저장했어요`와 최소화한 창이 있으면 ` · 최소화된 창 <n>개는 빼고 저장`. 안내: nativeUnavailable는 Global Constraints 문구, busy "창 배치를 옮기는 중이에요. 끝난 뒤 다시 해 주세요.", noWindows "저장할 창이 없어요.", limit "워크스페이스는 30개까지 저장해요. 쓰지 않는 것을 지운 뒤 다시 해 주세요.", missing "저장한 배치를 찾지 못했어요.", empty "불러올 창이 없어요. 편집 화면에서 창을 포함해 주세요.", saveFailed "배치 파일을 저장하지 못했어요.", gatherQuestion은 §11 원문, gatherDetail `저장할 때 모니터 <saved>대 · 지금 <current>대`, 단추 "주 모니터로 모으기"·"취소".

- [ ] **Step 1: 문구** — `design:ux-copy`(없으면 `impeccable` clarify)로 위 문구를 다듬는다. 기준: 존댓말, 짧게, 알림 한 줄에 창 이름 두 개, §11 원문 질문과 "Excel 못 찾음" 형식 유지. 바꾼 문구는 Step 2 기대값에 반영한다.
- [ ] **Step 2: 실패하는 테스트** — 가짜 세계(hwnd마다 상태·frame, `move`가 frame을 목표로 바꾸고 선택적으로 첫 이동만 어긋남, 가짜 `sleep`이 시계를 앞당김):
  - 보통 창 → 호출 순서 `state` → `move` → `state` → `raise`, 결과 placed·diff 0;
  - (Review Focus 1) 최소화 창 → `normalize({activate:false})`가 먼저이고 100ms 뒤 풀린 상태에서 `move`; `SW_SHOWNOACTIVATE`로 안 풀리는 최대화 창 → `normalize({activate:true})` 한 번 더 → 이동; 끝까지 안 풀림 → failed·`move` 없음;
  - maximized 목표 → `move` 뒤 `maximize`, 최대화 확인 → placed; 확인 실패 → off;
  - 첫 이동이 30px 어긋남 → 200ms 뒤 두 번째 `move` → placed; 두 번 다 25px → off·diff 25·maxDiff 25; frame이 그대로 → blocked;
  - `state` null → gone, 최소화 해제 뒤 null → gone, hung → hung이고 `move` 없음, `move` 거부 → failed이고 다음 창은 계속;
  - 창마다 `move`가 6초 걸리면 세 번째 창부터 timeout(10초 상한);
  - 계획의 missing·elevated가 결과에 포함되고 total은 계획 값; `setForeground`는 시작 때 창으로 한 번, `foreground()`가 null이면 호출 없음; `raise`는 placed·off에만, steps 순서;
  - 문구: 3개 모두 → `'QA 모드 · 창 3개 모두 배치했어요'`; 5개 중 4개·Excel missing → `'QA 모드 · 창 5개 중 4개 배치 · Excel 못 찾음'`; 모으기 → `'주 모니터로 모았어요 · '`로 시작; elevated 'Visual Studio' → `'관리자 권한 창이라 건너뜀: Visual Studio'` 포함; missing 셋(Excel, Word, Slack) → `'Excel·Word 외 1개 못 찾음'` 포함; `saveSummary({ name: '배치 1', windows: 5, skipped: { minimized: 2, excluded: 0, offscreen: 0, overLimit: 0 } })` → `'배치 1 · 창 5개 배치를 저장했어요 · 최소화된 창 2개는 빼고 저장'`(Step 1에서 바꿨으면 그 값).
- [ ] **Step 3: 실패 확인** — `npx vitest run src/main/workspace src/shared/workspace/messages.test.ts` → FAIL
- [ ] **Step 4: 구현** — native 함수는 리눅스에서 타입 검사만 한다.
- [ ] **Step 5: 통과 확인** — PASS, `npm run typecheck`
- [ ] **Step 6: 커밋** — `feat: 창 배치 복원 실행과 결과 알림`

### Task 5: 워크스페이스 서비스·팔레트 명령·IPC

**Files:**
- Create: `desktop/src/shared/workspace/edit.ts`, `desktop/src/shared/workspace/workspace-ipc.ts`, `desktop/src/main/workspace/workspace-service.ts`, `desktop/src/main/workspace/workspace-items.ts`, `desktop/src/main/workspace/workspace-runtime.ts`
- Modify: `desktop/src/main/prompts/palette-items.ts`, `desktop/src/main/index.ts`(`runItem`·`listItems`·시작), `desktop/src/main/ipc.ts`, `desktop/src/shared/ipc-channels.ts`, `desktop/src/preload/index.ts`, `desktop/src/renderer/src/palette/filter-items.ts`, `desktop/src/renderer/src/palette/Palette.tsx`, `desktop/src/renderer/src/preview/fake-api.ts`
- Test: `desktop/src/shared/workspace/edit.test.ts`, `workspace-ipc.test.ts`, `desktop/src/main/workspace/workspace-service.test.ts`, `workspace-items.test.ts`, `desktop/src/main/prompts/palette-items.test.ts`, `desktop/src/renderer/src/palette/filter-items.test.ts`

**Interfaces:**
- Consumes: Task 1~4, M1 `listWindows`·`selfElevated`·`getMonitors`·`toDip`·`toPhysical`·`nativeStatus`, M4 `compactOf`·`parseQuery`, M5 T11·M6 T10 `buildPaletteItems`, M5 T2 `createFakeApi`
- Produces:
  ```ts
  interface WorkspaceEdit { name: string; aliases: string[]; rules: { id: string; enabled: boolean; titleIncludes: string | null; monitor: string }[] }
  applyWorkspaceEdit(ws: Workspace, edit: WorkspaceEdit, others: Workspace[], now: Date): { ok: true; workspace: Workspace } | { ok: false; errors: string[] }
  interface WorkspaceView { workspace: Workspace; sameConfig: boolean }
  type WorkspaceFailReason = 'native-unavailable' | 'busy' | 'no-windows' | 'limit' | 'missing' | 'save-failed'
  type WorkspaceSaveResult = { ok: true; id: string; name: string; windows: number; skipped: CaptureSkipped } | { ok: false; reason: WorkspaceFailReason; message: string }
  type WorkspaceEditResult = { ok: true; workspace: Workspace } | { ok: false; errors: string[] }
  type WorkspaceRunResult = { ok: true; report: RestoreReport } | { ok: false; reason: WorkspaceFailReason | 'cancelled' | 'empty' }
  type WorkspaceSource = 'palette' | 'bar' | 'hotkey' | 'editor'
  interface WorkspaceService {
    list(): Promise<Workspace[]>
    view(id: string): Promise<WorkspaceView | null>
    saveNew(o: { source: WorkspaceSource; name?: string; quiet?: boolean }): Promise<WorkspaceSaveResult>
    recapture(id: string, o: { source: WorkspaceSource; quiet?: boolean }): Promise<WorkspaceSaveResult>
    saveAs(name: string, source: WorkspaceSource): Promise<WorkspaceSaveResult>
    run(id: string, source: WorkspaceSource): Promise<WorkspaceRunResult>
    edit(id: string, edit: WorkspaceEdit): Promise<WorkspaceEditResult>
    remove(id: string): Promise<boolean>
    setHotkey(id: string, hotkey: string | null): Promise<boolean>
    onChange(cb: (list: Workspace[]) => void): () => void
  }
  createWorkspaceService(d: {
    store: { get(): Promise<Workspace[]>; save(list: Workspace[]): Promise<void> }
    nativeOk(): boolean
    snapshot(): { windows: WindowInfo[]; monitors: MonitorInfo[] }
    toDip(physical: Rect): Rect
    selfElevated(): boolean | null
    runner: { run(plan: ReadyPlan): Promise<RestoreReport> }
    confirmGather(o: { savedMonitors: number; currentMonitors: number }): Promise<boolean>
    notify(message: string): void
    newId(): string; now(): Date
    log(event: string, data: Record<string, unknown>): void
  }): WorkspaceService
  createWorkspaceRuntime(o: { userData: string; reportErrors(errors: string[]): void }): WorkspaceService
  WORKSPACE_SAVE_ID = 'cmd.workspace-save'
  workspacePaletteItems(list: Workspace[], fingerprint: string): PaletteItem[]
  WORKSPACE_SAVE_AS_ID = 'workspace-save-as'
  withWorkspaceSaveAs(items: PaletteItem[], query: string): PaletteItem[]
  parseWorkspaceId(v: unknown): string | null; parseWorkspaceName(v: unknown): string | null; parseWorkspaceEdit(v: unknown): WorkspaceEdit | null
  ```
  IPC 이름 `workspaceGet: 'workspace:get'`, `workspaceEdit: 'workspace:edit'`, `workspaceRecapture: 'workspace:recapture'`, `workspaceRemove: 'workspace:remove'`, `workspaceSaveAs: 'workspace:save-as'`(모두 invoke). `SureMateApi`에 `getWorkspace(id: string): Promise<WorkspaceView | null>`, `editWorkspace(id: string, edit: WorkspaceEdit): Promise<WorkspaceEditResult>`, `recaptureWorkspace(id: string): Promise<WorkspaceSaveResult>`, `removeWorkspace(id: string): Promise<boolean>`, `saveWorkspaceAs(name: string): Promise<WorkspaceSaveResult>`. `buildPaletteItems`의 옵션에 `workspaces: PaletteItem[]`.

서비스 규칙:
- 한 번에 하나: saveNew·recapture·saveAs·run이 진행 중이면 다음 요청은 알림(busy)·`busy`·로그 `workspace.busy { op }`. `nativeOk()`가 false면 알림(nativeUnavailable)과 `native-unavailable`이고 파일·창을 바꾸지 않는다.
- saveNew: `snapshot()` → `captureLayout` → 규칙 0개면 `no-windows`, 이미 30개면 `limit`. 새 워크스페이스 `{ id: newId(), name: o.name ?? nextWorkspaceName(list), aliases: [], hotkey: null, layouts: { [지문]: layout }, updatedAt }`. 저장 실패는 `save-failed`. `quiet`가 아니면 성공·실패를 알린다(편집 화면은 결과를 화면에 표시하므로 quiet).
- recapture: 이름·별칭·단축키는 그대로이고 `layouts`를 지금 지문 하나로 바꾼다(Should 8 미구현: 배치는 하나). 새 규칙은 모두 켜짐이다.
- saveAs: 이름이 기존 워크스페이스 이름이나 별칭과 `compactOf`로 같으면 그것을 recapture, 아니면 그 이름으로 saveNew.
- run: 없으면 알림(missing). `planRestore(gather: false)` → `needs-gather`면 `confirmGather` → 거절이면 `cancelled`(로그 `workspace.gather { accepted: false }`, 창 이동 없음) → 수락이면 `gather: true`로 다시 계획. `empty`면 알림. `ready`면 `runner.run` → 알림 `restoreSummary(이름, report)`.
- `applyWorkspaceEdit`: 이름은 공백 제거 1~40자이고 다른 워크스페이스 이름과 `compactOf`가 같으면 오류 "같은 이름의 워크스페이스가 있어요". 별칭은 공백 제거·중복 제거·10개×40자, 넘으면 오류 "별칭은 10개, 하나에 40자까지예요". 규칙은 첫 배치에서 id로 찾아 enabled·titleIncludes(빈 글이면 삭제, 100자 넘으면 오류)·monitor(그 배치의 모니터 키가 아니면 오류 "대상 모니터를 찾지 못했어요")를 바꾸고 모르는 id는 무시한다. updatedAt은 now. 문구는 Task 8의 ux-copy에서 다듬는다.
- 저장·편집·삭제·단축키 저장 뒤 `onChange(목록)`. 로그: `workspace.save { source, ok, reason?, windows, minimized, excluded, offscreen, monitors }`, `workspace.restore { source, total, placed, missing, elevated, hung, blocked, failed, off, timeout, gathered, maxDiff, ms, restoredFocus }`, `workspace.edit { rules, enabled, aliases }`, `workspace.remove {}`. 이름·제목은 남기지 않는다.

팔레트 연결:
- `workspacePaletteItems`: 맨 앞에 저장 명령 `{ id: 'cmd.workspace-save', group: 'workspace', title: '지금 배치 저장', subtitle: '지금 열린 창 위치를 새 워크스페이스로 저장해요', keywords: ['save', 'workspace', 'layout', '워크스페이스', '레이아웃', '창 배치', '배치 저장'] }`, 이어서 워크스페이스마다 `{ id: 'workspace:<id>', group: 'workspace', title: 이름, subtitle: '창 N개'(+ 단축키가 있으면 ` · <단축키>`, 지금 지문의 배치가 없으면 ` · 다른 모니터 구성`), keywords: 별칭 }`을 updatedAt 내림차순으로. 저장 명령이 `workspace` 구역이라 `@` 범위에서도 보인다.
- `buildPaletteItems`는 워크스페이스 항목을 명령 다음, 위키 앞에 둔다. index.ts의 `listItems`는 `workspacePaletteItems(await workspaces.list(), monitorFingerprint(getMonitors()))`를 넘긴다.
- `runItem`: `cmd.workspace-save` → 키 떼기 확인 → `saveNew({ source: 'palette' })` → 성공이고 키를 뗐으면 팔레트를 숨기고 원래 창으로(Task 8이 편집 화면 열기로 바꾼다). `workspace:<id>` → 키를 뗐으면 `hidePalette({ restoreFocus: true })`(떼지 않으면 팔레트를 둔 채 실행, M5 바 명령과 같은 규칙) → `run(id, 'palette')`.
- `withWorkspaceSaveAs`: `@` 범위이고 글이 1~40자일 때만 맨 끝에 한 줄 추가. 같은 이름(`compactOf`)의 워크스페이스 항목이 있으면 `{ id: WORKSPACE_SAVE_AS_ID, group: 'workspace', title: '‘<이름>’ 배치를 지금 배치로 바꾸기' }`, 없으면 `title: '‘<글>’ 이름으로 지금 배치 저장'`(부제 '지금 열린 창 위치를 이 이름으로 저장해요'). `Palette.tsx`의 `run`은 이 id를 `runItem`으로 보내지 않고 `saveWorkspaceAs(parseQuery(query).text)`를 호출하며, 성공하면 `hide()`. 입력한 이름이 id에 포함되지 않으므로 `palette.run` 로그에 남지 않는다.
- `workspace-runtime.ts`: `createWorkspaceCache(userData, reportErrors)`, 포트(`readWindowState`·`showWindowNormal`·`moveWindow(…, { async: true })`·`showWindowMaximized`·`raiseWindow`·`toPhysical`·`getForegroundWindow`·`setForeground`·`setTimeout` 기반 sleep·`Date.now`), `snapshot` = `{ windows: listWindows(), monitors: getMonitors() }`, `confirmGather` = `dialog.showMessageBox({ type: 'question', title: 'Sure-Mate', message: gatherQuestion, detail: gatherDetail(…), buttons: [gatherYes, cancel], defaultId: 0, cancelId: 1, noLink: true })`(부모 창 없음, 용어 팩 가져오기 확인과 같은 방식), `notify`, `randomUUID`. index.ts가 `reportFileErrors('워크스페이스', 'workspaces.loadErrors', errors)`를 넘긴다.
- IPC 처리: 값 검사(`parseWorkspaceId` `^[A-Za-z0-9-]{1,64}$`, `parseWorkspaceName` 공백 제거 1~40자, `parseWorkspaceEdit`는 모양만 확인 — 이름 문자열 200자 이하, 별칭 20개 이하 문자열, 규칙 40개 이하·각 칸 타입과 길이)를 통과하지 못하면 null·false·`{ ok: false, errors: ['요청 형식이 맞지 않아요.'] }`. `fake-api.ts`는 새 메서드를 빈 결과로 구현한다.

시험 데이터: Task 2의 P·L, 서비스 가짜(메모리 저장소, 고정 snapshot, 계획을 기록하는 가짜 runner, 가짜 confirmGather·시계).

- [ ] **Step 1: 실패하는 테스트** —
  - `applyWorkspaceEdit`: 이름 공백 → 오류, 이름 'qa 모드'와 다른 워크스페이스 'QA 모드' → 중복 오류, 별칭 'qa, 시험' 처리 결과 `['qa', '시험']`(분리는 Task 8, 여기서는 배열), 11개 → 오류, 규칙 끄기·titleIncludes 빈 글 → 삭제, 101자 → 오류, 모르는 모니터 키 → 오류, 모르는 규칙 id → 무시;
  - 값 검사: 정상 통과, id `'a/b'`·65자·숫자 → null, 이름 `'  '`·41자 → null, 규칙 41개·enabled `'yes'` → null;
  - 서비스: saveNew → 저장된 이름 '배치 1'·layouts 키가 지금 지문·알림 1회(`saveSummary`), 두 번째 → '배치 2'; `nativeOk` false → `native-unavailable`·알림·저장 없음; 창 0개 → `no-windows`; 30개 → `limit`; saveAs('QA 모드') → 새 이름; 'QA 모드'가 있을 때 saveAs('qa 모드') → 같은 id recapture(개수 그대로, 이름 그대로); recapture는 이름·별칭·단축키 유지·layouts 키 1개;
  - run 같은 구성 → runner 1회(kind ready)·알림 `restoreSummary`; (Review Focus 3) 다른 구성 → `confirmGather({ savedMonitors: 2, currentMonitors: 1 })` → false → `cancelled`·runner 호출 없음·로그 `workspace.gather { accepted: false }` → true → 계획 gathered true; 없는 id → `missing`; 첫 run이 끝나기 전 두 번째 run → `busy`·알림·runner 1회;
  - edit·remove·setHotkey 뒤 `onChange`; 모든 로그 인자 JSON에 'QA 모드'·'가상자동차'가 없음;
  - `workspacePaletteItems`: 첫 항목 `cmd.workspace-save`, 부제 `'창 3개'`, 단축키 `'Ctrl+Alt+1'` → `'창 3개 · Ctrl+Alt+1'`, 다른 지문 → `' · 다른 모니터 구성'`로 끝남, updatedAt 내림차순;
  - `buildPaletteItems`(…, `workspaces`) → 워크스페이스 항목이 명령 뒤·위키 앞;
  - `withWorkspaceSaveAs`: `'@QA 모드'`에 같은 이름 없음 → 저장 줄 `'‘QA 모드’ 이름으로 지금 배치 저장'`, 같은 이름 있음 → 바꾸기 줄, `'@'` → 없음, 범위 없는 `'QA 모드'` → 없음, 41자 → 없음.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/shared/workspace src/main/workspace src/main/prompts src/renderer/src/palette` → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — PASS(기존 palette-search 포함), `npm test`, `npm run typecheck`, `npx electron-vite build`
- [ ] **Step 5: 커밋** — `feat: 워크스페이스 저장·불러오기 서비스와 팔레트 명령`

### Task 6: 워크스페이스 단축키

**Files:**
- Create: `desktop/src/shared/hotkeys/accelerator-format.ts`, `desktop/src/main/workspace/workspace-hotkeys.ts`, `desktop/src/main/hotkeys/hotkey-recording.ts`
- Modify: `desktop/src/main/hotkeys/hotkey-manager.ts`, `desktop/src/main/index.ts`, `desktop/src/main/ipc.ts`, `desktop/src/shared/ipc-channels.ts`, `desktop/src/preload/index.ts`, `desktop/src/renderer/src/preview/fake-api.ts`
- Test: `desktop/src/shared/hotkeys/accelerator-format.test.ts`, `desktop/src/main/hotkeys/hotkey-manager.test.ts`, `desktop/src/main/hotkeys/hotkey-recording.test.ts`, `desktop/src/main/workspace/workspace-hotkeys.test.ts`

**Interfaces:**
- Consumes: Task 5 `WorkspaceService`의 `list`·`setHotkey`·`run`·`onChange`, M1 `HotkeyManager`·`checkAccelerator`·`acceleratorKeyCode`, M5 T4 `Timers`, M6 `HotkeyId`
- Produces:
  ```ts
  acceleratorFromKey(k: { code: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }): string | null
  sameAccelerator(a: string, b: string): boolean
  type HotkeyId = 'palette' | 'lookup' | 'pet-control' | `workspace:${string}`
  HotkeyManager.unbind(id: HotkeyId): void
  HotkeyManager.ids(): HotkeyId[]
  type HotkeySetResult = { ok: true; hotkey: string | null; warning?: string } | { ok: false; reason: 'in-use' | 'blocked' | 'duplicate' | 'missing' | 'invalid'; detail?: string }
  createWorkspaceHotkeys(d: { manager: Pick<HotkeyManager, 'bind' | 'unbind' | 'ids' | 'current'>; service: Pick<WorkspaceService, 'list' | 'setHotkey' | 'run'>; otherHotkeys(): string[]; log(event: string, data: Record<string, unknown>): void }): { sync(list: Workspace[]): { failed: { id: string; hotkey: string }[] }; set(id: string, hotkey: string | null): Promise<HotkeySetResult> }
  RECORDING_MAX_MS = 30000
  createHotkeyRecording(d: { suspendAll(): void; resumeAll(): { failed: HotkeyId[] }; userSuspended(): boolean; timers: Timers; warn(message: string): void }): { set(on: boolean): void; active(): boolean }
  ```
  IPC `workspaceHotkey: 'workspace:hotkey'`(invoke), `hotkeyRecording: 'hotkey:recording'`(send). `SureMateApi`에 `setWorkspaceHotkey(id: string, hotkey: string | null): Promise<HotkeySetResult>`, `hotkeyRecording(on: boolean): void`.

`acceleratorFromKey`는 11/15 설정 화면의 단축키 녹화도 사용한다(§14 "단축키 칸은 눌러서 조합을 녹화하고, 등록에 실패하면 바로 알린다"). 보조키 순서 Ctrl·Alt·Shift, 주 키는 `KeyA`~`KeyZ` → `A`~`Z`, `Digit0`~`Digit9`, `F1`~`F24`, `Space`, `Backquote` → `` ` ``, `Minus` `-`, `Equal` `=`, `BracketLeft` `[`, `BracketRight` `]`, `Backslash` `\`, `Semicolon` `;`, `Quote` `'`, `Comma` `,`, `Period` `.`, `Slash` `/`, `ArrowUp/Down/Left/Right` → `Up/Down/Left/Right`, `Home`·`End`·`PageUp`·`PageDown`·`Insert`·`Delete`. 보조키만 눌렀거나, Win 키(`metaKey`)가 있거나, 그 밖의 키(숫자 키패드 등)면 null. 결과는 모두 `acceleratorKeyCode`가 아는 키라서 기존 자동 반복 거르기(`isAcceleratorHeld`)가 그대로 동작한다.

`set(id, hotkey)` 순서: 워크스페이스가 없으면 `missing` → null이면 `unbind` 후 저장 → `acceleratorKeyCode`가 모르는 키면 `invalid` → `checkAccelerator` block이면 `blocked`(detail = 까닭) → 팔레트·조회·펫 조종·다른 워크스페이스 단축키와 `sameAccelerator`면 `duplicate` → `bind('workspace:<id>', acc, () => service.run(id, 'hotkey'))`가 실패하면 `in-use`(이전 조합은 HotkeyManager가 되돌림, 저장하지 않음) → 성공하면 `setHotkey` 저장, warn 수준이면 `warning`. `sync(list)`: 단축키가 있는 워크스페이스를 등록(지금 조합과 같으면 건너뜀)하고, 목록에 없거나 단축키가 null인 `workspace:` 항목은 해제한다.

index.ts: 팔레트·조회·펫 조종 단축키 다음에 `sync(await workspaces.list())`를 호출하고 실패가 있으면 트레이 알림 한 번 "워크스페이스 단축키를 등록하지 못했어요: <조합들>". `workspaces.onChange`마다 `sync`. 로그 `workspace.hotkey { ok, reason }`.

녹화(`createHotkeyRecording`, `hotkey:recording`이 `set`을 호출): true → `suspendAll()`(키 녹화 중에는 모든 단축키를 잠시 해제, §6)과 30초 타이머, 이미 녹화 중이면 무시. false 또는 30초 경과 → 트레이 "단축키 일시 중지"가 꺼져 있을 때만(`userSuspended()` false) `resumeAll()`, 실패하면 `warn` 한 번. 30초 상한은 녹화 중에 팔레트가 숨어 renderer의 blur가 전달되지 않아도 단축키가 영영 해제된 채 남지 않게 한다. 트레이의 일시 중지 상태와 녹화 상태는 따로 기록해 서로 덮어쓰지 않는다.

- [ ] **Step 1: 실패하는 테스트** —
  - `acceleratorFromKey`: Digit1+Ctrl+Alt → `'Ctrl+Alt+1'`, KeyQ+Ctrl+Shift → `'Ctrl+Shift+Q'`, F9+Alt → `'Alt+F9'`, Backquote+Alt → `` 'Alt+`' ``, Space+Ctrl+Alt → `'Ctrl+Alt+Space'`, ArrowUp+Ctrl+Alt → `'Ctrl+Alt+Up'`, ControlLeft → null, Numpad1+Ctrl → null, metaKey → null; null이 아닌 결과는 모두 `acceleratorKeyCode(결과) !== null`;
  - `sameAccelerator('ctrl+alt+1', 'Alt+Ctrl+1')` true, `('Ctrl+Alt+1', 'Ctrl+Alt+2')` false;
  - HotkeyManager(가짜 backend): `unbind`가 등록을 해제하고 `ids()`에서 빠짐, 모르는 id → 동작 없음;
  - workspace-hotkeys(가짜 manager·service): set 성공 → bind·저장, 다른 앱이 사용 중 → `in-use`·저장 없음, `'Alt+F12'` → `blocked`, 팔레트와 같은 조합 → `duplicate`, null → unbind·null 저장, 없는 id → `missing`; 등록한 콜백이 `run(id, 'hotkey')`를 호출; `sync`가 2개 등록·삭제된 것 해제·실패 목록 반환; 로그에 이름 없음;
  - hotkey-recording(가짜 타이머): `set(true)` → suspendAll 1회, 다시 `set(true)` → 추가 없음; `set(false)` → resumeAll 1회; `userSuspended` true면 `set(false)`에도 resumeAll 없음; `set(false)` 없이 30초 → resumeAll 1회·`active()` false; resumeAll 실패 → warn 1회.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/shared/hotkeys src/main/hotkeys src/main/workspace` → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — PASS, `npm run typecheck`
- [ ] **Step 5: 커밋** — `feat: 워크스페이스 단축키`

### Task 7: 바 펼침 창의 워크스페이스 메뉴

**Files:**
- Modify: `desktop/src/shared/flyout/flyout-content.ts`, `desktop/src/shared/flyout/flyout-action.ts`, `desktop/src/renderer/src/flyout/menu-model.ts`, `desktop/src/renderer/src/flyout/WorkspaceMenu.tsx`, `desktop/src/main/workspace/workspace-items.ts`, `desktop/src/main/bar/bar-runtime.ts`, `desktop/src/main/index.ts`, `desktop/src/renderer/src/preview/fake-api.ts`·`scenes.tsx`
- Test: `desktop/src/renderer/src/flyout/menu-model.test.ts`, `desktop/src/shared/flyout/flyout-action.test.ts`, `desktop/src/main/workspace/workspace-items.test.ts`

**Interfaces:**
- Consumes: M5 T7 `FlyoutContent`·`FlyoutController.toggleMenu`·`close`, T8 `MenuRow`·`parseFlyoutAction`·`WorkspaceMenu.tsx`, T10 `createBarRuntime`·`createBarActions`, Task 5 `WorkspaceService`, Task 2 `monitorFingerprint`
- Produces:
  - `FlyoutContent`의 워크스페이스 메뉴를 `{ kind: 'workspace-menu'; workspaces: { id: string; name: string; windows: number; otherConfig: boolean }[]; canSave: boolean; more: number }`로 확장
  - `FlyoutAction`에 `{ type: 'workspace-run'; id: string } | { type: 'workspace-save' } | { type: 'workspace-edit' }`
  - `MenuRow`에 `disabled?: boolean`
  - `WORKSPACE_MENU_MAX = 8`, `workspaceMenuContent(list: Workspace[], fingerprint: string, canSave: boolean): Extract<FlyoutContent, { kind: 'workspace-menu' }>`, `workspaceMenuRows(c: Extract<FlyoutContent, { kind: 'workspace-menu' }>): MenuRow[]`
  - `createBarRuntime` 옵션 `workspaceMenu(): Promise<Extract<FlyoutContent, { kind: 'workspace-menu' }>>`, `onWorkspaceAction(a: Extract<FlyoutAction, { type: 'workspace-run' | 'workspace-save' | 'workspace-edit' }>): Promise<boolean>`

M5 Task 8이 남긴 빈 목록·"창 배치 저장은 준비 중이에요"를 실제 메뉴로 교체한다(§14-1 "4. 워크스페이스: 저장된 배치 목록과 '지금 배치 저장'을 펼친다").
- 내용: updatedAt 내림차순 8개, 나머지 수는 `more`, `canSave`는 `nativeStatus().ok`, `otherConfig`는 지금 지문의 배치가 없을 때.
- 행 초안(Step 1에서 다듬음): 워크스페이스마다 제목 = 이름, 설명 = '창 N개'(다른 구성이면 '창 N개 · 다른 모니터 구성'과 `tone: 'warn'`), 동작 `workspace-run`; 다음 "지금 배치 저장"(`canSave`가 false면 `disabled`와 설명 '보안 프로그램이 Win32 기능을 막았어요'); 마지막 "편집·모두 보기"(설명은 `more > 0`이면 '외 N개 더 있어요', 아니면 '팔레트에서 이름과 단축키를 바꿔요'), 동작 `workspace-edit`. 목록이 비었으면 머리 아래 "저장한 창 배치가 없어요"(M5 문구)와 저장·편집 두 행.
- 열기(바 런타임): M5의 `toggleMenu('workspace-menu', 'workspace')` 구현은 `await o.workspaceMenu()`로 내용을 만든 뒤 `flyout.toggleMenu(content, 'workspace')`를 호출한다(파일 캐시를 읽으므로 비동기).
- 동작(바 런타임의 `flyout:action` 처리): `workspace-run` → `flyout.close('action')` → `service.run(id, 'bar')`; `workspace-save` → 닫기 → `service.saveNew({ source: 'bar' })`(알림에 이름과 "이름은 팔레트에서 @로 바꿀 수 있어요" 안내); `workspace-edit` → 닫기 → `showPalette({ mode: 'search', query: '@' })`. 바를 눌러도 포커스는 원래 창에 있으므로 저장·복원 대상에 Sure-Mate 창은 없다(pid 제외).
- `parseFlyoutAction`: `workspace-run`의 id는 1~200자 문자열, 나머지 둘은 추가 칸 없음.

- [ ] **Step 1: 디자인 방향** — `design:ux-copy`(없으면 `impeccable` clarify)로 행 문구를 다듬고, `impeccable` shape로 M5 펼침 창 메뉴와 같은 가족(`--surface-flyout`, 모서리 8, 행 높이·여백 4의 배수)인지 확인한다. 다른 구성 행은 색만으로 알리지 않고 글자를 함께 표시한다(§14-4). 문구를 바꾸면 Step 2 기대값에 반영한다.
- [ ] **Step 2: 실패하는 테스트** — `workspaceMenuContent`: 10개 → 8개·more 2·updatedAt 내림차순·otherConfig는 지문 기준; `workspaceMenuRows`: 2개 → 4행이고 첫 행 동작 `{ type: 'workspace-run', id }`, 다른 구성 행은 warn과 설명에 '다른 모니터 구성', `canSave` false → 저장 행 disabled, more 3 → 편집 행 설명 '외 3개 더 있어요', 빈 목록 → 2행; `parseFlyoutAction`: `{ type: 'workspace-run', id: 'ws-1' }` 통과, id `''`·201자 → null, `workspace-save`·`workspace-edit` 통과.
- [ ] **Step 3: 실패 확인** — `npx vitest run src/renderer/src/flyout src/shared/flyout src/main/workspace` → FAIL
- [ ] **Step 4: 구현** — 미리 보기 장면 `flyout-workspaces`(M5 장면을 실제 데이터로), `flyout-workspaces-empty`, `flyout-workspaces-blocked`, `flyout-workspaces-more`(바와 함께 `<Desktop>`에, 위치는 M5 `flyoutCardRect`).
- [ ] **Step 5: 통과·화면 확인** — PASS, `npm run typecheck`; `bash scripts/preview/shoot.sh <스크래치 폴더>/m7-flyout flyout-workspaces flyout-workspaces-empty flyout-workspaces-blocked flyout-workspaces-more`; 1·1.25·1.5배에서 바 안쪽 8 DIP, 행 글자가 잘리지 않음, 비활성 행이 글자로 구분됨을 확인.
- [ ] **Step 6: 점검** — `design:design-critique`, `design:accessibility-review` → 수정 후 다시 캡처.
- [ ] **Step 7: 커밋** — `feat: 바 펼침 창에서 워크스페이스 불러오기·저장`

### Task 8: 워크스페이스 편집 화면

**Files:**
- Create: `desktop/src/renderer/src/palette/WorkspaceEditor.tsx`, `MonitorPreview.tsx`, `HotkeyField.tsx`, `monitor-preview.ts`, `workspace-editor-state.ts`, `list-keys.ts`
- Modify: `desktop/src/renderer/src/palette/Palette.tsx`, `desktop/src/shared/ipc-channels.ts`(`ShownPayload`), `desktop/src/shared/palette-query.ts`(`shownView`), `desktop/src/main/index.ts`(`cmd.workspace-save` 흐름), `desktop/src/main/workspace/workspace-items.ts`(부제 문구), `desktop/src/shared/workspace/edit.ts`(오류 문구), `desktop/src/renderer/src/preview/fake-api.ts`·`scenes.tsx`
- Test: `desktop/src/renderer/src/palette/monitor-preview.test.ts`, `workspace-editor-state.test.ts`, `list-keys.test.ts`, `desktop/src/shared/palette-query.test.ts`

**Interfaces:**
- Consumes: Task 5 API·`WorkspaceView`·`WorkspaceEdit`, Task 6 `setWorkspaceHotkey`·`hotkeyRecording`·`acceleratorFromKey`, Task 2 `fromRatio`·`appLabel`, M5 T10 `shownView`, M4 `KeyInfo`(`confirm-state.ts`)·`wikiViewReducer` 방식
- Produces:
  ```ts
  previewLayout(layout: SavedLayout, box: { width: number; height: number }, pad?: number): { monitors: { key: string; label: string; rect: Rect }[]; windows: { ruleId: string; rect: Rect; maximized: boolean }[] }
  monitorLabel(m: SavedMonitor, all: SavedMonitor[]): string
  interface WorkspaceDraft { name: string; aliases: string; rules: { id: string; enabled: boolean; titleIncludes: string; monitor: string }[] }
  draftFromWorkspace(ws: Workspace): WorkspaceDraft
  draftToEdit(d: WorkspaceDraft): WorkspaceEdit
  isDraftDirty(d: WorkspaceDraft, ws: Workspace): boolean
  nextMonitor(current: string, monitors: SavedMonitor[]): string
  interface WorkspaceEditorView { view: WorkspaceView; draft: WorkspaceDraft }
  workspaceEditorReducer(s: WorkspaceEditorView | null, a: { type: 'shown' } | { type: 'open'; view: WorkspaceView } | { type: 'draft'; draft: WorkspaceDraft } | { type: 'saved'; workspace: Workspace } | { type: 'close' }): WorkspaceEditorView | null
  editorKeyToAction(k: KeyInfo): { type: 'save' } | { type: 'close' } | null
  hotkeyKeyAction(k: KeyInfo & { metaKey: boolean }): { type: 'cancel' } | { type: 'clear' } | { type: 'set'; hotkey: string } | null
  listKeyAction(k: KeyInfo & { caretAtEnd: boolean }, item: Pick<PaletteItem, 'id' | 'group'> | null): 'secondary' | null
  ```
  `ShownPayload`에 `{ mode: 'workspace'; id: string }`, `shownView(p)`의 결과에 `workspaceId: string | null`. `FakeFixtures`에 `workspaceView: WorkspaceView | null`, `shown: ShownPayload`(가짜 `onShown`이 등록 직후 한 번 전달).

화면(§11 "설정 화면: 워크스페이스 목록, '지금 배치 저장', 이름·별칭·단축키 편집, 저장된 창 목록(포함 여부, 실행 파일, 제목 규칙, 대상 모니터), 모니터 그림 위 사각형 미리 보기"):
- 목록은 팔레트 `@` 범위다(저장 명령과 저장 줄은 Task 5). 워크스페이스 행에서 Ctrl+Enter, 또는 입력칸 커서가 끝에 있을 때 →(§6 "→ 또는 Ctrl+Enter로 상세·보조 동작")를 누르면 `getWorkspace(id)`로 편집 화면을 연다. 부제는 '창 N개 · Ctrl+Enter 편집'(+ 단축키, 다른 구성).
- 편집 화면 구성: 이름·별칭(쉼표로 구분)·단축키 칸, 모니터 미리 보기(선택한 창 규칙 강조), 창 규칙 목록(포함 체크 상자 · `appLabel` · "제목에 포함" 입력칸 · 대상 모니터 단추(누르면 `nextMonitor`) · 최대화 표시), 아래 단추 [지금 배치로 다시 저장] [불러오기] [삭제]와 안내 "Ctrl+Enter 저장 · Esc 닫기". 지금 구성과 다르면 위에 경고 줄 "다른 모니터 구성에서 저장한 배치예요. 불러올 때 주 모니터로 모을지 확인해요."(`--warn`, 글자 포함).
- 키보드(§16): 모든 칸은 기본 포커스 순서(Tab)로 이동하고 체크 상자는 Space로 바꾼다. Ctrl+Enter 저장(오류는 화면 안에), Esc는 적던 글을 버리고 목록으로(검색어 유지). 한글 조합 중에는 둘 다 하지 않는다. 삭제는 한 번 누르면 단추가 "한 번 더 누르면 삭제"로 바뀌고 두 번째에 삭제한다. 불러오기는 `runItem('workspace:<id>')`와 같다.
- 적던 글은 팔레트가 숨었다 다시 보여도 남는다(M4 위키 편집과 같은 규칙: `shown`은 열린 편집 화면을 유지하고, Esc·저장으로만 사라짐).
- 단축키 칸: 포커스를 받으면 `hotkeyRecording(true)`와 안내 "키 조합을 누르세요 · Esc 취소 · Backspace 지우기". `hotkeyKeyAction`이 set이면 `setWorkspaceHotkey(id, 조합)` → 결과를 칸 아래에 즉시 표시(ok "등록했어요"와 warning, in-use "다른 앱이 사용 중이에요", duplicate "Sure-Mate의 다른 단축키와 같아요", blocked은 detail) → 녹화 종료. clear → null 저장. blur → `hotkeyRecording(false)`. 같은 컴포넌트를 11/15 설정 화면의 단축키 탭이 사용한다.
- `cmd.workspace-save`(팔레트) 흐름 변경: `saveNew({ source: 'palette', quiet: true })` → 성공하면 `showPalette({ mode: 'workspace', id })`로 편집 화면을 열고 이름 칸을 전체 선택한다(사용자가 바로 이름을 입력). 실패하면 그 안내를 알리고 팔레트를 둔다.
- `previewLayout`: 저장한 모니터 bounds의 합집합을 `box − 2×pad` 안에 비율을 유지해 가운데 놓고, 창은 `fromRatio(rect, 그 모니터 작업 영역)`(최대화는 작업 영역)를 같은 비율로 변환한다. `monitorLabel`: 주 모니터 '주 모니터', 내장 '내장 화면', 나머지는 x 순서로 '모니터 2'부터.
- 별칭 칸은 `,`·`，`·`、`로 구분한다.

- [ ] **Step 1: 디자인 방향** — 사용할 수 있는 스킬 목록을 확인하고(없으면 사용자에게 알림) `impeccable` shape(필요하면 `frontend-design`)를 호출한다. 입력: §11 편집 항목, §14-4, 팔레트 720×460 DIP, 위 구성과 키보드 규칙. 정할 것: 두 칸 배치(미리 보기와 목록의 너비), 규칙 행 높이와 넘칠 때 스크롤, 미리 보기 색(모니터 `--line`·`--surface-inset`, 창 `--text-3`, 선택 창 `--brand`), 최대화 표시, 경고 줄 모양. 이어서 `design:ux-copy`로 화면 문구·`applyWorkspaceEdit` 오류 문구·워크스페이스 행 부제를 다듬는다. 움직임은 추가하지 않는다(설정형 화면, `emil-design-eng`의 잦은 동작 규칙). 정한 값은 Task 13 decisions.md 기록용으로 작업 보고에 남긴다.
- [ ] **Step 2: 실패하는 테스트** —
  - `previewLayout`(Task 2의 P·L 배치, 280×160, pad 8): P rect `{140, 38.75, 132, 74.25}`, L rect `{8, 38.75, 132, 82.5}`, 라벨 '주 모니터'·'내장 화면'; Code 창 `{8, 38.75, 66, 39.6}`; 최대화 메모장 `{140, 38.75, 132, 71.5}`·maximized true(소수는 `toBeCloseTo`);
  - `monitorLabel`: 주 모니터 오른쪽의 외부 모니터 두 대 → '모니터 2'·'모니터 3'(x 순서);
  - `draftFromWorkspace` → `draftToEdit` 되돌리기 같음, 별칭 `'qa, 시험，테스트、 '` → `['qa', '시험', '테스트']`, `isDraftDirty` 처음 false·체크 바꾸면 true, `nextMonitor`가 저장 순서대로 돌고 끝에서 처음으로;
  - `workspaceEditorReducer`: open → 편집 상태, shown → 유지, close → null, saved → 새 workspace와 그 초안;
  - `editorKeyToAction`: Ctrl+Enter → save, 자동 반복 → null, 조합 중 → null, Escape → close;
  - `hotkeyKeyAction`: Escape → cancel, Backspace·Delete → clear, Ctrl+Alt+Digit1 → set `'Ctrl+Alt+1'`, ShiftLeft → null, 조합 중·반복 → null;
  - `listKeyAction`: 워크스페이스 행에서 Ctrl+Enter → 'secondary', 커서 끝 ArrowRight → 'secondary', 커서가 끝이 아니면 null, 프롬프트 행 → null, 조합 중 → null;
  - `shownView({ mode: 'workspace', id: 'ws-1' })` → `{ query: '', wikiId: null, workspaceId: 'ws-1' }`, 기존 모드는 workspaceId null.
- [ ] **Step 3: 실패 확인** — `npx vitest run src/renderer/src/palette src/shared/palette-query.test.ts` → FAIL
- [ ] **Step 4: 구현** — 미리 보기 장면 `ws-editor`(창 4개), `ws-editor-other-config`, `ws-editor-recording`, `ws-editor-hotkey-in-use`, `ws-editor-many`(창 12개, 스크롤), `palette-workspaces`(`@` 목록과 저장 줄).
- [ ] **Step 5: 통과·화면 확인** — PASS, `npm test`, `npm run typecheck`, `npx electron-vite build`; `bash scripts/preview/shoot.sh <스크래치 폴더>/m7-editor ws-editor ws-editor-other-config ws-editor-recording ws-editor-hotkey-in-use ws-editor-many palette-workspaces`; 1·1.25·1.5배에서 칸·단추 글자가 잘리지 않음, 미리 보기 선이 흐리지 않음, 경고 줄이 색과 글자로 구분됨, 12개 목록이 스크롤됨을 확인.
- [ ] **Step 6: 점검** — `design:design-critique`, `design:accessibility-review`(키보드 순서, 체크 상자 이름, `--text-3` 대비) → 수정 후 다시 캡처.
- [ ] **Step 7: 커밋** — `feat: 워크스페이스 편집 화면(창 목록·모니터 미리 보기·단축키)`

### Task 9: 말하듯 입력 단어 목록과 문장 이해

**Files:**
- Create: `desktop/resources/intents.json`, `desktop/src/shared/natural/intent-pack.ts`, `desktop/src/shared/natural/understand.ts`
- Modify: `desktop/src/shared/text/hangul.ts`(`fromQwerty`)
- Test: `desktop/src/shared/natural/intent-pack.test.ts`, `understand.test.ts`, `desktop/src/shared/text/hangul.test.ts`

**Interfaces:**
- Consumes: `foldForMatch`, `PaletteGroup`, `PALETTE_GROUPS`
- Produces:
  ```ts
  INTENTS_FORMAT = 'sure-mate-intents'
  type IntentTarget = { group: PaletteGroup } | { id: string }
  interface IntentRule { id: string; label: string; words: string[]; targets: IntentTarget[] }
  interface IntentPack { fillers: string[]; endings: string[]; particles: string[]; intents: IntentRule[] }
  INTENT_LIMITS = { list: 300, word: 20, rules: 40, words: 100, targets: 20, label: 20 }
  parseIntentPack(raw: unknown): { pack: IntentPack | null; errors: string[] }
  fromQwerty(s: string): string
  interface Understood { variants: { text: string; penalty: number; typo: boolean }[]; intents: string[]; key: string | null; natural: boolean }
  MAX_PHRASE = 200; MIN_STEM = 2; QWERTY_PENALTY = 50
  understand(text: string, pack: IntentPack): Understood
  ```

`resources/intents.json`(`{ format, version: 1, fillers, endings, particles, intents }`):
- fillers: §13 2단계 그대로(좀, 그, 저기, 혹시).
- endings: §13 3단계 목록 그대로, 이어서 추가분(설계 목록은 "예:"이다): 목록의 "…줘"마다 "…주세요"(보여주세요, 알려주세요, 가르쳐주세요, 설명해주세요, 찾아주세요, 검색해주세요, 정리해주세요, 요약해주세요, 바꿔주세요, 전환해주세요, 켜주세요, 꺼주세요, 열어주세요, 실행해주세요, 띄워주세요, 불러와주세요, 복원해주세요, 저장해주세요, 만들어주세요, 작성해주세요, 써주세요, 복사해주세요, 가려주세요, 되돌려주세요)와 붙여넣어줘, 붙여넣어주세요, 붙여넣어, 붙여줘, 붙여주세요.
- particles: §13 5단계 목록 그대로.
- intents(라벨은 초안, Task 12에서 다듬음; §13 6단계 단어를 분류별로 그대로 옮기고 가명 분류에만 더 좁은 규칙 두 개를 추가):

  | id | label | words | targets |
  |---|---|---|---|
  | prompt | 프롬프트 | 정리, 요약, 초안, 작성, 다듬기, 교정, 테스트 케이스, 소명, 조항, 분석, 프롬프트, AI, 클로드, GPT, 제미나이 | group prompt |
  | wiki | 용어 뜻 | 뜻, 의미, 정의, 용어, 약어, 풀네임, 뭐야, 이란 | group wiki |
  | workspace | 배치 불러오기 | 워크스페이스, 레이아웃, 배치, 화면, 모드, 전환, 바꿔, 켜, 복원, 불러와 | group workspace |
  | workspace-save | 배치 저장 | 저장, 기억, 현재 배치 | id `cmd.workspace-save` |
  | snippet | 상용구 | 양식, 서식, 상용구, 붙여, 템플릿 | group snippet |
  | masking | 가명 처리 | 가명, 마스킹, 익명, 가려, 되돌려, 원래 이름 | id `cmd.unmask`·`cmd.mask-selection`·`cmd.masking-mode`·`cmd.open-dictionary` |
  | unmask | 가명 되돌리기 | 되돌려, 원래 이름 | id `cmd.unmask` |
  | mask-selection | 선택 글 가명 처리 | 가려 | id `cmd.mask-selection` |
  | settings | 설정 | 설정, 단축키, 사이드패널, 위치, 내보내기, 가져오기 | group command |

`parseIntentPack`: 형식·판 확인. 목록마다 문자열만, NFC·앞뒤 공백 제거, 빈 값·20자 초과 제외, 중복 제거, 300개까지. 규칙은 id `^[a-z0-9-]{1,40}$`(중복이면 뒤의 것 제외)·label 1~20자·words 100개까지·targets는 `PALETTE_GROUPS`의 group 또는 1~200자 id이고, 대상이 하나도 없으면 규칙 제외. 형식이 다르거나 규칙·목록이 모두 비면 `pack: null`. 오류 문구에는 순번·규칙 id만 남긴다.

`fromQwerty`: 두벌식 자판 글자를 자모로 바꿔 음절로 조합한다(`toQwerty`의 역). Shift 글자 R·E·Q·T·W·O·P는 ㄲ·ㄸ·ㅃ·ㅆ·ㅉ·ㅒ·ㅖ, 그 밖의 대문자는 소문자와 같다. 겹모음(ㅘ·ㅙ·ㅚ·ㅝ·ㅞ·ㅟ·ㅢ)과 겹받침(ㄳ·ㄵ·ㄶ·ㄺ·ㄻ·ㄼ·ㄽ·ㄾ·ㄿ·ㅀ·ㅄ)을 만들고, 받침 뒤에 모음이 오면 받침(겹받침이면 뒤 자음)을 다음 음절 초성으로 이동한다. ㄸ·ㅃ·ㅉ는 받침이 되지 않는다. 자판에 없는 글자(공백·숫자·기호)는 그대로 두고 조합을 끊는다.

`understand` 순서(§13 1~7단계):
1. 앞 200자만 사용한다. NFC → `foldForMatch` → 연속 공백을 하나로 → 앞뒤 공백 제거.
2. 끝의 `[?!.~]+`를 제거하고(전각 기호는 1에서 반각), 공백으로 구분한 낱말 중 군말과 같은 낱말을 제거한다(낱말 전체가 같을 때만: '그룹'은 유지). 이때 공백을 뺀 글이 학습 키 `key`다(2글자 미만이면 null, 기호 유지).
3. 어미: 최대 두 번, 공백을 뺀 글의 끝과 같은 어미를 긴 것부터 확인해, 제거해도 1글자 이상 남는 첫 어미를 끝에서부터 그 글자 수만큼(공백은 건너뛰며) 제거하고 기록한다("요약해줘"는 '요약해줘' 대신 '해줘'를 제거해 '요약'이 남는다).
4. V0 낱말 = 3의 결과를 공백으로 구분한 것. V1 낱말 = 각 낱말에서, 영문·숫자·기호 뒤에 붙은 한글이 조사 목록에 있으면 그 조사를 제거하고("mc/dc가" → "mc/dc", "qa로" → "qa", 4단계), 한글로 끝나는 낱말은 조사를 긴 것부터 확인해 2음절 이상 남는 첫 조사를 제거한다(5단계; "정확도" → "정확", "평가"·"결과"는 그대로).
5. 의도: 규칙의 단어 하나라도 ① 3에서 제거한 어미 안에 있거나(공백 제거 후 포함) ② V0 또는 V1 낱말과 같으면(여러 낱말 단어는 이어진 낱말과 같으면) 그 규칙을 찾은 것으로 한다. 낱말 속에 포함된 것은 의도가 아니다('정적분석'의 '분석'). `intents`는 pack 순서.
6. V2 낱말 = V1 낱말에서 ②로 맞은 낱말을 뺀 것.
7. 변형: V0(0점 감점, 오타 단계 사용), V1(1점 감점, V0와 다를 때), V2(2점 감점, 비지 않고 V1과 다를 때). 감점은 동점이면 원형이 이기게 하는 값이다(§13 5단계).
8. 영문 자판: 원문(앞뒤 공백 제거)이 영문 글자·공백·`?!.~`로만 되어 있으면 `fromQwerty`로 바꾸고, 완성 음절 수 × 2가 공백을 뺀 글자 수 이상일 때만 바꾼 글로 1~7을 다시 수행하고 그 변형에 50점 감점을 더해 추가한다(첫 변형만 오타 단계). 의도는 합치고 `key`는 바꾼 글의 key다(영문 모드로 친 문장과 한글로 친 문장이 같은 학습 키). 영어 낱말('mail' → 'ㅡ먀ㅣ', 'test' → 'ㅅㄷㄴㅅ')은 음절이 모자라 바꾸지 않는다.
9. `natural` = 2·3에서 무엇이든 제거했거나, 8에서 바꿨거나, 의도를 찾았으면 true(조사만 제거한 낱말은 false).

- [ ] **Step 1: 실패하는 테스트** —
  - `parseIntentPack(기본 파일)`: 오류 없음; fillers·particles가 §13 목록과 정확히 같고, endings·각 규칙 words가 §13 예시를 모두 포함(시험 안에 설계 원문 배열을 그대로 둠); 규칙 id가 서로 다름; 형식 `'x'` → pack null; 21자 단어·숫자·중복 → 제외와 오류; 모르는 group → 그 대상 제외; 대상 없는 규칙 → 제외; (Review Focus 5) 오류 문구에 단어 내용 없음;
  - `fromQwerty`: `'ghldmlfhr wjdflgownj'` → `'회의록 정리해줘'`, `'rkaud ehlehffuwnj'` → `'가명 되돌려줘'`, `'wjdwjrqnstjr'` → `'정적분석'`, `'qhrhtj ahemfh qkRnjwnj'` → `'보고서 모드로 바꿔줘'`, `'dkssud'` → `'안녕'`, `'dlfrj'` → `'일거'`, `'dlfrdj'` → `'읽어'`, `'RkRk'` → `'까까'`, `'qksd'` → `'반ㅇ'`, `'mcdc'` → `'ㅡㅊㅇㅊ'`, `'a1b'` → `'ㅁ1ㅠ'`; `toQwerty(disassemble(fromQwerty(s)))`가 s와 같음(위 한글 예시);
  - `understand`(기본 목록):
    - `'회의록 좀 정리해 주세요'` → 변형 `[{ text: '회의록', penalty: 0, typo: true }]`, intents `['prompt']`, natural true, key `'회의록정리해주세요'`;
    - `'MC/DC가 뭐야?'` → `['mc/dc가' 0, 'mc/dc' 1]`, intents `['wiki']`, key `'mc/dc가뭐야'`;
    - `'보고서 모드로 바꿔줘'` → `['보고서 모드로' 0, '보고서 모드' 1, '보고서' 2]`, intents `['workspace']`;
    - `'회의모드로바꿔줘'` → `['회의모드로' 0, '회의모드' 1]`, intents `['workspace']`;
    - `'가명 되돌려줘'` → `['가명' 0]`, intents `['masking', 'unmask']`; `'요약해줘'` → `['요약' 0]`, intents `['prompt']`;
    - `'qa로 전환'` → `['qa로 전환' 0, 'qa 전환' 1, 'qa' 2]`, intents `['workspace']`; `'이슈 양식'` → `['이슈 양식' 0, '이슈' 2]`, intents `['snippet']`; `'현재 배치 기억해줘'` → `['현재 배치 기억' 0]`, intents `['workspace', 'workspace-save']`; `'ISO26262는'` → `['iso26262는' 0, 'iso26262' 1]`;
    - (Review Focus 4) `'정확도'` → `['정확도' 0, '정확' 1]`·natural false; `'평가'`·`'결과'` → 변형 하나·natural false; `'정적분석'` → intents `[]`; `'뭐야'` → `['뭐야' 0]`·intents `['wiki']`(어미를 제거하면 비므로 유지); `'그룹 정리'` → '그룹' 유지;
    - `'ghldmlfhr wjdflgownj'` → `[{ 'ghldmlfhr wjdflgownj', 0, true }, { '회의록', 50, true }]`, intents `['prompt']`, key `'회의록정리해줘'`; `'mail'`·`'test'` → 변형 하나(바꾸지 않음);
    - `''`·`'  '` → 변형 없음·key null; `'회'` → `['회' 0]`·key null; 300자 입력 → 앞 200자만 처리.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/shared/natural src/shared/text/hangul.test.ts` → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — PASS, `npm run typecheck`
- [ ] **Step 5: 커밋** — `feat: 말하듯 입력 단어 목록과 문장 이해`

### Task 10: 의도·학습 점수와 동점 순서(문장 표)

**Files:**
- Create: `desktop/src/shared/natural/natural-rank.ts`, `desktop/src/shared/natural/usage.ts`, `desktop/src/main/prompts/natural-search.test.ts`
- Modify: `desktop/src/shared/search/ranker.ts`, `desktop/src/renderer/src/palette/filter-items.ts`
- Test: `desktop/src/shared/search/ranker.test.ts`, `desktop/src/shared/natural/natural-rank.test.ts`, `usage.test.ts`, `desktop/src/renderer/src/palette/filter-items.test.ts`, `natural-search.test.ts`, 기존 `palette-search.test.ts`(바꾸지 않음)

**Interfaces:**
- Consumes: Task 9, Task 5 `workspacePaletteItems`·`WORKSPACE_SAVE_ID`, M4 `buildSearchIndex`·`rank`·`parseQuery`·`MAX_ROWS`, M5·M6 `buildPaletteItems`(barShape·petVisible)
- Produces:
  ```ts
  // ranker.ts
  interface RankQuery { text: string; penalty: number; typo: boolean }
  interface RankHit { id: string; score: number; title: boolean }
  interface RankOptions { boost?(id: string): number; nominate?: ReadonlySet<string>; prefer?(id: string): number }
  rankAll(index: SearchIndex, queries: RankQuery[], o?: RankOptions): RankHit[]
  rank(index: SearchIndex, query: string, o?: Pick<RankOptions, 'prefer'>): RankHit[]
  // usage.ts
  interface UsageRecord { count: number; lastAt: string }
  USAGE_HALF_LIFE_DAYS = 14
  usageScore(u: UsageRecord | undefined, now: number): number
  recentIds(usage: ReadonlyMap<string, UsageRecord>, n: number): string[]
  // natural-rank.ts
  INTENT_BONUS = 120; LEARN_BONUS = 2000; LEARNED_LABEL = '기억한 문장'
  DEFAULT_INTENT_LABELS: Record<PaletteGroup, string>   // prompt '프롬프트', command '명령', workspace '배치', snippet '상용구', wiki '용어 뜻'
  interface NaturalHit extends RankHit { label: string | null; learned: boolean }
  naturalRank(index: SearchIndex, u: Understood, o: { pack: IntentPack; groupOf(id: string): PaletteGroup | undefined; learned: ReadonlyMap<string, string>; prefer?(id: string): number }): NaturalHit[]
  // filter-items.ts
  interface SearchContext { pack: IntentPack | null; learned: ReadonlyMap<string, string>; usage: ReadonlyMap<string, UsageRecord>; now: number }
  EMPTY_SEARCH_CONTEXT: SearchContext
  interface PaletteSearch { items: PaletteItem[]; top: { id: string; label: string } | null; natural: boolean; key: string | null; recent: string[] }
  RECENT_MAX = 5
  searchPalette(items: PaletteItem[], query: string, index: SearchIndex, ctx: SearchContext): PaletteSearch
  filterItems(items: PaletteItem[], query: string, index?: SearchIndex, ctx?: SearchContext): PaletteItem[]   // = searchPalette(…).items, ctx 기본 EMPTY
  ```

규칙:
- `rankAll`: 검색어마다 지금 `rank`와 같은 단계로 점수를 계산하되 오타 단계는 `typo`인 검색어만, 점수에서 penalty를 빼고 문서마다 최고점을 사용한다(같으면 penalty가 작은 쪽의 title). 0점 초과이거나 `nominate`에 있는 문서(없는 id는 무시, 맞지 않았으면 0점에서 시작)에 `boost`를 더하고 0 이하는 제외한다. 정렬: 점수 내림차순 → 제목 일치 → `prefer` 내림차순 → 짧은 제목 → 추가 순서(§9 동점 순서). `rank(index, q, o)` = `rankAll(index, [{ text: q, penalty: 0, typo: true }], o)`이고 M4 결과는 그대로다.
- `naturalRank`(§13 7단계 "§9 검색 점수 + 의도 가산점 + 학습 가산점"): 찾은 규칙마다 그 규칙이 id나 `groupOf(id)`로 가리키는 문서에 120점을 더한다(규칙끼리 합산, 한 규칙은 한 번). id로 가리킨 문서는 검색어에 맞지 않아도 후보가 된다("현재 배치 기억해줘" → 지금 배치 저장, "원래 이름으로 돌려줘" → 가명 되돌리기). `learned.get(u.key)`인 문서는 2,000점을 더하고 후보로 지목한다(늘 맨 위). label: 학습이면 '기억한 문장', 아니면 그 문서를 가리키는 찾은 규칙 중 대상 수가 가장 적은 규칙(같으면 pack 순서)의 label, 없으면 null.
- `usageScore` = `count × 0.5^(경과 일 / 14)`, 없으면 0. `recentIds`는 lastAt 내림차순.
- `searchPalette`:
  - 글이 비었으면 `recent` = `recentIds(usage, 5)` 중 지금 항목에 있고 접두어 범위에 맞는 것(빈 검색어에서도 최근 위키 항목은 포함, 5개라 목록을 덮지 않음), items = 최근 항목 다음에 M4 목록(중복 제외), 50줄까지.
  - 접두어가 있거나 `ctx.pack`이 null이면 M4와 같은 한 검색어 검색에 `prefer`만 추가한다.
  - 접두어가 없으면 `understand(text, pack)` → `naturalRank`. 위키는 원문이 한 글자면 제외한다(M4 규칙을 변형 검색어가 아닌 원문으로 판단).
  - `prefer = (id) => usageScore(usage.get(id), now)`. top label = `naturalRank`의 label, 없으면(접두어 검색 포함) pack에서 그 id를 id로 가리키는 규칙의 label(지금 배치 저장 → '배치 저장'), 그것도 없으면 `DEFAULT_INTENT_LABELS[group]`. natural·key는 `understand` 결과(접두어 검색은 false·null).
- M4가 F6으로 미룬 '++'·'#'(`compactOf('MISRA C') === compactOf('MISRA C++')`)은 학습 키를 공백만 뺀 글(기호 유지)로 만들어 학습 충돌을 피하고, 랭커 compact는 바꾸지 않는다(검색 결과는 M4와 같음).

`natural-search.test.ts` 자료: 실제 `prompts.json`·`glossary.json`, 시험용 사용자 용어 `정확`(u-exact)·`정확도`(u-accuracy)·`평균`(u-mean)(설명 '시험용 가상 용어'), `workspacePaletteItems`로 만든 워크스페이스 'QA 모드'(별칭 qa·시험·테스트, ws-qa)·'보고서 모드'(보고, ws-report)·'회의 모드'(미팅 화면, ws-meeting)(시험 지문의 배치), `buildPaletteItems(…, { maskingMode: 'restore', barShape: 'edge', petVisible: true, workspaces })`, ctx `{ pack: 기본 목록, learned: 빈 Map, usage: 빈 Map, now: 고정 }`. 아래 기대값은 이 계획을 쓸 때 실제 랭커와 기본 팩으로 같은 규칙을 계산해 확인한 값이다.

- [ ] **Step 1: 실패하는 테스트** —
  - ranker: 결과에 title 칸; `rankAll` 문서 '정확도'(a)·'정확'(b)와 검색어 `[{'정확도',0,true},{'정확',1,false}]` → a 1000·b 999 순서; `typo: false`는 오타 결과 없음; `nominate {'c'}`+boost 120 → c 120, boost 없으면 제외, 모르는 id 무시; 같은 점수에서 `prefer`가 큰 쪽이 앞, 단 제목 일치가 `prefer`보다 먼저; 기존 ranker 시험 전부 통과;
  - `usageScore({count:4, lastAt: now})` 4, 14일 전 2, 28일 전 1, undefined 0; `recentIds`는 최근 순 n개;
  - `naturalRank`: 규칙 두 개가 같은 문서를 가리키면 240점; label이 가장 좁은 규칙('가명 되돌려줘' → '가명 되돌리기'); 학습 문서는 맞지 않아도 2,000점·label '기억한 문장'; 학습 id가 색인에 없으면 무시;
  - 문장 표(§13 완료 기준 "문장 40개 이상 … 모두 맨 위 후보가 맞는다", `searchPalette(…).items[0].id`, 51개):

    | 문장 | 맨 위 |
    |---|---|
    | 회의록 정리해줘 · 회의록 좀 정리해 주세요 · 회의록 정리해줘!! · 회의록을 · 클로드로 회의록 정리 | prompt:meeting-notes |
    | 주간보고 초안 작성해줘 | prompt:weekly-report |
    | 메일 회신 초안 써줘 | prompt:mail-reply |
    | 문장 다듬기 해줘 | prompt:polish |
    | 요구사항으로 테스트 케이스 만들어줘 | prompt:req-to-testcase |
    | 정적분석 소명 초안 | prompt:static-analysis |
    | ISO 26262 조항 찾아줘 | prompt:standard-clause |
    | 협업 문서 요약해줘 · 요약해줘 | prompt:collab-summary |
    | mcdc 뭐야 · MC/DC가 뭐야? | wiki:mcdc |
    | ISO26262는 | wiki:iso-26262 |
    | ASIL이란 | wiki:asil |
    | 오탐 뜻 알려줘 | wiki:false-positive |
    | 정적분석이 뭐야 · ㅈㅈㅂㅅ · 정적분삭 · wjdwjrqnstjr | wiki:static-analysis |
    | HARA 풀네임 | wiki:hara |
    | 커버리지가 뭐지 · 혹시 커버리지 뜻 좀 알려주세요 | wiki:code-coverage |
    | 보고서 모드로 바꿔줘 · qhrhtj ahemfh qkRnjwnj | workspace:ws-report |
    | 회의모드로바꿔줘 · 회의 화면 불러와줘 | workspace:ws-meeting |
    | QA 모드 켜줘 · qa로 전환 · 시험 배치로 복원 | workspace:ws-qa |
    | 지금 배치 저장해줘 · 현재 배치 기억해줘 · 배치 저장 | cmd.workspace-save |
    | 이슈 양식 · 결함 리포트 붙여줘 | snippet:defect-report |
    | 메일 서명 · 서명 붙여넣어줘 | snippet:mail-signature |
    | 가명 되돌려줘 · 원래 이름으로 돌려줘 · rkaud ehlehffuwnj | cmd.unmask |
    | 선택한 글 가려줘 | cmd.mask-selection |
    | 가명 처리 꺼줘 | cmd.masking-mode |
    | 마스킹 사전 열어줘 | cmd.open-dictionary |
    | 용어 팩 내보내기 | cmd.glossary-export |
    | 바 모양 바꿔줘 | cmd.bar-shape |
    | 정확도 | wiki:u-accuracy |
    | 평가 | wiki:hara |
    | 결과 | wiki:str |
    | ghldmlfhr wjdflgownj | prompt:meeting-notes |

    정확도·평가·결과 줄은 원형 유지 규칙을 지킨다: 원형을 버리거나 감점이 없으면 '정확'(u-exact)이, 1음절 어간을 허용하면 '평균'(u-mean)·'결함 리포트'가 맨 위로 온다.
  - (Review Focus 4) 변화 없음: `['mcdc', 'misra', 'meeting', 'mail', 'qa', 'test', 'ㅈㅈㅂㅅ', '정적분삭', '정ㅈ', '정적분서', '커버리지', '정적분석', '회의']`마다 `searchPalette(기본 ctx)`의 맨 위가 `filterItems(EMPTY ctx)`의 맨 위와 같음; `'ㅈ'`·`'ㅅ'`·`'s'`·`'ㅎ'`·`'회'`는 위키 행 없음;
  - 의도 표시: '보고서 모드로 바꿔줘' → top.label '배치 불러오기', '가명 되돌려줘' → '가명 되돌리기', '정확도' → '용어 뜻', '@QA' → '배치';
  - 학습·사용: learned `{ '출근세팅해줘' → 'workspace:ws-qa' }` → '출근 세팅해줘'의 맨 위 ws-qa·label '기억한 문장'; usage `{ 'cmd.open-dictionary': { count: 5, lastAt: now } }` → '가명'의 맨 위 `cmd.open-dictionary`(네 명령이 950점 동점); 빈 검색어 + usage 6개 → recent 5개이고 items 앞 5개가 최근 순, 없는 id는 건너뜀;
  - 성능(§16): 기본 자료 + 시험 용어 2,000개, 표의 51개 문장을 5번 반복 측정한 문장당 평균의 중앙값이 50ms 미만.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/shared/search src/shared/natural src/renderer/src/palette src/main/prompts` → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — PASS(기존 palette-search 그대로), `npm run typecheck`
- [ ] **Step 5: 커밋** — `feat: 말하듯 입력 점수(의도·학습)와 최근·자주 쓴 항목 동점 순서`

### Task 11: 단어 목록·학습·사용 기록 저장과 IPC

**Files:**
- Create: `desktop/src/main/natural/intent-store.ts`, `desktop/src/main/natural/phrase-store.ts`, `desktop/src/main/natural/usage-store.ts`, `desktop/src/main/natural/natural-commands.ts`, `desktop/src/shared/natural/natural-ipc.ts`
- Modify: `desktop/src/main/index.ts`, `desktop/src/main/ipc.ts`, `desktop/src/shared/ipc-channels.ts`, `desktop/src/preload/index.ts`, `desktop/src/main/prompts/palette-items.ts`, `desktop/src/renderer/src/preview/fake-api.ts`
- Test: `desktop/src/main/natural/intent-store.test.ts`, `phrase-store.test.ts`, `usage-store.test.ts`, `natural-commands.test.ts`, `desktop/src/shared/natural/natural-ipc.test.ts`

**Interfaces:**
- Consumes: Task 1 `writeJsonAtomic`·`readJsonFile`·`keepBrokenCopy`, Task 9 `parseIntentPack`·`understand`, Task 10 `UsageRecord`, 가명 사전 열기 명령의 흐름
- Produces:
  ```ts
  INTENTS_FILE = 'intents.json'
  createIntentCache(userDir: string, builtin: unknown, onErrors: (errors: string[]) => void): { get(): Promise<IntentPack>; invalidate(): void }
  ensureUserIntents(userDir: string, builtin: unknown): Promise<string>
  PHRASES_FILE = 'phrase-map.json'; PHRASES_FORMAT = 'sure-mate-phrases'; PHRASE_MAX = 300
  createPhraseStore(userDir: string, o?: { io?: SaveIo; now?: () => Date }): { all(): Promise<Map<string, string>>; learn(key: string, id: string): Promise<void> }
  USAGE_FILE = 'usage.json'; USAGE_FORMAT = 'sure-mate-usage'; USAGE_MAX = 200
  createUsageStore(userDir: string, o?: { io?: SaveIo; now?: () => Date }): { all(): Promise<Map<string, UsageRecord>>; record(id: string): Promise<void> }
  naturalCommandItems(): PaletteItem[]
  createNaturalCommands(d: { ensure(): Promise<string>; openFile(path: string): Promise<string>; showInFolder(path: string): void; waitKeysReleased(): Promise<boolean>; hidePalette(restoreFocus: boolean): void; notify(message: string): void; log(event: string, data: Record<string, unknown>): void }): { run(id: string): Promise<boolean> }
  interface SearchContextPayload { pack: IntentPack | null; learned: [string, string][]; usage: [string, UsageRecord][]; now: number }
  parsePick(v: unknown): { id: string; remember: boolean; query: string } | null
  ```
  IPC `paletteSearchContext: 'palette:search-context'`(invoke), `palettePick: 'palette:pick'`(send). `SureMateApi`에 `getSearchContext(): Promise<SearchContextPayload>`, `recordPick(p: { id: string; remember: boolean; query?: string }): void`.

규칙:
- 단어 목록(§13 "기본본은 resources/, 사용자가 고칠 수 있음", §5 덮어쓰기본): 사용자 `intents.json`이 있고 `parseIntentPack`의 pack이 있으면 그것만 사용하고(일부 값을 뺀 오류는 알림), 없거나 pack이 null이면 기본 목록과 알림(index.ts `reportFileErrors('말하듯 입력 단어 목록', 'intents.loadErrors', errors)`). 수정 시각·크기가 바뀔 때만 다시 읽는다. `ensureUserIntents`는 파일이 없을 때만 기본 목록을 2칸 들여쓰기로 기록하고(`wx`) 경로를 돌려준다.
- 학습 연결(§13 8단계 "학습 내용은 로컬에만"): `{ format, version: 1, entries: [{ key, id, at }] }`. 같은 key는 새 id로 바꾸고, 300개를 넘으면 at이 가장 오래된 것부터 제외한다. 깨진 파일은 `keepBrokenCopy` 뒤 빈 목록으로 시작한다. 쓰기는 한 번에 하나이고 마지막 상태가 저장된다.
- 사용 기록: `{ format, version: 1, items: [{ id, count, lastAt }] }`. `record`는 count + 1·lastAt now, 200개를 넘으면 lastAt이 가장 오래된 것부터 제외, 쓰기 직렬화·깨진 파일 처리는 학습과 같다. 내용은 항목 id뿐이다.
- 명령 `cmd.open-intents`(제목 "말하듯 입력 단어 목록 열기", 부제 "‘해줘’ 같은 어미와 의도 단어를 고치는 파일(이 PC에만 저장)", 키워드 intents·natural·단어·말하듯·어미·조사): 키 떼기 확인 뒤 팔레트 숨김(원래 창으로 포커스 없이) → `ensure` → `openFile` 실패면 `showInFolder`와 알림 "단어 목록 파일(.json)을 열 프로그램이 없어 폴더를 열었어요. 메모장으로 열어 고쳐 주세요."(가명 사전 열기와 같은 처리) → 로그 `natural.openIntents { opened }`. `buildPaletteItems`의 명령 구역에 가명 사전 열기 다음으로 포함한다.
- `palette:search-context`: 단어 목록 캐시·학습·사용 기록·`Date.now()`.
- `palette:pick`: `parsePick`(id 1~200자, remember boolean, query는 문자열이면 200자까지 자르고 없으면 `''`) → `usage.record(id)` → remember이면 `understand(query, pack).key`가 있을 때 `phrases.learn(key, id)`와 알림 "이 문장을 기억했어요. 다음에 같은 문장을 입력하면 맨 위에 보여요."(Task 12에서 다듬음), 로그 `phrase.learn { keyLength }`. 잘못된 값은 무시한다. 입력 문장은 로그·사용 기록에 남지 않는다.
- `fake-api.ts`의 `getSearchContext`는 기본 `resources/intents.json`을 `parseIntentPack`한 pack과 `FakeFixtures.searchContext`(learned·usage)를 돌려준다.

- [ ] **Step 1: 실패하는 테스트** —
  - intent cache: 사용자 파일 없음 → 기본 목록; 정상 사용자 파일 → 그 목록(기본 목록과 합치지 않음); (Review Focus 5) BOM 붙은 파일 → 읽힘; `'{'` → 기본 목록·onErrors 1회; 형식이 다름 → 기본 목록; 수정 시각이 같으면 다시 읽지 않음; `ensureUserIntents`가 두 번째 호출에서 사용자 내용을 덮어쓰지 않음;
  - phrase store: learn → all에 있음; 같은 key 새 id → 바뀜; 301개 → 가장 오래된 것 제외; (Review Focus 5) 깨진 파일 → 빈 Map과 `.broken-*` 사본, 다음 learn이 정상 파일로 저장; 동시에 learn 두 번 → 둘 다 저장;
  - usage store: record 두 번 → count 2·lastAt 마지막; 201개 → 가장 오래된 것 제외; 깨진 파일 처리 같음; 파일에 id 말고 다른 글 없음;
  - natural commands: `run('cmd.open-intents')` → 키 떼기 확인 → `hidePalette(false)` → `ensure` → `openFile`; 열기 실패 → `showInFolder`·알림; 다른 id → false;
  - `parsePick`: 정상 통과, remember true인데 query 없음 → query `''`(학습 안 함), id 201자·remember 'yes' → null;
  - main pick 처리(가짜 저장소): remember false → record만; true와 '보고서 띄워줘' → learn(key '보고서띄워줘', id); key가 null인 '회' → learn 없음; 로그 인자에 문장 없음.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/main/natural src/shared/natural` → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — PASS, `npm test`, `npm run typecheck`, `npx electron-vite build`
- [ ] **Step 5: 커밋** — `feat: 말하듯 입력 단어 목록·학습·사용 기록 저장`

### Task 12: 팔레트의 말하듯 입력 화면

**Files:**
- Create: `desktop/src/renderer/src/palette/palette-hints.ts`
- Modify: `desktop/src/renderer/src/palette/Palette.tsx`, `desktop/src/renderer/src/palette/filter-items.ts`(`groupItems`), `desktop/src/renderer/src/palette/list-keys.ts`, `desktop/resources/intents.json`(label), `desktop/src/main/index.ts`(학습 알림 문구), `desktop/src/renderer/src/preview/scenes.tsx`
- Test: `desktop/src/renderer/src/palette/palette-hints.test.ts`, `list-keys.test.ts`, `filter-items.test.ts`, `desktop/src/main/prompts/natural-search.test.ts`(label 기대값)

**Interfaces:**
- Consumes: Task 10 `searchPalette`·`PaletteSearch`·`SearchContext`, Task 11 `getSearchContext`·`recordPick`, Task 8 `listKeyAction`, Task 5 `withWorkspaceSaveAs`, M4 `withWikiAdd`
- Produces:
  ```ts
  type PaletteSection = PaletteGroup | 'recent'
  SECTION_LABELS: Record<PaletteSection, string>         // recent '최근', 나머지는 PALETTE_GROUPS
  groupItems(items: PaletteItem[], recent?: string[]): { section: PaletteSection; items: PaletteItem[] }[]
  rememberHint(s: PaletteSearch, selected: string): boolean
  listKeyAction(k: KeyInfo & { caretAtEnd: boolean }, item: Pick<PaletteItem, 'id' | 'group'> | null, o?: { remember: boolean }): 'secondary' | 'remember' | null
  PALETTE_TIPS: string[]; tipFor(shownCount: number): string
  ```

화면 동작:
- 팔레트를 보일 때 `Promise.all([listItems(), getSearchContext()])`로 항목과 검색 문맥을 함께 받는다(배열 → Map). 목록은 `searchPalette(allItems, deferredQuery, index, ctx)`의 items에 `withWikiAdd`·`withWorkspaceSaveAs`를 적용한다.
- 맨 위 후보(§6 의도 표시): 첫 행 오른쪽에 `search.top.label` 칩. 접두어 검색에도 표시한다.
- 문장 기억하기(§13 8단계): `rememberHint`(natural이고 key가 있으며 선택 행이 맨 위가 아닌 실제 항목)이면 선택 행 오른쪽에 "Shift+Enter 기억하고 실행". Shift+Enter(조합 중·자동 반복 제외)는 기본 동작을 막고 `run(selected, { remember: true })`. 그 밖의 Shift+Enter는 cmdk 기본 Enter와 같다. 자동 실행하지 않는다(§13 7단계).
- `run(id, o)`는 `WIKI_ADD_ID`·`WORKSPACE_SAVE_AS_ID`가 아니면 실행 전에 `recordPick({ id, remember, query: remember ? query : undefined })`를 보낸다(위키 행도 기록).
- 빈 검색어(§6 빈 화면): `recent`가 있으면 맨 위 '최근' 구역, 그 아래 기존 구역. 목록 아래(또는 결과 없음 자리)에 `tipFor(shownCount)` 한 줄.
- 목록이 검색어를 따라오지 못한 동안의 Enter(기존 지연 대비)는 `searchPalette(…, query, …)`의 첫 항목에 `withWikiAdd`·`withWorkspaceSaveAs`를 적용한 목록으로 판단한다(M4가 F6으로 미룬 M11(d): 지금은 직접 추가하기 줄을 빠뜨림).
- 팁 초안: "말하듯 입력해도 돼요: ‘회의록 정리해줘’", "@로 저장한 창 배치를 불러와요", "?로 용어 뜻을 찾아요".

- [ ] **Step 1: 디자인 방향** — `impeccable` shape로 의도 칩(위치, `--brand` 글자 또는 테두리, 12px `--fs-caption`, 모서리 4), 기억하기 안내, '최근' 구역 머리, 팁 줄을 정한다(M4 목록·상태 표시줄과 같은 가족, Raycast식 오른쪽 단축키 표시). `design:ux-copy`로 `intents.json`의 label 9개, 칩·안내·팁, Task 11의 학습 알림을 다듬는다. `emil-design-eng`: 칩·안내는 움직임 없이 나타난다(하루에 수십 번 보는 목록). 문구를 바꾸면 Task 10 시험의 label 기대값도 수정한다.
- [ ] **Step 2: 실패하는 테스트** — `groupItems(items, ['prompt:meeting-notes'])` → 첫 구역 recent에 그 항목이 있고 원래 구역에서 반복되지 않음, recent 없으면 기존과 같음; `rememberHint`: natural·key·선택이 둘째 → true, 선택이 맨 위·natural false·key null·없는 id → false; `listKeyAction`: Shift+Enter와 `remember: true` → 'remember', remember false → null, 조합 중·반복 → null, 워크스페이스 행 Ctrl+Enter → 'secondary'(Task 8 동작 유지); `tipFor(0..5)`가 3개를 차례로; 팁에 `{` 없음.
- [ ] **Step 3: 실패 확인** — `npx vitest run src/renderer/src/palette src/main/prompts` → FAIL
- [ ] **Step 4: 구현** — 미리 보기 장면 `palette-natural-prompt`('회의록 정리해줘'), `palette-natural-workspace`('보고서 모드로 바꿔줘'), `palette-remember`(둘째 행 선택), `palette-empty-recent`, `palette-english-mode`('ghldmlfhr wjdflgownj'). 장면은 `FakeFixtures.shown`의 query와 `searchContext`로 만든다.
- [ ] **Step 5: 통과·화면 확인** — PASS, `npm test`, `npm run typecheck`, `npx electron-vite build`; `bash scripts/preview/shoot.sh <스크래치 폴더>/m7-natural palette-natural-prompt palette-natural-workspace palette-remember palette-empty-recent palette-english-mode`; 1·1.25·1.5배에서 칩이 긴 제목과 겹치지 않음(제목이 먼저 줄어듦), 안내가 부제를 가리지 않음, 팁 줄이 상태 표시줄과 구분됨을 확인.
- [ ] **Step 6: 점검** — `design:design-critique`, `design:accessibility-review`(칩 대비, 색만으로 의도를 알리지 않음) → 수정 후 다시 캡처.
- [ ] **Step 7: 커밋** — `feat: 팔레트 말하듯 입력(의도 표시·문장 기억하기·최근 항목)`

### Task 13: Windows 스모크 시험과 기록

**Files:**
- Create: `desktop/scripts/smoke/t20-workspace.ps1`, `desktop/scripts/smoke/t20-run.ps1`, `desktop/scripts/smoke/t21-natural.ps1`, `desktop/scripts/smoke/t21-run.ps1`
- Modify: `desktop/scripts/smoke/smoke-lib.ps1`, `desktop/scripts/smoke/README.md`, `docs/decisions.md`, `docs/reports/company-pc-checklist.md`

리눅스 서버에서는 실행할 수 없다(PowerShell·Win32·실제 창·전역 단축키 필요). 스크립트를 작성해 커밋하고, 사용자가 Windows 개발 PC에서 `powershell -NoProfile -ExecutionPolicy Bypass -File .\t20-run.ps1`과 `.\t21-run.ps1`로 실행한다. 스크립트는 UTF-8 BOM으로 저장하고, 명령 키는 스캔 코드와 함께 사람 타이밍으로 보낸다(README 규칙). 배율이 다른 모니터 사이 ±10px(§11 완료 기준 첫 줄)은 모니터 2대(예: 노트북 150%·외부 100%)가 있어야 확인되며, 모니터가 1대면 스크립트가 그 판정을 `skipped`로 출력한다(M1 보고서: 개발 PC는 모니터 1대·125%).

- [ ] **Step 1: 도우미와 실행기** — `smoke-lib.ps1`에 추가: `DpiAware`(스크립트 시작 직후 `SetProcessDpiAwarenessContext(-4)`, 창 좌표를 물리 픽셀로 읽기 위해), `NewWinForm([string]$title, [int]$x, [int]$y, [int]$w, [int]$h)`(물리 좌표, `StartPosition` Manual, ControlBox 끔), `FrameOf($form)`(DWMWA_EXTENDED_FRAME_BOUNDS), `MoveForm`, `SetFormState($form, 'Normal'|'Minimized'|'Maximized')`, `TypeUnicode([string]$s)`(글자마다 SendInput KEYEVENTF_UNICODE, 30ms 간격; 글자 입력 전용이고 Enter·Esc·화살표는 기존 `Tap`), `ScreensInfo`(모니터마다 물리 영역과 배율). `t20-run.ps1`·`t21-run.ps1`은 `t18-run.ps1`처럼 `settings.json`·`workspaces.json`·`phrase-map.json`·`usage.json`·`intents.json`을 백업한 뒤 뒤의 네 파일을 지워 빈 상태로 시작하고(최근 항목·학습이 목록 순서를 바꾸지 않게), `ai.defaultTarget: 'copy'`, 바 가장자리 띠·오른쪽으로 설정해 `run-smoke.ps1 -Script <스크립트> -TimeoutSec 240`을 실행한 뒤 `finally`에서 모두 되돌린다. `@`처럼 Shift가 필요한 글자와 한글은 `TypeUnicode`로 입력한다(`TypeAscii`는 `$VK` 표의 글자만 입력).
- [ ] **Step 2: t20-workspace.ps1** — §11 완료 기준 순서:
  1. 시험 창 'SureMate-WS-A' `(100,100,600,400)`, 'SureMate-WS-B' `(750,100,600,400)`, 'SureMate-WS-C'(최대화). 배율이 다른 두 번째 모니터가 있으면 B를 그 모니터 작업 영역 왼쪽 위 + 100에 둔다. 출력 `monitors`, `mixed_dpi`(True/False/skipped);
  2. 팔레트 → `TypeUnicode '@'` → 맨 위 "지금 배치 저장" Enter → `workspace.save` windows ≥ 3 → `palette.show` mode workspace(편집 화면, 이름 칸 전체 선택) → `TypeAscii 'smoke ws'` → Ctrl+Enter → `workspace.edit` → Esc 두 번; `workspaces.json`의 세 규칙에 titleIncludes가 있음(`title_rules_written`, 같은 exe 창 3개);
  3. 흐트러뜨리기: A 이동(+300,+200) 후 최소화, B 최대화, C 보통 상태로 이동;
  4. 팔레트 → `TypeUnicode '@smoke ws'` → Enter → `workspace.restore` placed 3 → A·B 보이는 테두리가 저장 위치와 ±10px(`a_within_10px`, `b_within_10px`, 값도 출력), C 최대화(`c_maximized`), A·B 보통 상태(`ab_normal`), 앞 창이 복원 전 창과 같음(`focus_restored`);
  5. A를 닫고 다시 불러오기 → `workspace.restore` missing 1·placed 2(`missing_reported`);
  6. 단축키: `@smoke ws`에서 Ctrl+Enter(편집 화면) → Tab으로 단축키 칸까지 이동(횟수는 Task 8 화면의 Tab 순서) → Ctrl+Alt+9(보조키 0.3초 늦게 떼기) → `workspace.hotkey ok` → Esc → B 이동 → Ctrl+Alt+9 → `workspace.restore` source hotkey(`hotkey_restores`);
  7. 바: `LastBarPlace`와 M5 `BAR_METRICS`로 워크스페이스 항목 클릭 → `flyout.show` kind workspace-menu, 앞 창 그대로(`menu_kept_focus`), 캡처 `m7-flyout-workspaces` → 첫 행 클릭 → `workspace.restore` source bar(`bar_restores`);
  8. 로그(`workspace.*`·`palette.*`·`flyout.*`)에 'SureMate-WS'·'smoke ws'가 없음(`log_has_no_titles`, `log_has_no_names`); 캡처 `m7-ws-editor`(편집 화면).
- [ ] **Step 3: t21-natural.ps1** — §13 완료 기준의 실제 앱 확인:
  1. 팔레트 `@` + `TypeUnicode '보고서 모드'` → 저장 줄 Enter → `workspace.save`;
  2. `TypeUnicode '회의록 정리해줘'` → 캡처 `m7-natural-chip` → Enter → `palette.run` id `prompt:meeting-notes`(`natural_prompt`) → Esc 두 번;
  3. 영문 자판: `TypeAscii 'ghldmlfhr wjdflgownj'` → Enter → 같은 id(`english_mode`);
  4. '보고서 모드로 바꿔줘' → Enter → `palette.run` id `workspace:`로 시작·`workspace.restore`(`natural_workspace`); '가명 되돌려줘' → `cmd.unmask`(`natural_unmask`);
  5. 기억하기: '보고서 띄워줘' → ↓로 '보고서 모드' 행 선택(로그가 아닌 화면 순서이므로 캡처 `m7-remember`로도 확인) → Shift+Enter → `phrase.learn` → 다시 '보고서 띄워줘' → Enter → `palette.run` id가 같은 워크스페이스(`learned_top`);
  6. 로그에 '회의록'·'보고서'·'가명 되돌려'가 없음(`log_has_no_phrases`). 한글 IME로 직접 치는 확인은 README의 사람 확인 항목이다(KEYEVENTF_UNICODE는 IME 조합을 거치지 않음).
- [ ] **Step 4: 문서** — README 표에 t20·t21 행과 "결과를 눈으로 확인할 곳"(True여야 하는 줄, 캡처 4장에서 확인할 것, 배율이 다른 모니터 2대에서 다시 실행, 사람이 할 확인: 모니터 하나를 분리하고 불러오기 → §11 질문 → 주 모니터로 모으기, 관리자 권한 메모장 저장·복원 → "관리자 권한 창이라 건너뜀", 응답 없는 창은 확인하지 않음, 한글 IME로 '회의록 정리해줘' 입력). 회사 PC 점검표에 워크스페이스(Excel·HWP·Outlook 창 2개씩 저장·복원, 도킹 해제 뒤 질문, 보안 프로그램 경고)와 말하듯 입력(IME 새·이전 버전에서 문장 입력) 항목을 추가한다.
- [ ] **Step 5: 결정 기록** — `docs/decisions.md`에 한 줄씩 추가한다(날짜는 작업한 날, 형식 `날짜 · 결정 — 이유`):
  - 워크스페이스는 배치를 하나만 저장하고 다시 저장하면 지금 구성의 배치로 바꾼다. 구성이 다르면 확인 후 주 모니터로 모은다 — §3·§11 v4(구성별 저장은 Should 8)
  - 창 규칙의 대상 모니터는 저장한 모니터 키이고 배치마다 모니터 목록(역할·영역·배율)을 함께 저장한다. hotkey는 없으면 null, savedTitle 추가 — §11 모델은 제안, 편집 화면 미리 보기와 Should 8 역할 이동
  - 모니터 키 `<물리 너비>x<물리 높이>@<배율%>[i]:<DIP x>,<DIP y>`, 지문 `<수>|<키 정렬>` — §11 "정렬해 만든 키"
  - 최소화된 창은 저장하지 않고 건너뛴 수를 알린다 — 사용자 확인 결과와 함께 기록
  - 바탕 화면·작업 표시줄 창 클래스(Progman·WorkerW·Shell_TrayWnd·Shell_SecondaryTrayWnd)는 저장하지 않는다 — 제목이 있는 셸 창
  - 제목 규칙은 같은 실행 파일 창이 2개 이상일 때만 공통 끝 구간을 뺀 마지막 구간으로 만들고, 제목 규칙이 있으면 맞는 창만 짝짓는다. 같은 제목은 저장한 제목 → z-순서 — §11 2단계, 엉뚱한 창을 옮기지 않음
  - 복원은 맨 아래 창부터 이동하고 올려 z-순서를 되살리며, 끝나면 시작 때 앞에 있던 창으로 포커스를 되돌린다 — 데이터 모델 order, 최소화 해제·최대화가 다른 창을 활성화함
  - 최소화·최대화 해제는 ShowWindowAsync(SW_SHOWNOACTIVATE, 안 되면 SW_RESTORE), 이동·올리기는 SWP_ASYNCWINDOWPOS, 응답 없는 창은 건너뛰고 전체 10초 상한 — 응답 없는 앱 창에 main(팔레트·바)이 멈추지 않게
  - 위치 차이가 10px을 넘으면 0.2초 뒤 한 번 더 이동하고 그래도 넘으면 "위치가 조금 다름" — §11 4단계·±10px
  - 복원 목표는 창 일부 48 DIP와 제목 줄이 작업 영역 안에 있게 자른다 — 다른 구성에서 모을 때 화면 밖 방지
  - 같은 이름(공백·대소문자 무시)으로 저장하면 그 워크스페이스를 지금 배치로 바꾸고, 새 이름 기본값은 "배치 N"이며 팔레트에서 저장하면 편집 화면이 열린다 — 사용자가 좌표를 입력하지 않음(§11)
  - 편집 화면은 팔레트 안 화면이고 11/15 설정 화면이 같은 컴포넌트를 사용한다 — 사용자 확인 결과와 함께 기록
  - 다른 구성 확인은 Windows 대화상자(바·단축키에서도) — 펼침 창은 키보드를 받지 않고, 용어 팩 가져오기 확인과 같은 방식
  - 다시 저장하면 창 규칙을 모두 포함으로 새로 만든다 — 저장 시점의 창 목록이 기준
  - 워크스페이스 단축키는 `workspace:<id>`로 등록하고, 녹화 중에는 모든 단축키를 잠시 해제하며, Sure-Mate의 다른 단축키와 같으면 거절한다 — §6·§14
  - 바 워크스페이스 메뉴는 최근 저장·수정 순 8개와 "편집·모두 보기" — 펼침 창 높이
  - 워크스페이스 제한(30개, 창 40개, 이름 40자, 별칭 10개×40자, 제목 규칙 100자, 정규식 200자, 모니터 8대) — 설계에 없음
  - 말하듯 입력은 변형 검색어(입력 그대로, 조사 제거 −1점, 의도 단어 제거 −2점)마다 점수를 계산해 항목마다 최고점을 사용한다 — §13 5단계 "동점이면 원형"
  - 조사는 2음절 이상 남을 때만 제거한다 — "평가·결과"가 "평·결"로 잘리지 않게
  - 의도 단어는 제거한 요청 어미 안에 있거나 낱말 전체가 같을 때만 인정한다 — '정적분석'의 '분석'으로 프롬프트가 앞서지 않게
  - 의도 가산점은 맞은 규칙마다 120점(합산), id로 지목한 규칙은 검색에 맞지 않아도 후보, 학습 가산점 2,000점 — §13 7단계에 값 없음, 문장 표 51개로 검증
  - 요청 어미에 "…줘"마다 "…주세요"와 "붙여넣어(줘)·붙여(줘)"를 추가 — §13 목록은 예시
  - 가명 의도에 좁은 규칙 두 개(되돌려·원래 이름 → 가명 되돌리기, 가려 → 선택한 글 가명 처리) 추가 — "가명 되돌려줘"가 네 가명 명령의 제목 길이에 따라 정해지지 않게
  - 영문 자판 입력은 두벌식으로 바꾼 글의 절반 이상이 완성 음절일 때만 −50점으로 함께 검색한다 — §13 "영문 모드로 친 한글", 영어 낱말은 그대로
  - 학습(Should 9 일부): 맨 위가 아닌 후보에서 Shift+Enter "기억하고 실행", `phrase-map.json` 300개, 같은 문장은 새로 기억한 것으로 교체, 키는 끝 기호·군말을 제거하고 공백을 뺀 문장(기호 유지) — 사용자 확인 결과와 함께 기록, M4가 미룬 동점 학습 연결
  - 사용 기록 `usage.json`(id·횟수·마지막 시각, 200개), 동점 순서는 점수 → 제목 일치 → 학습 → 사용 점수(횟수 × 14일 반감) → 짧은 제목 → 추가 순서 — §9 동점 순서, §6 빈 화면 최근 항목
  - 워크스페이스 단축키 녹화는 30초가 지나면 main이 끝내고 단축키를 다시 등록한다 — 녹화 중 팔레트가 숨어 blur가 오지 않아도 단축키가 해제된 채 남지 않게
  - 의도 표시는 맨 위 후보에만, 기억한 문장 → 가장 좁은 규칙 이름 → id를 가리키는 규칙 이름 → 구역 기본 이름 — §6
  - 사용자 `intents.json`이 있으면 그것만 사용하고(덮어쓰기본), 읽지 못하면 기본 목록과 알림 — §5
  - "클로드로 회의록 정리"는 프롬프트 의도로만 처리하고 AI 대상은 바꾸지 않는다 — Should 7
  - Task 7·8·12 디자인 단계에서 정한 값
- [ ] **Step 6: 리눅스 확인** — `npm test`, `npm run typecheck`, `npx electron-vite build` PASS. 서버에 `pwsh`가 있으면 M5 Task 13과 같은 방법으로 새·수정 `.ps1`의 구문 오류를 확인한다(없으면 건너뛰고 보고).
- [ ] **Step 7: 커밋** — `test: 워크스페이스·말하듯 입력 스모크 시험과 결정 기록`
- [ ] **Step 8: 보고** — 사용자에게 Windows에서 `t20-run.ps1`·`t21-run.ps1` 실행을 요청하고, 확인할 결과(README의 True 줄, 캡처 4장, 배율이 다른 모니터 2대에서 다시 실행, 모니터 분리·관리자 권한 창·한글 IME 사람 확인)를 전달한다. 결과를 받기 전에는 M7 완료로 보고하지 않는다(§0 단계 보고 규칙).
