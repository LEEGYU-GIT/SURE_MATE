# M6 말랑 메이트 데스크톱 펫 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 바가 있는 모니터의 작업 표시줄 위를 통통 다니다 바 옆면을 올라 꼭대기에 앉고, 잡아 던지면 떨어지며, 프롬프트 복사·가명 처리 상태에 반응해 말풍선으로 알리는 말랑 메이트(F10 §14-2)를 작은 투명 창 하나로 띄운다. 펫 모양 밖의 클릭은 아래 창으로 통과하고, 가만히 있을 때 CPU 1% 미만이며, 전체 화면 앱 앞에서는 바와 함께 숨는다.

**Architecture:** 판단은 모두 순수 모듈에 둔다. 세계(바닥·벽·바 옆면·바 꼭대기)·물리(중력·튀기·충돌·던진 속도)·혼자 놀기 계획·창 배치·말풍선 자리·클릭 판정·반응과 문구는 `shared/pet/`, 상태 기계(동작 고리·몸짓·클릭 통과 조회·졸기·반응·메뉴·조종)는 `main/pet/pet-controller.ts`에 두고 창·화면·커서·시계·난수를 주입받아 가짜 시계로 시험한다(`capture-flow.ts`와 같은 방식). Electron 연결부(`pet-window.ts`·`pet-runtime.ts`)는 얇게 두고 M5 바 런타임의 `raise()` 끝·전체 화면 숨김·바 위치 변화에 펫을 연결한다. 그림은 같은 renderer 번들의 `#/pet` 경로에서 시안 SVG로 그린다. 상태 기계는 `PetLook`만 내보내고 그림과는 `PetCharacter` 한 곳에서만 만난다(§14-3 캐릭터가 나중에 갈아 끼울 자리). 리눅스에서는 M5 미리 보기로 모든 모습을 1·1.25·1.5배로 캡처해 시안과 비교한다.

**Tech Stack:** Electron 45.2.3, React 19, TypeScript, Tailwind v4, Vite 8, Vitest, koffi 3. 새 의존성 없음.

**Spec:** `docs/superpowers/specs/2026-11-05-sure-mate-design.md` (§14-2 F10 핵심, §5 펫 창, §14 펫 설정 항목, §14-1 바, §14-4 디자인 시스템, §16, §17, §19, §20) · 확정 시안 `docs/design/mallang-mate.html` · M5 계획 `docs/superpowers/plans/2026-11-09-m5-bar.md` · `docs/decisions.md`

**M5에서 사용하는 이름:** M5 완료 후 시작한다. 아래 이름은 M5 계획의 Interfaces를 그대로 따른다. 실제 코드가 계획과 다르면 실제 코드를 따르고 작업 보고에 기록한다.
- T1 `BarEdge`, `Settings.pet.visible` · T2 `createFakeApi`·`FakeFixtures`·`Scene`·`SCENES`·`<Desktop>`·`scripts/preview/shoot.sh` · T3 `BAR_METRICS`·`barRect`·`pickBarDisplay` · T4 `Timers`·`realTimers`(`main/timers.ts`)·`createTopmostKeeper`, native `raiseTopmost`·`mouseButtonDown` · T5 `BarController`의 `anchor`·`state().collapsed`·`visible()`, `DISPLAY_SETTLE_MS` · T6 `Bar.tsx`·`token-usage.test.ts` · T7 `FLYOUT_TIMING` · T9 `runFromBar` · T10 `overlayWindowOptions`·`loadRoute`·`createBarRuntime`·`applySettings`·`openSettings`·`togglePet` · T12 `createWikiCard` · T13 스모크 도우미 `ClickAt`·`HoverAt`·`ShotRect`·`LastBarPlace`·`TopmostIsApp`, `run-smoke.ps1 -TimeoutSec`, `t18-run.ps1`

**이번에 하지 않는 것:**
- 캐릭터 꾸미기(§14-3, Should 1): 그림 교체 자리(`PetCharacter`)만 만든다. 설정의 "캐릭터" 항목, 내 이미지·AI SVG 붙여넣기는 해당 작업이 추가한다.
- 설정 화면(11/15): 펫 설정은 `settings.json`의 `pet`에서 수정한다. 펫 메뉴 "펫 설정"은 M5의 `openSettings`(파일 열기)를 그대로 호출하고, 설정 화면 작업이 교체한다.
- 여러 마리, 다른 모니터로 넘어가기, 소리(§3 Won't).

**사용자 확인이 필요한 결정(§0: 설계와 다르게 진행하기 전에 확인):**
1. 클릭 통과: 설계는 `setIgnoreMouseEvents(true, { forward: true })` + 렌더러 판정이다. Electron은 Windows에서 `forward`를 프로세스 안 `WH_MOUSE_LL` 전역 마우스 훅으로 구현한다(확인 필요: Electron 소스 `native_window_views_win.cc`의 `SetForwardMouseMessages`). §10과 M5의 "전역 훅 없이 조회만" 원칙과 충돌하고, 마우스가 움직일 때마다 main이 깨어난다. 이 계획은 `forward` 없이 main이 커서를 조회(가까우면 34ms, 멀면 100ms, 졸 때 250ms)해 펫 모양 위에서만 `setIgnoreMouseEvents(false)`로 바꾼다. 비용: 펫이 클릭 가능해지기까지 최대 약 0.1초. 설계 방식으로 되돌리면 Task 9 연결부와 렌더러 판정만 바뀐다.
2. 바 오르기: M5 바는 높이가 항목 수이고 기본 세로 위치가 가운데라 바닥에 닿지 않는다(시안의 띠는 바닥까지 닿음). 펫은 바 안쪽 면 아래 바닥에서 뛰어올라 옆면에 붙은 뒤 오른다.
3. 펫 창 크기: 설계 "약 240×160 DIP" 대신 320×240 DIP. 너비 200 말풍선과 4행 메뉴를 72 DIP 펫 위나 옆에 포함한다. 투명하고 펫 모양 밖은 통과하므로 화면상 차이는 없다.
4. 완료 기준 "1분 안에 걷다가 바를 올라 앉기": 무작위 가중치만으로는 1분 안에 발생할 확률이 약 50%다. 시작·깬 뒤 첫 계획과 바에서 내려온 지 45초가 지난 계획은 바 오르기로 고정한다.

## Global Constraints

- 리눅스 서버: 명령은 `desktop/`에서 Node 22로 실행한다. 기본 `node`는 v12이므로 먼저 `export PATH="$(git rev-parse --show-toplevel)/../../tools/node22/bin:$PATH"`를 실행하고 `node --version`(22 이상)을 확인한다. 리눅스에서 가능한 검증은 `npx vitest run <파일>`, `npm test`, `npm run typecheck`, `npx electron-vite build`, 미리 보기 캡처뿐이다. 실제 창·클릭 통과·Win32·포커스·CPU는 Task 11(Windows)에서만 확인한다.
- 모든 BrowserWindow: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `spellcheck: false`.
- 펫 창(§14-2·§5·§19): 작은 투명 창 하나를 옮긴다. `frame:false, transparent:true, focusable:false`(조종 모드에서만 true), `skipTaskbar:true`, `alwaysOnTop` 수준 `'screen-saver'`, `showInactive()`로 표시. 클릭은 펫 몸·말풍선·펫 메뉴 위에서만 받고 나머지는 아래 창으로 통과한다. 바가 있는 모니터에서만 다니고 다른 모니터로 넘어가지 않는다. 펫은 늘 바 앞에 그린다.
- 움직임 값(§14-2·시안): 숨쉬기 2.4초 주기 가로 1.03·세로 0.97, 4초마다 깜빡임, 통통 걷기 0.9초 주기(내려앉을 때 1.08×0.9, 늘어날 때 0.94×1.08, 위로 격자 14), 집어 들림 ±6° 1.6초, 소품 떠오르기 2초 위로 격자 6, 중력 2,000 DIP/초², 바닥 반발 0.3(한 번), 걷는 속도 차분 40·보통 60·활발 90 DIP/초, 가만히 5~20초, 바 꼭대기 쉼 30~90초, 졸기 3분(설정), 말풍선 4초(누르면 닫힘).
- 그림(§14-2·§14-4): 64×64 격자 하나, 바닥선 y=58, 외곽선 `--ink` 격자 3, 몸 `--brand`, 하이라이트 흰색 55%, 볼 `--cheek` 80%. 표정과 소품(선글라스·편지·느낌표·z·조종 표시)은 레이어다. 시안 SVG 경로를 그대로 옮긴다. 색은 토큰만 사용하고(흰색은 새 토큰 `--white`), 글자 굵기는 400·600.
- 움직임 줄이기(설정 `pet.reduceMotion` 또는 Windows 애니메이션 효과 끔 = `prefers-reduced-motion`): 부풀기·튀기·흔들림·크기 변화를 끄고 자리 이동만 남긴다. 바닥에서 튀지 않는다.
- 성능(§16·§14-2): 가만히 있을 때 Sure-Mate 전체 CPU 1% 미만(5분 평균), 펫 이동 30fps 이하. 걷기·뛰기·오르기·공중·들림 동안에만 동작 고리(34ms 타이머)를 돌리고 창을 옮긴다. 가만히·앉기·졸기·반응·메뉴 동안에는 창을 옮기지 않는다. 졸 때는 CSS 애니메이션도 멈춘다. CSS 애니메이션은 `transform`·`opacity`만 사용한다. 숨긴 펫에는 타이머가 없다. 반복되는 일(프레임·커서 조회·맨 앞 올리기)은 기록하지 않는다.
- 전역 키보드·마우스 훅을 사용하지 않고 조회만 한다(`screen.getCursorScreenPoint`, `mouseButtonDown`, `powerMonitor.getSystemIdleTime`). `setIgnoreMouseEvents`는 `forward` 없이 호출한다(위 결정 1).
- Win32는 `win32()`로만 호출한다. 펫은 `nativeStatus()`가 실패해도 표시·이동한다(빠지는 것: `SetWindowPos` 맨 앞 올리기 → `moveTop()`, 조종 종료 뒤 원래 창 포커스, 끄는 중 버튼 조회).
- 좌표는 모두 DIP다. 물리 픽셀이 필요하면 `coords.ts`만 사용한다.
- 로그: 선택 글·프롬프트·말풍선 문구·AI 이름을 남기지 않는다(종류·건수·사각형만). 오류는 `errorText()`.
- 설정 저장은 `updateSettings`, 저장 뒤 `applySettings(next)`.
- 말풍선 문구(§14-2·§20): 존댓말, 짧게. 건수·분류·AI 이름은 실제 값.
- 앱은 네트워크 요청을 보내지 않는다. 커밋 메시지는 `feat: …`(한국어), 실명 없음, 시험 데이터 이름은 가상(가상자동차, XY방산)만 사용한다.

## Review Focus

1. **클릭 통과 복귀**: 펫을 끌다 창 밖에서 놓거나, 메뉴를 닫거나, 조종을 종료하거나, 숨겼다 다시 표시하거나, 말풍선이 사라진 뒤에도 펫 모양 밖의 바탕화면 아이콘·작업 표시줄은 커서 조회 한 번(최대 0.1초) 안에 다시 눌린다. → Task 5·7·8 테스트(마지막 `setIgnoreMouse` 호출이 `true`).
2. **펫 아래의 바 변화**: 펫이 앉아 있거나 오르는 중에 바를 끌어 옮기거나, 모양을 바꾸거나, 끄거나, 잠시 숨기거나, 자동 숨김으로 들어가면 펫이 바를 따라가거나 떨어진다. 허공에 떠 있거나 바 안에 박히지 않고, 전체 화면 앱 때문에 바와 함께 숨었다 돌아온 펫은 앉은 자리를 유지한다. → Task 2(바 옆면 충돌)·Task 5 테스트.
3. **모니터·작업 표시줄 변화**: 도킹 해제, 배율 변경, 주 모니터 변경, 작업 표시줄 왼쪽·위쪽·자동 숨김에서 펫이 바가 있는 모니터의 새 바닥에 다시 서고 화면 밖이나 다른 모니터로 가지 않는다. 창이 옆 모니터에 걸치지 않는다. → Task 2·4·5 테스트.
4. **놓침**: 끄는 중 Alt+Tab, 창 밖에서 버튼 떼기, pointerup 미도착에도 펫이 커서에 붙어 있지 않는다(버튼 조회 두 번 연속 false면 놓음, 렌더러는 pointercancel·lostpointercapture·blur에도 놓음 전송). → Task 5·6 테스트.
5. **반응 몰림**: 1초에 여러 번 복사, 들고 있거나 졸거나 숨긴 동안의 반응, 말풍선 끔에서 말풍선은 하나(마지막 것)이고 쌓이지 않는다. 숨긴 펫은 반응하지 않고, 들고 있던 펫은 내려놓은 뒤 마지막 반응 하나만 표시한다. → Task 7 테스트.

## 파일 구조

| 파일 | 책임 |
|---|---|
| `shared/pet/pet-settings.ts` | 펫 설정 타입·기본값·검사, 활발함별 걷는 속도 |
| `shared/pet/pet-world.ts` · `pet-physics.ts` | 바닥·벽·천장·바 옆면·바 꼭대기, 공중 이동·충돌·던진 속도 |
| `shared/pet/pet-behavior.ts` | 혼자 놀기 계획(가중치·바 방문 보장·목적지·시간) |
| `shared/pet/pet-view.ts` | 모습·화면 값 타입(`PetLook`·`PetView`·메뉴 행·키) |
| `shared/pet/pet-frame.ts` | 펫 상자·창 사각형·말풍선과 메뉴 자리·클릭 판정 모양 |
| `shared/pet/pet-reactions.ts` · `pet-copy.ts` | 앱 일 → 반응, 말풍선·메뉴 문구 |
| `shared/pet/pet-ipc.ts` | 펫 IPC 값 검사 |
| `shared/app-events.ts` · `main/app-events.ts` | 앱 일(복사·되돌리기·가져오기 실패) 타입과 전달 통로 |
| `main/pet/pet-controller.ts` | 상태 기계(순수, 주입식) |
| `main/pet/pet-commands.ts` | 팔레트 명령 |
| `main/pet/pet-runtime.ts` · `main/windows/pet-window.ts` | Electron 연결부 |
| `renderer/src/pet/mallang-shapes.ts` · `character.tsx` · `draw-plan.ts` · `PetSprite.tsx` · `pet.css` | 그림·움직임(그림 교체 자리 포함) |
| `renderer/src/pet/Pet.tsx` · `PetBubble.tsx` · `PetMenu.tsx` · `press.ts` · `bubble-box.ts` · `pet-keys.ts` | 펫 창 화면 |

---

### Task 1: 펫 설정 필드

**Files:**
- Create: `desktop/src/shared/pet/pet-settings.ts`
- Modify: `desktop/src/main/settings/settings-store.ts`
- Test: `desktop/src/shared/pet/pet-settings.test.ts`, `desktop/src/main/settings/settings-store.test.ts`

**Interfaces:**
- Consumes: M5 T1 `Settings.pet`
- Produces: `PetSize = 40 | 56 | 72`, `PetActivity = 'calm' | 'normal' | 'lively'`, `PetSettings = { visible: boolean; size: PetSize; activity: PetActivity; sleepAfterMin: number; bubbles: boolean; reactions: boolean; controlHotkey: string | null; reduceMotion: boolean }`, `DEFAULT_PET_SETTINGS`, `sanitizePetSettings(raw: unknown): PetSettings`, `WALK_SPEED: Record<PetActivity, number>`. `Settings.pet`의 타입을 `PetSettings`로 바꾼다.

§14의 펫 항목(보이기, 크기 40/56/72 DIP, 활발함, 졸기까지 시간, 말풍선, 반응, 조종 단축키, 움직임 줄이기)이다. 기본값 `{ visible: true, size: 56, activity: 'normal', sleepAfterMin: 3, bubbles: true, reactions: true, controlHotkey: null, reduceMotion: false }`. 기본 크기 56은 설계에 없는 값이다. 조종 단축키 기본값은 없다(§19). `WALK_SPEED = { calm: 40, normal: 60, lively: 90 }`. "캐릭터"는 §14-3 작업이 추가한다.

- [ ] **Step 1: 실패하는 테스트** — `sanitizePetSettings(undefined)`가 기본값과 같다; `size` 64·`'56'` → 56, 40·72 유지; `activity: 'fast'` → `'normal'`; `sleepAfterMin` 0 → 1, 999 → 60, 2.6 → 3, `'x'` → 3; `controlHotkey` `''`·`'   '`·숫자·65자 이상 → null, `' Ctrl+Alt+P '` → `'Ctrl+Alt+P'`; 불리언 칸에 문자열 → 기본값; `mergeSettings({})`의 `pet`이 기본값; `mergeSettings({ pet: { visible: false } })` → visible false·나머지 기본값; M5 시험의 옛 설정 JSON(`pet` 없음) → 기본값; 저장 → 읽기에서 바꾼 `pet.size`·`activity` 유지.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/shared/pet/pet-settings.test.ts src/main/settings/settings-store.test.ts` → FAIL(모듈 없음)
- [ ] **Step 3: 구현** — `mergeSettings`가 `pet: sanitizePetSettings(r.pet)`를 채운다.
- [ ] **Step 4: 통과 확인** — PASS, `npm run typecheck`
- [ ] **Step 5: 커밋** — `feat: 펫 설정 필드와 기본값`

### Task 2: 펫 세계와 물리

**Files:**
- Create: `desktop/src/shared/pet/pet-world.ts`, `desktop/src/shared/pet/pet-physics.ts`
- Test: `desktop/src/shared/pet/pet-world.test.ts`, `desktop/src/shared/pet/pet-physics.test.ts`

**Interfaces:**
- Consumes: `MonitorInfo`·`Rect`(`shared/types.ts`), M5 `BarEdge`
- Produces:
  ```ts
  interface PetBar { rect: Rect; edge: BarEdge }
  interface PetWorld {
    displayId: string; scale: number; bounds: Rect
    floorY: number; minX: number; maxX: number; topY: number
    bar: PetBar | null
    side: { x: number; top: number; bottom: number; wall: 'left' | 'right' } | null
    ledge: { y: number; x1: number; x2: number; cx: number } | null
  }
  petWorld(monitor: MonitorInfo, bar: PetBar | null, size: number): PetWorld
  interface Body { x: number; y: number; vx: number; vy: number }   // 발 가운데 x·바닥선 y(DIP), 속도(DIP/초)
  type AirContact = 'none' | 'bounce' | 'floor' | 'ledge' | 'wall' | 'ceiling'
  stepAir(body: Body, dt: number, world: PetWorld, o: { size: number; bounced: boolean; reduceMotion: boolean }): { body: Body; contact: AirContact; bounced: boolean }
  throwVelocity(samples: { t: number; x: number; y: number }[], now: number): { vx: number; vy: number }
  jumpVelocity(height: number): number
  ```
  `PHYSICS = { gravity: 2000, restitution: 0.3, minBounceSpeed: 150, maxThrowSpeed: 2400, throwWindowMs: 100, maxDt: 0.1 }`, `PET_BASELINE = 58 / 64`, `CLIMB_OFFSET = 12 / 64`(바 면에서 발 가운데까지, 몸 크기 배율)

세계(§14-2 "어디를 다니나"). Win32 조회 없이 작업 영역과 화면 사각형만 사용한다.
- 바닥 `floorY` = 작업 영역 아래 끝이다. 작업 표시줄이 아래면 그 위, 자동 숨김·왼쪽·위쪽이면 화면 아래 끝과 같다.
- 벽(발 x 범위) `minX = workArea.x + size/2`, `maxX = workArea.right − size/2`. 옆 작업 표시줄 위로 가지 않는다. 천장 `topY = bounds.y + PET_BASELINE·size`(머리가 화면 위를 넘지 않음).
- 바: 바 사각형이 이 모니터 `bounds` 안에 있을 때만 사용한다. `side`는 바 안쪽 면(오른쪽 바면 `rect.x`, 왼쪽 바면 `rect.right`)에 붙어 오를 때의 발 x(면에서 `CLIMB_OFFSET·size`만큼 안쪽), 오르는 범위 `top = rect.y`·`bottom = rect.bottom`, `wall`은 바가 있는 쪽이다. `ledge`는 바 꼭대기(y = rect.y, 좌우 끝, 가운데)다. 바 꼭대기 위에 펫이 들어갈 자리가 없으면(`rect.y < topY`) `side`·`ledge`는 null이다(펫이 오르지 않음).

공중(`stepAir`): `dt`는 `maxDt`로 자르고, 시작 발이 바닥 아래(y₀ > floorY)면 y₀ = floorY에서 시작한다. 등가속 식 `y += vy·dt + ½·g·dt²`, `vy += g·dt`를 사용한다. 충돌은 이 순서로 확인한다.
1. 천장: y < topY → y = topY, vy = 0, `ceiling`.
2. 바 꼭대기: 이전 발이 꼭대기 위에 있었고(y₀ ≤ ledge.y) 이번에 지나쳤으며 발 x가 `x1 − size/4 … x2 + size/4` 안 → y = ledge.y, 속도 0, `ledge`.
3. 바 옆면: 발이 꼭대기보다 아래에서 몸 상자(`[x ± size/2] × [y − PET_BASELINE·size, y]`)가 바와 겹침 → 안쪽 면 밖으로 밀어내고(오른쪽 바면 x = rect.x − size/2) vx = −0.3·vx, `wall`.
4. 벽: `minX`·`maxX`로 자르고 vx = −0.3·vx, `wall`.
5. 바닥: 닿는 순간 속도는 `√(vy₀² + 2·g·(floorY − y₀))`로 계산한다. 아직 튀지 않았고 그 속도가 150을 넘고 움직임 줄이기가 아니면 y = floorY, vy = −0.3·속도, vx ×0.5, `bounce`. 아니면 y = floorY, 속도 0, `floor`.

`throwVelocity`는 `now − 100ms` 안의 가장 오래된 표본과 마지막 표본의 차이를 시간으로 나누고, 크기를 2,400으로 자른다(방향 유지). 표본이 2개 미만이면 0이다. `jumpVelocity(h) = −√(2·g·h)`.

- [ ] **Step 1: 실패하는 테스트** — 주 모니터 `{ id: '1', bounds: {0,0,1920,1080}, workArea: {0,0,1920,1040}, scaleFactor: 1, isPrimary: true, isInternal: false }`, 오른쪽 띠 `{ rect: {1864,292,56,456}, edge: 'right' }`, size 56:
  - `petWorld` → floorY 1040, minX 28, maxX 1892, topY 50.75, side `{ x: 1853.5, top: 292, bottom: 748, wall: 'right' }`, ledge `{ y: 292, x1: 1864, x2: 1920, cx: 1892 }`; 왼쪽 띠 `{0,292,56,456}` → side.x 66.5·wall `'left'`; 오른쪽 캡슐 `{1864,306,44,428}` → side.x 1853.5·ledge.cx 1886;
  - (Review Focus 3) 작업 표시줄 왼쪽 `workArea {48,0,1872,1080}` → floorY 1080·minX 76; 위쪽 `{0,40,1920,1040}` → floorY 1080; 자동 숨김(작업 영역 = 화면) → 1080; 다른 모니터 좌표의 바 `{-1280,292,56,456}` → bar·side·ledge null; 바 y 12 → side·ledge null;
  - 낙하 `{x:500, y:40, vx:0, vy:0}`을 1/30초씩 → `bounce` 정확히 한 번(직후 vy −600), 튄 뒤 최고점이 바닥 위 90 ± 2, 이어서 `floor`, 마지막 속도 0; 움직임 줄이기 → 첫 닿음이 `floor`; 닿는 속도 100 → `floor`;
  - `{x:1892, y:100}` 낙하 → `ledge`, y 292; (Review Focus 2) `{x:1700, y:600, vx:2000, vy:0}`, dt 0.1 → x 1836(바 면 1864 − 28), vx −600, `wall`; 벽 `{x:100, y:500, vx:−1000, vy:0}`, dt 0.2 → x 28, vx 300; 천장 `{x:500, y:300, vx:0, vy:−3000}`, dt 0.2 → y 50.75, vy 0; dt 5 → 0.1로 자름; 바닥 아래에서 시작 `{x:500, y:1060, vx:0, vy:0}` → `floor`, y 1040(NaN 없음);
  - `throwVelocity([{t:0,x:0,y:0},{t:50,x:50,y:−20},{t:100,x:100,y:−40}], 100)` → `{ vx: 1000, vy: −400 }`; t −50 표본은 무시; 표본 하나 → 0; 100ms에 1,000 DIP → 크기 2,400; `jumpVelocity(292)` ≈ −1080.7.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/shared/pet/pet-world.test.ts src/shared/pet/pet-physics.test.ts` → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — PASS, `npm run typecheck`
- [ ] **Step 5: 커밋** — `feat: 펫 세계(바닥·벽·바)와 물리`

### Task 3: 혼자 놀기 계획

**Files:**
- Create: `desktop/src/shared/pet/pet-behavior.ts`
- Test: `desktop/src/shared/pet/pet-behavior.test.ts`

**Interfaces:**
- Consumes: Task 1 `PetActivity`, Task 2 `PetWorld`
- Produces: `PetPlan = { kind: 'idle'; ms: number } | { kind: 'walk'; x: number } | { kind: 'bar' }`, `PET_TIMING = { firstIdleMs: 3000, idleMs: [5000, 20000], sitMs: [30000, 90000], barEveryMs: 45000, minWalk: 120 }`, `ACTIVITY_WEIGHTS: Record<PetActivity, { idle: number; walk: number; bar: number }>`, `choosePlan(c: { activity: PetActivity; world: PetWorld; footX: number; sinceBarMs: number | null; random: () => number }): PetPlan`, `pickMs(range: readonly [number, number], random: () => number): number`

§14-2 "가만히(5~20초), 바닥의 아무 곳으로 걷기, 가끔 바로 가서 기어올라 앉기(30~90초 쉼), 뛰어내리기를 무작위 가중치로" 계획한다. 가중치(가만히·걷기·바)는 설계에 없는 값이다: 차분 0.6·0.3·0.1, 보통 0.4·0.4·0.2, 활발 0.2·0.5·0.3.
- 바 방문 보장: `world.side`가 있고 `sinceBarMs`가 null(시작·깬 뒤 아직 바에 가지 않음)이거나 45,000 이상이면 `{ kind: 'bar' }`이고 `random()`을 호출하지 않는다. 처음 위치(바닥 가운데)와 첫 가만히 3초를 합하면 보통 활발함에서 약 30초 안에 바 꼭대기에 앉는다(완료 기준 1분).
- `world.side`가 없으면 bar 가중치를 0으로 두고 나머지 비율을 유지한다.
- `random()`은 종류 선택에 한 번(누적 구간 가만히 → 걷기 → 바), 목적지·시간에 한 번 호출한다.
- 걷기 목적지 = `minX + r·(maxX − minX)`. 지금 발 x와 120 DIP보다 가까우면 같은 방향으로 120 떨어진 곳, 범위를 넘으면 반대 방향 120. 가만히 시간 = `pickMs(idleMs, r)`.
- `pickMs([a, b], r) = Math.round(a + r·(b − a))`.

- [ ] **Step 1: 실패하는 테스트** — 오른쪽 띠 세계(Task 2 값):
  - `sinceBarMs` null → bar, `random` 호출 0회; 45,000 → bar; 바 없는 세계에서 null → bar 아님;
  - 보통·44,999, `random` 차례로 [0.0, 0.5] → `{ kind: 'idle', ms: 12500 }`; [0.5, …] → walk; [0.9] → bar; 차분 0.65 → walk, 0.95 → bar; 활발 0.15 → idle;
  - 바 없음·보통: 0.45 → idle, 0.55 → walk, 0.99 → walk;
  - 목적지: footX 1000, [0.5, 0.5] → raw 960 → x 880; footX 60, [0.5, 0.02] → raw 65.28 → x 180;
  - `pickMs([5000, 20000], 0)` → 5000, `0.999999` → 20000.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/shared/pet/pet-behavior.test.ts` → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — PASS
- [ ] **Step 5: 커밋** — `feat: 펫 혼자 놀기 계획(가중치·바 방문 보장)`

### Task 4: 펫 창 배치·말풍선 자리·클릭 판정

**Files:**
- Create: `desktop/src/shared/pet/pet-view.ts`, `desktop/src/shared/pet/pet-frame.ts`
- Test: `desktop/src/shared/pet/pet-frame.test.ts`

**Interfaces:**
- Consumes: Task 1 `PetSize`, Task 2 `PET_BASELINE`
- Produces:
  ```ts
  type PetPose = 'stand' | 'walk' | 'climb' | 'sit' | 'sleep' | 'held' | 'air'
  type PetFace = 'normal' | 'happy' | 'worried' | 'surprised' | 'content' | 'asleep' | 'up'
  type PetProp = 'sunglasses' | 'envelope' | 'alert' | 'zzz' | 'control'
  interface PetLook { pose: PetPose; face: PetFace; props: PetProp[]; facing: 'left' | 'right'; cue: 'hop' | 'land' | null; cueSeq: number }
  type PetMenuAction = 'control' | 'sleep' | 'wake' | 'hide' | 'settings'
  interface PetMenuRow { action: PetMenuAction; title: string; detail?: string }
  type SlotSide = 'above' | 'left' | 'right'
  interface PetView {
    size: PetSize
    box: { x: number; y: number }                                               // 창 안 펫 상자 왼쪽 위
    look: PetLook
    bubble: { seq: number; text: string; side: SlotSide; slot: Rect } | null   // slot: 창 안 최대 자리
    menu: { rows: PetMenuRow[]; rect: Rect; side: SlotSide } | null             // 창 안
    controlling: boolean
    reduceMotion: boolean
  }
  PET_WINDOW = { width: 320, height: 240 }
  SLOT = { gap: 8, margin: 8, bubbleWidth: 200, bubbleMaxHeight: 96, menuWidth: 176, menuRow: 32, menuPad: 4 }
  hopRoom(size: number): number                                                 // Math.round(14 / 64 * size)
  petBox(foot: { x: number; y: number }, size: number): Rect
  petWindowRect(box: Rect, bounds: Rect): Rect
  placeSlot(o: { size: { width: number; height: number }; box: Rect; window: Rect; bounds: Rect; hop: number }): { rect: Rect; side: SlotSide }
  menuSize(rows: number): { width: number; height: number }
  hitShape(pose: PetPose, box: Rect, mirror: boolean): Rect[]
  isOver(p: { x: number; y: number }, rects: (Rect | null)[]): boolean
  ```

모든 값은 화면 DIP다(controller가 창 좌표로 바꿔 보낸다).
- `petBox`: 64 격자 상자 `{ x: foot.x − size/2, y: foot.y − PET_BASELINE·size, width: size, height: size }`.
- `petWindowRect`: 상자를 창 아래 가운데에 두고(`x = 상자 가운데 − 160`, `y = 상자 아래 − 240`) `bounds` 안으로 자른 뒤 반올림한다. 창이 옆 모니터에 걸치면 배율이 다른 모니터에서 Electron이 창 크기를 바꾸므로(electron#27651) 걸치지 않게 한다. 그래서 화면 끝에서는 창이 멈추고 펫이 창 안에서 움직인다.
- `placeSlot`: 먼저 위쪽을 확인한다. x = 상자 가운데 − w/2를 창 안 `[창.x + 8, 창.right − 8 − w]`로 자르고 y = 상자 위 − hop − 8 − h. y가 창 위 + 8과 `bounds` 위 + 8 이상이면 `'above'`. 아니면 옆이다: 창 안에서 상자 왼쪽 여유가 오른쪽보다 크면 `'left'`(x = 상자 왼쪽 − 8 − w), 아니면 `'right'`(x = 상자 오른쪽 + 8). y = 상자 가운데 − h/2를 창 안 `[창.y + 8, 창.bottom − 8 − h]`로 자른다.
- `menuSize(n) = { width: 176, height: n·32 + 8 }`.
- `hitShape`: 자세별 격자 사각형(외곽선 포함)을 상자 크기로 늘린다. stand·walk·air `[{14,15,36,12},{7,27,50,33}]`, sit `[{12,29,40,8},{5,37,54,23}]`, sleep `[{12,32,40,8},{5,40,54,20}]`, climb `[{11,7,33,52}]`, held `[{18,3,28,58}]`. mirror면 `x' = 64 − x − w`. 소품(편지·느낌표·z·조종 표시)은 판정에 포함하지 않는다(§14-2 "펫 몸과 말풍선 위에서만").

- [ ] **Step 1: 실패하는 테스트** —
  - `petBox({x:960, y:1040}, 56)` → `{932, 989.25, 56, 56}`, 그 창 `petWindowRect(…, {0,0,1920,1080})` → `{800, 805, 320, 240}`; 바 꼭대기 `petBox({1892,292},56)` → `{1864, 241.25, 56, 56}`, 창 `{1600, 57, 320, 240}`; (Review Focus 3) 발 y 100 → 창 y 0, 발 x 28 → 창 x 0, 보조 모니터 `bounds {-1280,0,1280,1024}`의 펫 창이 그 bounds 안;
  - `hopRoom(56)` → 12; 바닥 펫에 말풍선 200×80 → `{ side: 'above', rect: {860, 889.25, 200, 80} }`; 꼭대기 y 120인 펫(상자 `{1864, 69.25, 56, 56}`, 창 `{1600, 0, 320, 240}`) → `{ side: 'left', rect: {1656, 57.25, 200, 80} }`; 같은 펫에 `menuSize(4)`(176×136) → `'left'`, x 1680, y 29.25; 왼쪽 바(창이 왼쪽 끝에 잘림) → `'right'`;
  - `hitShape('stand', {0,0,64,64}, false)`가 (32,40)·(32,20)을 포함하고 (4,4)·(60,58)은 포함하지 않음; 상자 `{100,100,32,32}`에서 (116,120) 포함; `hitShape('climb', {0,0,64,64}, true)` → `[{20,7,33,52}]`; `isOver`는 null을 건너뜀.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/shared/pet/pet-frame.test.ts` → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — PASS, `npm run typecheck`
- [ ] **Step 5: 커밋** — `feat: 펫 창 배치·말풍선 자리·클릭 판정 모양`

### Task 5: 펫 상태 기계

**Files:**
- Create: `desktop/src/main/pet/pet-controller.ts`
- Test: `desktop/src/main/pet/pet-controller.test.ts`

**Interfaces:**
- Consumes: Task 1~4, M5 `Timers`
- Produces:
  ```ts
  type PetMode = 'idle' | 'walk' | 'leap' | 'climb' | 'sit' | 'air' | 'held' | 'sleep'
  interface PetWindowPort { setBounds(r: Rect): void; showInactive(): void; hide(): void; send(v: PetView): void; setIgnoreMouse(ignore: boolean): void }
  interface PetController {
    start(): void; refresh(): void; worldChanged(): void; setFullscreen(on: boolean): void
    press(down: boolean): void
    status(): { mode: PetMode; foot: { x: number; y: number }; shown: boolean; window: Rect | null }
    view(): PetView | null
    dispose(): void
  }
  createPetController(d: {
    window: PetWindowPort
    world(size: number): PetWorld | null
    settings(): PetSettings
    masking(): MaskingMode
    systemReducedMotion(): boolean
    cursor(): { x: number; y: number }
    mouseButtonDown(): boolean | null
    idleSeconds(): number
    openPalette(): void
    timers: Timers; now(): number; random(): number
    log(event: string, data: Record<string, unknown>): void
  }): PetController
  ```
  `PET_LOOP = { frameMs: 34, hitNearMs: 34, hitFarMs: 100, hitSleepMs: 250, nearPad: 120 }`, `GESTURE = { dragThreshold: 4, clickMaxMs: 500, doubleMs: 500, releasePolls: 2 }`, `CLIMB_SPEED_RATIO = 0.75`, `STEP_UP_MS = 300`, `JUMP_DOWN = { vx: 240, vy: −520 }`, `LEAP_MIN_GAP = 0.5`(몸 크기 배율)

동작(각 줄을 테스트로 확인한다):
- 표시 조건: `settings().visible`, 전체 화면 아님, `world()`가 null 아님. 표시할 때 `showInactive`, 숨길 때 `setIgnoreMouse(true)` 다음 `hide`이고 숨긴 동안 타이머가 없다. 바뀔 때 `pet.visibility { visible, reason: 'setting' | 'fullscreen' | 'no-display' }`. 숨긴 동안의 `worldChanged`는 반영하지 않고 다시 표시할 때 새 세계로 한 번 확인한다(바와 함께 숨었다 돌아온 펫이 바에서 떨어지지 않게).
- 처음 표시하면 바닥 가운데(`(minX + maxX)/2`, floorY)에 `idle`로 서고 3초 뒤 첫 계획을 세운다. 다시 표시할 때는 상태를 이어 가고, 발이 새 세계 밖이면 바닥 가운데로 옮긴다.
- 동작 고리: walk·leap·climb·air·held와 꼭대기로 올라서는 300ms 동안만 34ms 간격 타이머를 돌린다. 매 프레임 `dt = (now − 이전)/1000`(최대 0.1). 창 사각형이 바뀌었을 때만 `setBounds`, 화면 값이 바뀌었을 때만 `send`. 움직이지 않는 모드로 들어가면 타이머를 멈춘다.
- walk: 목적지로 `WALK_SPEED[activity]`, facing은 가는 방향, 도착하면 `idle`(`pickMs(idleMs)`). 계획이 bar면 목적지는 `side.x`다. 도착한 뒤 `floorY − side.bottom > 0.5·size`면 `leap`(vy = `jumpVelocity(floorY − side.bottom)`, pose air·face up; `stepAir`를 사용하지 않고 세로 등가속만 계산해 정점에서 y = side.bottom으로 `climb`), 아니면 바로 `climb`. climb 속도는 걷기 × 0.75, pose climb·face up·facing은 `side.wall`. 발이 `side.top`에 닿으면 300ms 동안 `ledge.cx, ledge.y`로 옮긴 뒤 `sit`(pose sit·face content, `pickMs(sitMs)`). 쉼이 끝나면 바 반대쪽으로 `JUMP_DOWN`(오른쪽 바면 vx −240) `air`, 바닥에 서면 `idle`. `sinceBarMs`는 바에서 뛰어내린 시각부터 측정한다.
- 세계 변화(`worldChanged`): 앉아 있으면 발이 새 `ledge`를 따라간다(`setBounds` 한 번). climb·leap·sit 중 `side`나 `ledge`가 없어지면(바 끔·잠시 숨김·자동 숨김·자리 없음) 그 자리에서 속도 0 `air`. 발이 새 범위 밖이면 바닥 가운데 `idle`.
- 공중: Task 2 `stepAir`. `ledge`에 닿으면 `sit`, 바닥에 서면 `idle`(움직임 줄이기가 아니면 `cue: 'land'`).
- 몸짓: `press(true)` 뒤 커서가 4 DIP 넘게 움직이면 `held`(pose held·face surprised). 들린 동안 커서가 격자 (32, 4)에 오도록 발 = 커서 + (0, 54/64·size)로 두고 모니터 `bounds` 안·바닥(`floorY`) 위로 자르며, 프레임마다 커서 표본을 남긴다. `press(false)`면 `throwVelocity`로 `air`. 누른 지 500ms 안에 4 DIP 이내에서 떼면 클릭이다: 걷기를 멈추고 `cue: 'hop'`(cueSeq + 1, 창은 움직이지 않음). 앞 클릭과 500ms 안이면 대신 `openPalette()`를 한 번 호출한다. 들린 동안 `mouseButtonDown()`이 두 번 연속 false면 놓은 것으로 처리한다(null이면 `press(false)`만 기다린다).
- 클릭 통과: 시작 값은 `setIgnoreMouse(true)`. 동작 고리가 돌면 프레임마다, 아니면 조회 타이머(커서가 창 사각형 + 120 안이면 34ms, 밖이면 100ms, 졸 때 250ms)마다 `isOver(커서, [...hitShape, 말풍선, 메뉴])`를 확인하고 값이 바뀔 때만 `setIgnoreMouse(!over)`를 호출한다. 들린 동안은 false를 유지한다.
- 졸기: 표시·깸 뒤 `sleepAfterMin`분에 `idleSeconds()`를 한 번 확인하고, 모자라면 남은 시간 뒤 다시 확인한다(타이머 하나). 넘었고 idle·walk·sit이면 그 자리에서 `sleep`(pose sleep·face asleep·소품 zzz)이고, 조회 외 타이머가 없다. 커서가 몸 위에 오면 깬다(바닥이면 idle, 꼭대기면 sit).
- 선글라스: `masking() !== 'off'`면 모든 모습에 `sunglasses`. `refresh()`에서 설정·가명 처리 모드를 다시 읽는다(크기가 바뀌면 상자·창을 다시 계산).
- 움직임 줄이기 = `settings().reduceMotion || systemReducedMotion()`: 바닥에서 튀지 않고 `cue`를 만들지 않으며 `view.reduceMotion` true.
- 기록: `pet.show { display, scale, window }`, `pet.state { mode, box, window }`는 climb·sit·sleep·wake·held·land에서만(walk·idle은 기록하지 않음), `pet.click { kind: 'hop' | 'double' }`.

- [ ] **Step 1: 실패하는 테스트** — `vi.useFakeTimers()`, `now = Date.now`, Task 2의 주 모니터·오른쪽 띠 세계, 보통, `random`은 0.5(필요한 시험에서만 바꿈), 가짜 창은 호출을 기록한다:
  - `start()` → `showInactive` 1회, 첫 `setIgnoreMouse(true)`, 첫 `setBounds` `{800, 805, 320, 240}`, 첫 `send`의 pose stand·`box {132, 184.25}`;
  - (완료 기준) 60초 안에 `pet.state` mode가 climb → sit 순서이고 sit의 box가 `{1864, 241.25, 56, 56}`; 걷는 1초 동안 발 x가 60 ± 2 증가·facing right·`setBounds` 간격 ≥ 34ms(30fps 이하);
  - (성능) sit 동안 10초간 `setBounds`·`send` 0회, `vi.getTimerCount()` ≤ 3(쉼·졸기·조회); 커서가 멀면 1초에 `cursor()` 10회 이하, 가까우면 30회 이하;
  - 쉼이 끝나면 air → 바닥 `idle`, 이어 45초 전에는 bar 계획 없음(`random` 0.0 → idle);
  - (Review Focus 2) 앉은 채 바가 y 400으로 → 발 y 400·`setBounds` 1회; 바 없음 → air로 떨어져 바닥 `idle`; 오르는 중 `side` null → 떨어짐; 앉은 채 `setFullscreen(true)` → 바 없는 세계로 `worldChanged` → 바가 돌아온 세계 → `setFullscreen(false)` → 여전히 sit;
  - (Review Focus 3) 세계가 1280×720 모니터(작업 영역 높이 680)로 바뀌면 발이 바닥 가운데 `{640, 680}`;
  - 클릭: `press(true)` → 100ms → `press(false)` → `cue: 'hop'`·cueSeq 1·`pet.click hop`, 걷던 중이면 idle; 300ms 안 두 번째 클릭 → `openPalette` 1회·cueSeq 그대로; 600ms 뒤 두 번째 → 다시 hop;
  - 끌기: 커서 (960,1020)(몸 위)에서 `press(true)` → 다음 프레임 (960,1010) → held·`setIgnoreMouse(false)`·`pet.state held`·발 y 1040(바닥 아래로 내려가지 않음); 100ms 동안 (1060,950)으로 옮기고 `press(false)` → air, vx 1000 ± 50, vy −600 ± 50; 바닥에 서면 `pet.state land`·idle; (완료 기준) 커서 (1892, 200)에서 속도 0으로 놓으면 1초 안에 sit;
  - (Review Focus 4) held 중 `mouseButtonDown` false 두 번 → 놓음; null이면 `press(false)`까지 held;
  - (Review Focus 1) 놓은 뒤 커서가 몸 밖이면 마지막 `setIgnoreMouse`가 true; 숨김 → 다시 표시 뒤 첫 호출도 true;
  - 졸기: `idleSeconds` 0 → 3분에 한 번 확인; 100 → 80초 뒤 다시; 180 → sleep·look prop zzz·동작 고리 없음·1초에 `cursor()` 4회 이하; 커서가 몸 위 → `pet.state wake`·idle;
  - `setFullscreen(true)` → `hide`·타이머 0개 → false → `showInactive`, 발 위치 그대로;
  - `refresh()`: visible false → hide; 가명 처리 off → sunglasses 빠짐; size 72 → box 크기 72; reduceMotion true → 바닥에서 bounce 없음·cue land 없음.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/main/pet` → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — PASS, `npm run typecheck`
- [ ] **Step 5: 커밋** — `feat: 펫 상태 기계(걷기·오르기·앉기·잡아 던지기·졸기)`

### Task 6: 말랑 메이트 그림과 움직임

**Files:**
- Create: `desktop/src/renderer/src/pet/mallang-shapes.ts`, `character.tsx`, `draw-plan.ts`, `PetSprite.tsx`, `Pet.tsx`, `press.ts`, `pet.css`
- Modify: `desktop/src/renderer/src/App.tsx`(`#/pet`), `desktop/src/renderer/src/design/tokens.css`·`tokens.test.ts`(`--white: #FFFFFF`), `desktop/src/renderer/src/design/token-usage.test.ts`(`renderer/src/pet`의 `.tsx`·`.css` 포함), `desktop/src/shared/ipc-channels.ts`, `desktop/src/preload/index.ts`, `desktop/src/renderer/src/preview/fake-api.ts`·`scenes.tsx`
- Test: `desktop/src/renderer/src/pet/draw-plan.test.ts`, `mallang-shapes.test.ts`, `press.test.ts`, `tokens.test.ts`, `token-usage.test.ts`

**Interfaces:**
- Consumes: Task 4 `PetView`·`PetLook`·`PET_WINDOW`, Task 2 `petWorld`, M5 미리 보기·`Bar`
- Produces:
  - IPC 이름 `petGetView: 'pet:get-view'`(invoke), `petView: 'pet:view'`(main → 펫), `petPress: 'pet:press'`, `petContextMenu: 'pet:context-menu'`(send). `SureMateApi`에 `getPetView(): Promise<PetView | null>`, `onPetView(cb: (v: PetView) => void): () => void`, `petPress(down: boolean): void`, `petContextMenu(): void`. `FakeFixtures.petView`.
  - 그림 교체 자리(§14-3 캐릭터가 같은 모양을 구현한다):
    ```ts
    interface PetCharacter {
      id: string
      /** 몸 레이어(64 격자, 바닥선 y=58). 자세만 받고 상태 기계를 모른다 */
      Body(p: { pose: PetPose }): React.JSX.Element
      /** 얼굴 레이어(눈·입·눈썹·볼·선글라스) 위치: 서 있는 얼굴 기준 이동·배율 */
      face(pose: PetPose): { dx: number; dy: number; scale: number }
    }
    export const MALLANG: PetCharacter
    ```
  - `MALLANG_BODY: Record<PetPose, string>`, `MALLANG_FACE: Record<PetPose, { dx: number; dy: number; scale: number }>`
  - `drawPlan(look: PetLook, o: { reduceMotion: boolean }): DrawPlan`, `DrawPlan = { pose: PetPose; eyes: 'dot' | 'arc' | 'ring' | 'line' | 'hidden'; mouth: 'smile' | 'small' | 'open' | 'frown' | 'o' | 'none'; brows: boolean; cheeks: boolean; blink: boolean; props: PetProp[]; floatProps: boolean; motion: 'breathe' | 'walk' | 'sway' | 'none'; cue: 'hop' | 'land' | null; mirror: boolean }`
  - `PetSprite(p: { look: PetLook; size: PetSize; reduceMotion: boolean; character?: PetCharacter })`(기본 `MALLANG`)
  - `createPressTracker(send: (down: boolean) => void): { down(): void; up(): void; cancel(): void; blur(): void }`(눌린 상태일 때만 `send(false)` 한 번)

그림(시안 원본, 64 격자):
- 몸: stand·walk·air `M8 52 C8 30 18 16 32 16 C46 16 56 30 56 52 C56 57 50 58 32 58 C14 58 8 57 8 52 Z`, climb `M18 8 C30 8 40 14 42 32 C44 50 34 58 22 58 C14 58 12 52 12 32 C12 14 12 8 18 8 Z`(벽이 오른쪽, 외곽선 포함 x 44가 바 면 = Task 2 `CLIMB_OFFSET`), sit `M6 54 C6 38 18 30 32 30 C46 30 58 38 58 54 C58 58 50 59 32 59 C14 59 6 58 6 54 Z`, sleep `M6 54 C6 40 18 33 32 33 C46 33 58 40 58 54 C58 58 50 59 32 59 C14 59 6 58 6 54 Z`, held `M32 4 C38 4 42 12 44 26 C47 44 44 60 32 60 C20 60 17 44 20 26 C22 12 26 4 32 4 Z`. 하이라이트(타원 (21,27) 6×3.4, −28°, 흰색 55%)는 stand·walk·air만 그린다.
- 얼굴은 서 있는 얼굴 좌표 하나로 정의한다(시안의 가만히·복사·선글라스·경고 칸). 눈 dot (26,38)·(38,38) 2.6×3.6, arc `M22 38 Q25 35 28 38 M36 38 Q39 35 42 38`, ring 흰 타원 3×4 + 눈동자 r1.4, line `M22 38 h6 M36 38 h6`; 입 smile `M28 45 Q32 48.5 36 45`, small `M29 44 Q32 46.5 35 44`, open `M27 44 Q32 50 37 44 Z`, frown `M28 48 Q32 45 36 48`, o 타원 2.6×3.2; 눈썹 `M21 31 L28 33 M43 31 L36 33`; 볼 (20,45)·(44,45) r2.8; 선글라스 사각형 (19,33)·(33,33) 12×8 둥글기 4, 다리 `M31 36 h2`, 반짝임 `M22 35 h4` 흰색 70%. 자세별 위치 `MALLANG_FACE`(얼굴 가운데 (32,38) 기준): stand·walk·air `{0,0,1}`, sit `{0,6,1}`, sleep `{0,8,1}`, climb `{−7,−18,0.85}`, held `{0,−4,0.85}`. 시안의 앉기·졸기·오르기·들림 얼굴 위치에 맞춘 값이고 디자인 단계에서 캡처와 비교해 조정한다. 이 방식으로 모든 표정이 모든 자세에 붙는다(예: 꼭대기에서 경고).
- 소품(상자 좌표): 편지 (40,0) 20×14 둥글기 2 흰색 + `M40.5 1 L50 8 L59.5 1`, 느낌표 원 (52,10) r8 `--warn` + `M52 5.5 v5.5` + 점 (52,14.3) r1.4, z 두 개 (44,26) 크기 11·(51,17) 크기 8 `--mist` 굵기 600, 조종 표시는 머리 위 격자 y −14~−2 안(모양은 디자인 단계에서 결정, `--brand`·`--ink`만).
- 색: 외곽선·눈·입 `var(--ink)`, 몸 `var(--brand)`, 볼 `var(--cheek)` 80%, 흰색 `var(--white)`. 외곽선 굵기 격자 3, 얼굴 선 2.2~2.4(시안).

`drawPlan` 규칙: face → (eyes, mouth, 눈썹, 볼) normal (dot, smile, –, 볼), happy (arc, open, –, 볼), worried (dot, frown, 눈썹, –), surprised (ring, o, –, –), content (arc, small, –, 볼), asleep (line, none, –, –), up (dot, small, –, –). 소품에 sunglasses가 있으면 eyes `'hidden'`·blink false. motion: stand·sit → breathe, walk → walk, held → sway, climb·air·sleep → none. blink: stand·walk·sit·climb. floatProps: sleep이 아니고 움직임 줄이기가 아님(졸 때 z는 멈춤, §14-2 "졸 때는 애니메이션도 멈춘다"). 움직임 줄이기 → motion none·cue null·blink false. mirror = facing `'left'`. props 순서 sunglasses → envelope → alert → zzz → control.

`pet.css` 키프레임(시안 값): `pet-breathe` 2.4s ease-in-out infinite 50% `scale(1.03, 0.97)`; `pet-walk` 0.9s ease-in-out infinite 0%·100% `translateY(0) scale(1.08,0.9)` 40% `translateY(-14px) scale(0.94,1.08)` 70% `translateY(-4px) scale(1,1)`; `pet-blink` 4s infinite 0%·92%·100% `scaleY(1)` 95% `scaleY(0.1)`; `pet-sway` 1.6s ease-in-out infinite ±6°(기준점 위 가운데 (32,4)); `pet-float` 2s ease-in-out infinite 50% `translateY(-6px)`·투명도 0.6. 한 번만 도는 `pet-hop`(클릭·복사·되돌리기)과 `pet-land`(1.08×0.9 → 1)의 길이·곡선은 디자인 단계에서 정한다. 몸 그룹 기준점은 바닥선 (32, 58), `transform-box: view-box`. `transform`·`opacity`만 사용하고, 반복 움직임이 있을 때만 `will-change: transform`. `[data-reduce-motion]` 아래에서는 animation·transition을 모두 끈다(Windows 설정은 tailwind.css의 기존 `prefers-reduced-motion` 규칙이 처리).

`Pet.tsx`(`#/pet`): 루트는 `PET_WINDOW` 크기의 투명 상자다. `getPetView()`로 시작하고 `onPetView`로 갱신한다. `view.box` 위치에 `PetSprite`를 그린다(SVG `overflow: visible`). 펫 상자에서 왼쪽 `pointerdown` → `setPointerCapture` → `createPressTracker`의 `down()`; `pointerup` → `up()`; `pointercancel`·`lostpointercapture` → `cancel()`; `window` blur → `blur()`. `contextmenu` → 기본 메뉴 차단 + `petContextMenu()`. `cueSeq`가 바뀌면 한 번 도는 애니메이션을 다시 시작한다(React key).

- [ ] **Step 1: 디자인 방향** — 사용할 수 있는 스킬 목록을 확인하고(없으면 사용자에게 알림) `impeccable` delight와 animate, 이어서 `emil-design-eng`를 호출한다. 입력: §14-2 모습 표, 시안, 위 그림·키프레임 값, `drawPlan` 규칙. 정할 것: hop·land 길이와 곡선(0.5초 이하), 선글라스 쓰기·벗기 전환(위에서 내려오기 200ms ease-out, `--dur-open`), 조종 표시 모양, 자세별 얼굴 위치(`MALLANG_FACE`) 조정. §14-2 숫자(2.4s, 1.03·0.97, 4s, 0.9s, 1.08×0.9, 0.94×1.08, ±6°)는 바꾸지 않는다. `impeccable`의 live·generate 기능은 사용하지 않는다. 정한 값은 Task 11 decisions.md 기록용으로 작업 보고에 남긴다.
- [ ] **Step 2: 실패하는 테스트** — `drawPlan`: `{pose:'stand', face:'normal', props:[]}` → eyes dot·mouth smile·cheeks·blink·motion breathe·mirror false; sunglasses 추가 → eyes hidden·blink false·mouth smile 유지; walk·facing left → motion walk·mirror true; sleep·asleep·[zzz] → motion none·blink false·floatProps false·eyes line; held·surprised → motion sway·eyes ring; happy·[envelope]·cue hop → eyes arc·mouth open·floatProps true·cue hop; worried → brows; 움직임 줄이기 → motion none·cue null·blink false. `mallang-shapes`: stand 경로가 시안 문자열과 같음, 모든 자세 경로의 숫자가 0~64 안, `MALLANG_FACE.sit` `{0,6,1}`·`climb` `{−7,−18,0.85}`. (Review Focus 4) `createPressTracker`: `down()` → `send(true)`, `up()` → `send(false)`, 그 뒤 `cancel()`·`blur()` → 추가 없음, `down()` 뒤 `blur()` → `send(false)` 한 번. `tokens.test.ts`에 `--white` `#FFFFFF`. `token-usage.test.ts`가 `renderer/src/pet`의 `.tsx`·`.css`도 검사.
- [ ] **Step 3: 실패 확인** — `npx vitest run src/renderer/src/pet src/renderer/src/design` → FAIL
- [ ] **Step 4: 구현** — 미리 보기 장면 `pet-stand`, `pet-walk`, `pet-climb`, `pet-climb-left`(왼쪽 바), `pet-sit-edge`, `pet-sit-capsule`, `pet-sleep`, `pet-held`, `pet-sunglasses`, `pet-sunglasses-sit`, `pet-size-40`, `pet-size-72`, `pet-reduced`를 추가한다. 장면은 640×600 `<Desktop>`(작업 영역 `{0,0,640,574}`) 위에 M5 바 장면처럼 `barRect`로 바를 놓고, `petWorld`·`petBox`·`petWindowRect`로 계산한 자리에 펫 창 내용을 놓는다(바 꼭대기에 앉는 위치를 계산으로 확인).
- [ ] **Step 5: 통과·화면 확인** — PASS, `npm run typecheck`; `bash scripts/preview/shoot.sh <스크래치 폴더>/pet <위 장면 id…>` → 장면마다 1·1.25·1.5배 PNG(가상 시간 3초 시점이라 매번 같음). M5와 같은 방법으로 시안을 캡처해 모습마다 비교한다: 외곽선이 1.25·1.5배에서 흐리지 않음, 앉은 펫의 바닥선이 바 꼭대기와 1 DIP 안에서 맞음, 오르는 펫이 바 면에 붙음, 왼쪽 바에서 좌우가 뒤집힘, 선글라스가 앉기·오르기 얼굴 위치를 따라감.
- [ ] **Step 6: 점검** — 1·1.25·1.5배 캡처 전체에 `design:design-critique`를 실행하고 `impeccable` audit로 움직임 값을 점검한다. 지적을 고친 뒤 다시 캡처한다.
- [ ] **Step 7: 커밋** — `feat: 말랑 메이트 그림과 움직임`

### Task 7: 앱 반응과 말풍선

**Files:**
- Create: `desktop/src/shared/app-events.ts`, `desktop/src/main/app-events.ts`, `desktop/src/shared/pet/pet-reactions.ts`, `desktop/src/shared/pet/pet-copy.ts`, `desktop/src/renderer/src/pet/PetBubble.tsx`, `desktop/src/renderer/src/pet/bubble-box.ts`
- Modify: `desktop/src/main/prompts/prompt-session.ts`·`prompt-runtime.ts`, `desktop/src/main/masking/masking-commands.ts`·`masking-commands-runtime.ts`, `desktop/src/main/glossary/wiki-card.ts`, `desktop/src/main/index.ts`(위키 카드 `emit`), `desktop/src/main/pet/pet-controller.ts`, `desktop/src/renderer/src/pet/Pet.tsx`, `desktop/src/renderer/src/assets/tailwind.css`(`--color-bubble: var(--white)`), `desktop/src/shared/ipc-channels.ts`, `desktop/src/preload/index.ts`, `preview/fake-api.ts`·`scenes.tsx`
- Test: `desktop/src/shared/pet/pet-reactions.test.ts`, `pet-copy.test.ts`, `desktop/src/main/app-events.test.ts`, `desktop/src/renderer/src/pet/bubble-box.test.ts`, `prompt-session.test.ts`, `masking-commands.test.ts`, `wiki-card.test.ts`, `pet-controller.test.ts`

**Interfaces:**
- Consumes: Task 4·5, `CAPTURE_NOTES`(`shared/labels.ts`), `MaskCategory`·`ALL_CATEGORIES`, M5 T9 `runFromBar`·T12 `createWikiCard`
- Produces:
  ```ts
  type AppEvent =
    | { type: 'prompt-copied'; masking: MaskingMode; masked: { category: MaskCategory; count: number }[]; target: string | null }
    | { type: 'unmasked'; restored: number }
    | { type: 'capture-failed'; reason: CaptureSkipReason | 'nothing-selected' }
  createAppEvents(log: (event: string, data: Record<string, unknown>) => void): { emit(e: AppEvent): void; on(cb: (e: AppEvent) => void): () => void }
  appEvents   // main/app-events.ts의 앱 전체 통로 하나
  interface PetReaction { kind: 'celebrate' | 'warn' | 'hop' | 'note'; face: PetFace; props: PetProp[]; cue: 'hop' | null; bubble: string | null; holdMs: number }
  reactionFor(e: AppEvent, o: { reactions: boolean; bubbles: boolean }): PetReaction | null
  petBubbleText(e: AppEvent): string | null
  PET_CATEGORY_NOUNS: Record<MaskCategory, string>
  BUBBLE_MS = 4000
  bubbleRect(o: { slot: Rect; side: SlotSide; measured: { width: number; height: number } }): Rect
  ```
  `PromptSessionDeps`·`MaskingCommandDeps`·`createWikiCard` deps에 `emit(e: AppEvent): void`. `PetController`에 `react(e: AppEvent): void`, `bubbleClick(): void`, `bubbleRect(r: Rect | null): void`(창 좌표). IPC `petBubbleClick: 'pet:bubble-click'`, `petBubbleRect: 'pet:bubble-rect'`(send), `SureMateApi`에 `petBubbleClick(): void`, `petBubbleRect(r: Rect | null): void`.

앱 일을 내보내는 곳(§14-2 "앱과 연결" 표). 가명 처리 모드 변경은 앱 일이 아니고 설정에서 선글라스로 반영한다(Task 5).
- 프롬프트 실행(`run`과 M5 `runFromBar`의 같은 실행 경로): `writeClipboard`가 끝난 직후, AI 대상을 열기 전에 `prompt-copied`(masked는 켜진 항목의 분류별 건수 합, 0건 제외, `ALL_CATEGORIES` 순서; target은 열 AI 이름, 복사만이면 null). 완료 기준 "1초 안에"를 브라우저 열기 시간과 무관하게 충족한다.
- 가져오기 실패: `prepare`·`runFromBar`의 확인 화면 경로, `maskSelection`, 위키 카드의 note 경로에서 이유가 `busy`가 아니면 `capture-failed`(공백만 가져온 경우는 `nothing-selected`).
- 되돌리기: `unmask`가 되돌린 글을 클립보드에 쓴 뒤 `unmasked`(0건이면 내보내지 않음).
- `createAppEvents`는 받는 쪽이 예외를 내도 나머지에 계속 전달하고 `app.events.listenerError { type }`만 기록한다.

반응(`reactionFor`, 반응 끔 → null). holdMs는 말풍선이 있으면 4,000, 없으면 1,500이다. 말풍선 끔에서 note는 null(표시할 내용 없음).

| 앱 일 | kind | face · props · cue | 말풍선 |
|---|---|---|---|
| prompt-copied, 가명 처리 켬 | celebrate | happy · [envelope] · hop | `petBubbleText` |
| prompt-copied, 끔 | warn | worried · [alert] · 없음 | "가명 처리가 꺼져 있어요. 이름이 그대로 들어갔어요." |
| unmasked | hop | happy · [] · hop | "원래 이름으로 되돌렸어요." |
| capture-failed | note | normal · [] · 없음 | `CAPTURE_NOTES[reason]` + "." |

말풍선 문구 초안(다음 단계에서 다듬는다): 복사 축하 = "복사했어요. {분류 목록}은 가명으로 바꿨어요. {AI 이름} 창에 붙여넣어 주세요." 분류 목록은 건수가 많은 순(같으면 `ALL_CATEGORIES` 순) 두 개까지 `고객사명 1건·IP 2건`, 더 있으면 ` 외 {나머지 건수 합}건`. 가린 것이 없으면 가운데 문장을 빼고, 복사만이면 끝 문장이 "붙여넣을 곳에 붙여넣어 주세요."다. `PET_CATEGORY_NOUNS` 초안: 고객사명, 프로젝트명, 사람 이름, 시스템명, IP, 경로, 이메일, 전화번호, 사내 주소. 설계 예시("복사했어요. 고객사명 1건은 가명으로 바꿨어요. Claude 창에 붙여넣어 주세요.")와 경고·되돌리기 문구는 설계 원문이다.

컨트롤러 반응:
- 숨김(설정·전체 화면)이면 무시한다(§14-2 "숨겨 둔 동안에는 반응하지 않는다").
- 졸고 있으면 깬 뒤 반응한다. walk는 멈추고(idle), climb는 holdMs 동안 멈췄다 이어 간다. held·air·leap이면 마지막 반응 하나만 저장했다가 바닥이나 꼭대기에 선 뒤 적용한다.
- 반응 동안 look의 face·props·cue를 덮어쓰고(pose 유지, 선글라스 유지), `view.bubble`에 `{ seq, text, side, slot }`(`placeSlot`, 크기 200×96, `hop = hopRoom(size)`)을 설정한다. `send`는 `react()` 안에서 바로 호출한다. holdMs 뒤 반응을 지우고 새 계획을 세운다. 새 반응은 이전 반응을 대체하고(seq + 1) 타이머를 다시 시작한다.
- `bubbleClick()`은 말풍선을 닫고 반응을 종료한다. `bubbleRect(r)`은 판정 대상에 말풍선 사각형(창 → 화면 좌표)을 추가하고, null이면 제외한다.
- 기록 `pet.react { kind, bubble: boolean }`(문구 없음).

`PetBubble.tsx`: `bg-bubble`(흰색) 바탕, `--ink` 글자 13(`--fs-small`), 모서리 8, 최대 너비 200, 펫 쪽 꼬리, `role="status"`. `useLayoutEffect`로 크기를 측정해 `bubbleRect`로 배치하고 `petBubbleRect(창 좌표)`를 보낸다. 사라지면 `petBubbleRect(null)`. 누르면 `petBubbleClick()`. `bubbleRect` 배치: above는 자리 아래 가운데, left는 자리 오른쪽·세로 가운데, right는 자리 왼쪽·세로 가운데.

- [ ] **Step 1: 디자인 방향** — `design:ux-copy`(없으면 `impeccable` clarify)로 말풍선 문구와 분류 이름을 다듬는다. 기준: §20 존댓말·짧게, 너비 200에 4줄 이하, 건수·분류·AI 이름은 실제 값, 설계 원문 세 문장은 유지(바꾸려면 사용자에게 확인). `impeccable` delight로 복사 축하·경고 순간을, `emil-design-eng`로 말풍선 등장(펫 쪽에서 200ms ease-out, 닫을 때 움직임 없음)을 정한다. 문구를 바꾸면 Step 2의 기대값도 고친다.
- [ ] **Step 2: 실패하는 테스트** —
  - `petBubbleText`: `{ prompt-copied, restore, [{client,1}], 'Claude' }` → 설계 예시 문장과 정확히 같음; `[{client,2},{ip,2},{path,3},{email,1}]` → "경로 3건·고객사명 2건 외 3건은 가명으로 바꿨어요"를 포함; masked [] → 가운데 문장 없음; target null → "붙여넣을 곳에 붙여넣어 주세요."로 끝남; 끔 → 경고 원문; unmasked 3 → "원래 이름으로 되돌렸어요."; `capture-failed terminal` → "터미널에서는 가져오지 않아요."
  - `reactionFor`: 표의 네 줄; 말풍선 끔 → holdMs 1500·bubble null, note는 null; 반응 끔 → 모두 null
  - `createAppEvents`: `on` 두 개가 모두 받음, 첫째가 예외를 내도 둘째가 받음, 해제 뒤 받지 않음
  - prompt-session: `run`에서 `emit`이 `writeClipboard` 뒤·`openUrl` 앞에 한 번(`masking: 'restore'`, `masked: [{ category: 'client', count: 1 }]`, `target: 'Claude'`); 복사만 대상 → target null; 끈 항목은 masked에서 빠짐; `prepare`에서 skipped `terminal` → `capture-failed terminal`, `busy` → 없음, 공백만 → `nothing-selected`; `runFromBar` 선택 없음 → `capture-failed`
  - masking-commands: `unmask` 2건 → `unmasked 2`, 0건 → 없음; `maskSelection` 선택 없음 → `capture-failed nothing-selected`
  - wiki-card: terminal note → `capture-failed terminal`, busy → 없음
  - controller: 걷는 중 `react(prompt-copied)` → 같은 호출 안에서 `send`(bubble 문구·envelope·cue hop), mode idle, 4초 뒤 bubble null; (Review Focus 5) 1초에 10번 → 마지막 문구 하나·bubble.seq 10·말풍선 타이머 하나; 숨김·전체 화면 중 → `send` 없음; held 중 두 번 → 놓아서 바닥에 선 뒤 마지막 것 하나; 졸 때 → 깨고 반응; `bubbleClick` → 즉시 bubble null; (Review Focus 1) 말풍선이 닫히고 커서가 몸 밖이면 마지막 `setIgnoreMouse` true; 가명 처리 모드 변경(`refresh`)은 말풍선 없이 sunglasses만 바뀜
  - `bubbleRect`: above 자리 `{0,0,200,96}`·측정 120×40 → `{40, 56, 120, 40}`; left → `{80, 28, 120, 40}`; right → `{0, 28, 120, 40}`
- [ ] **Step 3: 실패 확인** — `npx vitest run src/shared/pet src/main/app-events.test.ts src/main/prompts src/main/masking src/main/glossary src/main/pet src/renderer/src/pet` → FAIL
- [ ] **Step 4: 구현** — 런타임(`prompt-runtime.ts`·`masking-commands-runtime.ts`·index.ts의 위키 카드)은 `emit: appEvents.emit`을 넘긴다. 미리 보기 장면 `pet-celebrate`, `pet-celebrate-copy-only`, `pet-celebrate-sunglasses`, `pet-warn`, `pet-unmask`, `pet-note`, `pet-bubble-side`(꼭대기가 화면 위쪽 → 말풍선 옆)를 추가한다.
- [ ] **Step 5: 통과·화면 확인** — PASS(기존 prompt·masking·wiki 시험 포함), `npm run typecheck`; 캡처(1·1.25·1.5)에서 4줄 문구가 너비 200 안에서 잘리지 않음, 꼬리가 펫을 가리킴, 옆 말풍선이 화면 밖으로 나가지 않음, 편지·느낌표가 말풍선과 겹치지 않음.
- [ ] **Step 6: 점검** — `design:design-critique`, `design:accessibility-review`(흰 바탕 `--ink` 글자 대비, 13px 가독성) → 고친 뒤 다시 캡처.
- [ ] **Step 7: 커밋** — `feat: 말랑 메이트 앱 반응과 말풍선`

### Task 8: 오른쪽 클릭 메뉴와 조종 모드

**Files:**
- Create: `desktop/src/renderer/src/pet/PetMenu.tsx`, `desktop/src/renderer/src/pet/pet-keys.ts`
- Modify: `desktop/src/shared/pet/pet-view.ts`(`PetKey`), `desktop/src/shared/pet/pet-copy.ts`(`petMenuRows`), `desktop/src/main/pet/pet-controller.ts`, `desktop/src/renderer/src/pet/Pet.tsx`, `desktop/src/shared/ipc-channels.ts`, `desktop/src/preload/index.ts`, `preview/fake-api.ts`·`scenes.tsx`
- Test: `pet-controller.test.ts`, `pet-copy.test.ts`, `desktop/src/renderer/src/pet/pet-keys.test.ts`

**Interfaces:**
- Consumes: M5 T7 `FLYOUT_TIMING`(`dismissPollMs` 50, `menuAwayMs` 1500), Task 2 `jumpVelocity`, Task 4 `menuSize`·`placeSlot`
- Produces: `PetKey = 'left' | 'right' | 'up' | 'down' | 'jump' | 'end'`, `keyFromCode(code: string): PetKey | null`, `petMenuRows(o: { sleeping: boolean }): PetMenuRow[]`, `PetWindowPort`에 `setFocusable(f: boolean): void`·`focus(): void`, controller deps에 `foreground(): string | null`·`restoreFocus(hwnd: string): boolean`·`setVisible(v: boolean): Promise<void>`·`openSettings(): void`, `PetController`에 `contextMenu(): void`·`menuAction(a: PetMenuAction): void`·`startControl(): void`·`endControl(reason: 'esc' | 'blur' | 'toggle'): void`·`toggleControl(): void`·`key(k: PetKey, down: boolean): void`·`controlling(): boolean`. IPC `petMenu: 'pet:menu'`, `petKey: 'pet:key'`(send), `SureMateApi`에 `petMenu(a: PetMenuAction): void`·`petKey(k: PetKey, down: boolean): void`. `CONTROL = { nearBar: 24 }`

메뉴(§14-2 "오른쪽 클릭 메뉴: 조종하기, 재우기, 숨기기, 펫 설정"). M5 바 메뉴와 같이 Windows 메뉴 대신 직접 그린다(포커스를 받지 않고 토큰 디자인 유지). 펫 창 안에 그려 펫 옆에 붙는다.
- `contextMenu()`는 메뉴를 열고 닫는다. 여는 동안 걷기를 멈추고 계획·졸기를 미룬다. 자리는 `placeSlot(menuSize(4))`.
- 닫기: 행 선택, 다시 오른쪽 클릭, 메뉴가 열린 동안 50ms마다 확인해 `mouseButtonDown()`이 true이고 커서가 펫·메뉴 밖, 커서가 1.5초 동안 펫·메뉴 밖(`mouseButtonDown`이 null이어도 동작). M5 펼침 메뉴와 같은 규칙이다.
- 행 초안(다음 단계에서 다듬음): "조종하기"(설명 "←→ 걷기 · Space 뛰기 · Esc 끝"), "재우기"(졸면 "깨우기"), "숨기기"(설명 "바의 펫 단추로 다시 불러요"), "펫 설정".
- 동작: control → `startControl()`; sleep → `sleep`(커서가 몸 밖으로 한 번 나간 뒤부터 다시 올리면 깸); wake → idle(꼭대기면 sit); hide → `setVisible(false)`(컨트롤러는 바로 숨기고 런타임이 저장); settings → `openSettings()`. 기록 `pet.menu { action }`.

조종 모드(§14-2 "펫 창이 키보드를 받는다. ←→ 걷기, Space 뛰기, 바 옆에서 ↑ 오르기·↓ 내려오기, Esc 끝(원래 창으로 포커스 복귀). 조종 중에는 펫 머리 위에 작은 표시"):
- `startControl()`: `foreground()`를 기억하고 `setFocusable(true)` → `focus()`. `view.controlling` true, 소품 `control`, 메뉴 닫기, 계획·졸기 정지. `pet.control { phase: 'start' }`.
- ←/→를 누르는 동안 `WALK_SPEED`로 걷는다(facing). 바 꼭대기에서도 걷고, `ledge.x1 − size/4 … x2 + size/4`를 벗어나면 `air`로 떨어진다. Space: 땅에 있으면 `jumpVelocity(size)`로 뛰고 걷던 vx를 유지한다(56이면 vy ≈ −473). ↑: 바닥에서 발이 `side.x`와 24 DIP 안이면 오르기 시작(틈이 크면 leap 먼저), 누르는 동안 오르고 떼면 붙어 멈춘다. 꼭대기에 닿으면 sit. ↓: 오르는 중이면 내려가고 `side.bottom` 아래로 가면 떨어진다. 꼭대기에서 ↓는 옆면 위쪽으로 돌아가 내려간다.
- `endControl('esc' | 'toggle')`: `setFocusable(false)`, 기억한 창이 있으면 `restoreFocus` 한 번, controlling false, 새 계획. `'blur'`(다른 창을 누름)는 포커스를 되돌리지 않는다. 조종 중이 아니면 `key`는 무시한다. `pet.control { phase: 'end', reason }`.
- 렌더러: `view.controlling`일 때만 `keydown`·`keyup` → `keyFromCode(e.code)`(한/영 상태와 무관하게 `e.code`, ArrowLeft·ArrowRight·ArrowUp·ArrowDown·Space·Escape만) → `petKey`. `e.repeat`인 keydown은 무시하고 해당 키는 `preventDefault`.

- [ ] **Step 1: 디자인 방향** — `impeccable` shape로 메뉴를 M5 펼침 메뉴와 같은 가족으로 정한다(`--surface-flyout`, 모서리 8, `--shadow-flyout`, 행 32, 행은 `<button tabIndex={-1}>`). `design:ux-copy`로 행 문구·조종 안내를 다듬고, `emil-design-eng`로 메뉴 등장(M5 메뉴와 같은 200ms)과 조종 표시를 확인한다.
- [ ] **Step 2: 실패하는 테스트** —
  - `keyFromCode`: 6개 코드 대응, `'KeyA'`·`''` → null; `petMenuRows({ sleeping: true })` → 4행, 두 번째 행 action `'wake'`
  - 메뉴: `contextMenu()` → `view.menu` 4행·mode idle(걷던 중이면 멈춤)·동작 고리 없음 → 다시 → null; 열린 동안 `mouseButtonDown` true·커서 바깥 → 50ms 안 닫힘; null·커서 바깥 1,500ms → 닫힘; 커서가 메뉴 위면 유지; (Review Focus 1) 닫힌 뒤 커서가 몸 밖이면 마지막 `setIgnoreMouse` true
  - 동작: sleep → mode sleep, 커서가 몸 위에 그대로면 깨지 않음, 나갔다 들어오면 깸; hide → `setVisible(false)`·`hide`; settings → `openSettings`
  - 조종: `startControl()` → `setFocusable(true)` 다음 `focus()`, controlling true, props에 control; `key('right', true)` 1초 → 발 x + 60 ± 2·facing right, 뗌 → 멈춤; `key('jump', true)` → air·vy −473 ± 1 → 바닥; 바 옆 24 안에서 `up` 누름 → leap·climb, 누르고 있으면 sit까지, 꼭대기에서 `down` → 내려감; 꼭대기에서 →로 끝을 넘으면 air; `key('end', true)` → `setFocusable(false)`·`restoreFocus(기억한 창)` 1회·controlling false; `endControl('blur')` → `restoreFocus` 없음; 종료 뒤 `key` 무시; `foreground()` null이면 `restoreFocus` 없음; (Review Focus 1) 종료 뒤 커서가 몸 밖이면 마지막 `setIgnoreMouse` true
- [ ] **Step 3: 실패 확인** — `npx vitest run src/main/pet src/shared/pet src/renderer/src/pet` → FAIL
- [ ] **Step 4: 구현** — 미리 보기 장면 `pet-menu`, `pet-menu-sleeping`, `pet-menu-side`(꼭대기가 화면 위쪽), `pet-control`을 추가한다.
- [ ] **Step 5: 통과·화면 확인** — PASS, `npm run typecheck`; 캡처(1·1.25·1.5)에서 메뉴가 M5 바 메뉴와 같은 가족으로 보이고, 그림자(`--shadow-flyout`)가 창 가장자리에서 잘리지 않으며(잘리면 `SLOT.margin`을 늘림), 조종 표시가 머리 위에 보임.
- [ ] **Step 6: 점검** — `design:design-critique`, `design:accessibility-review` → 고친 뒤 다시 캡처.
- [ ] **Step 7: 커밋** — `feat: 말랑 메이트 오른쪽 클릭 메뉴와 조종 모드`

### Task 9: 펫 창을 앱에 연결

**Files:**
- Create: `desktop/src/main/windows/pet-window.ts`, `desktop/src/main/pet/pet-runtime.ts`, `desktop/src/shared/pet/pet-ipc.ts`
- Modify: `desktop/src/main/windows/overlay-window.ts`(`petWindowOptions`, `loadRoute`의 hash에 `'/pet'`), `desktop/src/main/bar/bar-runtime.ts`, `desktop/src/main/ipc.ts`, `desktop/src/main/index.ts`
- Test: `desktop/src/shared/pet/pet-ipc.test.ts`, `desktop/src/main/windows/overlay-window.test.ts`

**Interfaces:**
- Consumes: M5 `overlayWindowOptions`·`loadRoute`·`createBarRuntime`·`createTopmostKeeper`·`raiseTopmost`·`mouseButtonDown`·`pickBarDisplay`·`DISPLAY_SETTLE_MS`·`applySettings`·`openSettings`·`realTimers`, M1 `getMonitors`·`getForegroundWindow`·`setForeground`, Task 5·7·8
- Produces:
  - `petWindowOptions(preload: string): BrowserWindowConstructorOptions` = `overlayWindowOptions(preload)` + `width: 320, height: 240` + `webPreferences.backgroundThrottling: true`(숨긴 펫은 그리지 않는다. 펼침 창과 달리 숨긴 동안 측정할 것이 없다)
  - `createPetWindow(): { win: BrowserWindow; port: PetWindowPort; hwnd: string }`
  - `createPetRuntime(o: { bar: { bar: BarController; fullscreen(): boolean } | null; getSettings(): Settings; openPalette(): void; openSettings(): Promise<void>; setPetVisible(v: boolean): Promise<void>; log(event: string, data: Record<string, unknown>): void }): { controller: PetController; refresh(): void; worldChanged(): void; setFullscreen(on: boolean): void; raise(): void; dispose(): void }`
  - `createBarRuntime` 옵션 `onFullscreen(on: boolean): void`, `afterRaise(): void`, `onBarChange(): void`, 반환값에 `fullscreen(): boolean`
  - `parsePetBool(v: unknown): boolean | null`, `parsePetMenuAction(v: unknown): PetMenuAction | null`, `parsePetKey(k: unknown, down: unknown): { key: PetKey; down: boolean } | null`, `parsePetRect(v: unknown): Rect | null | undefined`(null = 없음, undefined = 잘못된 값)

창(`pet-window.ts`): 만든 뒤 `setIgnoreMouseEvents(true)`(forward 없음), `setAlwaysOnTop(true, 'screen-saver')`, `loadRoute(win, '/pet')`. 포트: `setBounds`는 정수 DIP 사각형이고, 처음 표시와 모니터 변화 뒤에만 `getBounds()` 크기를 확인해 2 DIP 넘게 다르면 한 번 더 놓는다(electron#27651, 매 프레임에는 확인하지 않음). `setIgnoreMouse` → `win.setIgnoreMouseEvents(ignore)`, `setFocusable` → `win.setFocusable(f)`, `focus` → `win.focus()`, `send` → `webContents.send(IPC.petView, v)`.

런타임(`pet-runtime.ts`):
- `world(size)`: `pickBarDisplay(getMonitors(), settings.bar.monitor)`의 모니터. 바는 `bar.visible()`이고 `!bar.state().collapsed`일 때 `anchor(null)`의 `{ rect: bar, edge }`이고, 그 밖에는 null(자동 숨김으로 들어간 바는 없는 것으로 처리).
- `cursor` → `screen.getCursorScreenPoint()`, `mouseButtonDown` → M5 native, `idleSeconds` → `powerMonitor.getSystemIdleTime()`, `systemReducedMotion` → `systemPreferences.getAnimationSettings().prefersReducedMotion`, `foreground`·`restoreFocus` → `getForegroundWindow`·`setForeground`(Win32가 없으면 null·false), `random` → `Math.random`, `timers` → `realTimers`, `now` → `Date.now`.
- `screen`의 `display-added`·`display-removed`·`display-metrics-changed` → `DISPLAY_SETTLE_MS`(200ms) 뒤 `worldChanged()` 한 번.
- 맨 앞: `raise()`는 Win32가 있으면 `raiseTopmost(hwnd)`, 없으면 `win.moveTop()`. 바 런타임의 `afterRaise`로 바·펼침 창 바로 다음에 올린다(§14-2 "펫은 늘 바보다 앞"). 바가 보이지 않는 동안에는 펫 전용 `createTopmostKeeper({ raise, timers: realTimers })`를 켠다(`onBarChange`·`refresh`에서 `펫 표시 && !bar.visible()`로 갱신).
- 바 런타임 연결: 전체 화면 감시의 `onChange`에서 켜질 때는 `onFullscreen(true)`를 `bar.setFullscreen(true)`보다 먼저, 꺼질 때는 `bar.setFullscreen(false)` 다음에 호출한다(숨은 펫이 바 없는 세계를 반영하지 않아 앉은 자리 유지). `onBarChange`는 바 창의 `setBounds`·`showInactive`·`hide` 뒤에 호출해 끌기·자동 숨김·모양 변경·잠시 숨김을 모두 포함하고, `worldChanged()`로 연결한다. 펫 시작 때 `fullscreen()`으로 현재 상태를 읽는다. 바 런타임이 시작에 실패했으면 바 없는 세계이고 전체 화면 숨김은 없다.
- BrowserWindow `blur` → 조종 중이면 `endControl('blur')`.
- `appEvents.on((e) => controller.react(e))`.
- IPC(`ipc.ts`, 펫 런타임은 나중에 생성되므로 getter로 받음): `pet:get-view`, `pet:press`(`parsePetBool`), `pet:context-menu`, `pet:menu`(`parsePetMenuAction`), `pet:key`(`parsePetKey`), `pet:bubble-click`, `pet:bubble-rect`(`parsePetRect`, undefined면 무시). 잘못된 값은 무시한다.
- `index.ts`: `startBar()` 다음 `startPet()`을 try/catch로 호출한다(펫이 실패해도 바·팔레트 동작, `pet.startError` 기록). `applySettings`가 `petRuntime?.refresh()`를 호출한다. `setPetVisible(v)` → `updateSettings`로 `pet.visible` 저장 → `applySettings`(M5 `togglePet`도 이 함수를 호출). `openPalette` → `showPalette({ mode: 'search' })`. `will-quit`에서 `dispose()`.

- [ ] **Step 1: 실패하는 테스트** — `petWindowOptions('p')`: `contextIsolation` true, `nodeIntegration` false, `sandbox` true, `spellcheck` false, `focusable` false, `transparent` true, `frame` false, `skipTaskbar` true, `alwaysOnTop` true, `type` `'toolbar'`, `width` 320, `height` 240, `backgroundThrottling` true, `show` false; `parsePetBool(true)` → true, `'true'` → null; `parsePetMenuAction('hide')` 통과, `'eval'` → null; `parsePetKey('left', true)` 통과, `('ArrowLeft', true)`·`('left', 'yes')` → null; `parsePetRect(null)` → null, `{x:1,y:2,width:3,height:4}` 통과, `x` NaN·너비 0·너비 5000 → undefined.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/shared/pet/pet-ipc.test.ts src/main/windows/overlay-window.test.ts` → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — PASS, `npm test`(전체), `npm run typecheck`, `npx electron-vite build` 성공. 창·클릭 통과·포커스는 리눅스에서 확인할 수 없으므로 Task 11 Windows 스모크로 확인한다.
- [ ] **Step 5: 커밋** — `feat: 말랑 메이트 창을 앱에 연결`

### Task 10: 팔레트·트레이·조종 단축키

**Files:**
- Create: `desktop/src/main/pet/pet-commands.ts`
- Modify: `desktop/src/main/prompts/palette-items.ts`, `desktop/src/main/tray.ts`, `desktop/src/main/hotkeys/hotkey-manager.ts`(`HotkeyId`에 `'pet-control'`), `desktop/src/main/index.ts`
- Test: `desktop/src/main/pet/pet-commands.test.ts`, `desktop/src/main/prompts/palette-items.test.ts`

**Interfaces:**
- Consumes: Task 1, Task 9 `setPetVisible`·`createPetRuntime().controller`, M5 T11 `barCommandItems`
- Produces: `petCommandItems(o: { visible: boolean }): PaletteItem[]`, `createPetCommands(d: { isVisible(): boolean; setVisible(v: boolean): Promise<void>; startControl(): void; waitKeysReleased(): Promise<boolean>; hidePalette(restoreFocus: boolean): void; notify(message: string): void; log(event: string, data: Record<string, unknown>): void }): { run(id: string): Promise<boolean> }`, `buildPaletteItems(templates, commands, o: { …; petVisible: boolean })`, `TrayOptions`에 `petVisible(): boolean; onPetVisible(visible: boolean): void`

§16 "키보드만으로 모든 기능 사용"을 충족하고, 바를 끈 뒤에도 펫을 다시 부를 곳이 필요하다.
- 명령: `cmd.pet-visible`(제목 "말랑 메이트 숨기기"/"말랑 메이트 보이기", 키워드 pet·펫·말랑·메이트·숨기기·보이기), `cmd.pet-control`(제목 "말랑 메이트 조종하기", 부제 "←→ 걷기 · Space 뛰기 · Esc 끝", 펫이 보일 때만). `cmd.bar-shape` 다음에 둔다.
- 실행 순서는 M5 바 명령과 같다: 키 떼기 확인 → `hidePalette(true)`(원래 창으로 포커스) → 동작. 보이기 전환은 키를 떼지 않아도 값을 바꾼다. 조종은 키를 떼지 않았으면 시작하지 않고(팔레트가 앞에 남은 채 펫이 포커스를 가져가지 않게) 알림 "키를 뗀 뒤 다시 실행해 주세요."를 표시한다. 조종은 팔레트를 숨긴 뒤 시작하므로 Esc 때 원래 창으로 돌아간다.
- 알림 초안: 숨김 "말랑 메이트를 숨겼어요. 바의 펫 단추나 트레이에서 다시 불러요.", 표시 "말랑 메이트가 나왔어요."
- 트레이: "말랑 메이트 보이기" 체크 항목.
- 조종 단축키: `settings.pet.controlHotkey`가 있으면 `manager.bind('pet-control', acc, () => petRuntime?.controller.toggleControl())`, 실패하면 트레이 알림 "말랑 메이트 조종 단축키 {acc}를 등록하지 못했어요."; null이면 등록하지 않는다(§19).

- [ ] **Step 1: 실패하는 테스트** — `petCommandItems({ visible: true })` → id `cmd.pet-visible`(제목 "말랑 메이트 숨기기")·`cmd.pet-control`; `{ visible: false }` → "말랑 메이트 보이기" 하나; `run('cmd.pet-visible')` → `waitKeysReleased` → `hidePalette(true)` → `setVisible(false)` 순서·true; 키를 떼지 않으면 `hidePalette` 없이 `setVisible`만; `run('cmd.pet-control')` → `hidePalette(true)` 다음 `startControl`, 키를 떼지 않으면 `startControl` 없음·알림 1회; 다른 id → false; `buildPaletteItems` 명령 구역에서 `cmd.bar-shape` 바로 뒤 `cmd.pet-visible`.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/main/pet/pet-commands.test.ts src/main/prompts/palette-items.test.ts` → FAIL
- [ ] **Step 3: 구현** — `runItem`에서 바 명령 다음에 `petCommands.run(id)`를 확인한다.
- [ ] **Step 4: 통과 확인** — PASS, `npm run typecheck`
- [ ] **Step 5: 커밋** — `feat: 팔레트·트레이·단축키로 말랑 메이트 다루기`

### Task 11: Windows 스모크 시험과 기록

**Files:**
- Create: `desktop/scripts/smoke/t19-pet.ps1`, `desktop/scripts/smoke/t19-run.ps1`
- Modify: `desktop/scripts/smoke/smoke-lib.ps1`, `desktop/scripts/smoke/README.md`, `docs/decisions.md`, `docs/reports/company-pc-checklist.md`

리눅스 서버에서는 실행할 수 없다(PowerShell·Win32·실제 창 필요). 스크립트를 작성해 커밋하고, 사용자가 Windows 개발 PC에서 `powershell -NoProfile -ExecutionPolicy Bypass -File .\t19-run.ps1`과 `.\t19-run.ps1 -Idle`로 실행한다. 스크립트는 UTF-8 BOM으로 저장하고, 키는 스캔 코드와 함께 사람 타이밍으로 보낸다(README 규칙).

- [ ] **Step 1: 도우미와 실행기** — `smoke-lib.ps1`에 `LastPet([string]$mode)`(마지막 `pet.state`, mode를 주면 그 mode), `PetCenter($pet)`(box 가운데, DIP), `DragPath($fromDip, $toDip, [int]$ms)`(누름 → 16ms마다 이동 → 움직이는 중에 뗌, 물리 픽셀 = DIP × 배율), `CpuSeconds`(Sure-Mate·electron 프로세스 CPU 초 합), `WaitLog([string]$event, [int]$sec, [scriptblock]$where)`를 추가한다. `t19-run.ps1`은 `t18-run.ps1`처럼 `settings.json`을 백업하고 `ai.defaultTarget: 'copy'`, `masking.mode: 'restore'`, `bar: { shape: 'edge', edge: 'right', monitor: 'primary', autoHide: false }`, `pet: { visible: true, size: 56, activity: 'normal', sleepAfterMin: 1, bubbles: true, reactions: true, controlHotkey: null, reduceMotion: false }`로 바꿔 `run-smoke.ps1 -Script t19-pet.ps1 -TimeoutSec 300`을 실행한다. `-Idle`이면 `sleepAfterMin: 3`(기본값)으로 `t19-pet.ps1 -IdleMinutes 5`를 `-TimeoutSec 420`으로 실행한다. 모두 `finally`에서 되돌린다.
- [ ] **Step 2: t19-pet.ps1** — §14-2 완료 기준 순서:
  1. `app.ready` 뒤 60초 안에 `pet.state` climb 다음 sit(`pet_bar_flow_within_60s`), 캡처 `m6-pet-sit`(`ShotRect`로 펫 창);
  2. 앉아 있는 동안 펫 창 사각형 안·펫 몸 밖(창 왼쪽 아래 구석)에 시험 창 단추를 놓고 클릭 → 단추 눌림(`click_through_transparent`); 펫 몸 가운데 클릭 → `pet.click hop`이고 단추 안 눌림(`click_on_pet_received`), 앞 창은 시험 창 그대로(`pet_click_kept_focus`); 작업 표시줄 빈 곳 클릭 → 2초 안에 `TopmostIsApp`(`taskbar_click_ok`);
  3. 펫 몸을 0.15초 간격으로 두 번 클릭 → `pet.click double`·`palette.show`(`double_click_opens_palette`) → Esc;
  4. 펫을 잡아 0.25초 동안 왼쪽 위로 300 DIP 끌다 움직이는 중에 놓기 → `pet.state held` → `land`, 마지막 box 아래가 바닥(`thrown_lands_on_floor`); 다시 잡아 바 꼭대기 위 40 DIP에서 멈췄다 놓기 → 1초 안에 `sit`(`dropped_on_bar_sits`); 놓은 뒤 0.2초 안에 2번의 단추가 다시 눌림(`click_through_after_drag`);
  5. 시험 창 글상자에 가짜 회의 메모(가상자동차 포함)를 입력·선택 → 바 첫 고정 프롬프트 클릭(M5 `LastBarPlace`·`BAR_METRICS`로 위치 계산) → 클릭 시각과 `pet.react celebrate` 시각 차 1초 미만(`reaction_within_1s`), 캡처 `m6-pet-celebrate`; 바 가명 처리 메뉴에서 끔 → 같은 동작 → `pet.react warn`(`warning_on_masking_off`), 캡처 `m6-pet-warn` → 되돌리기 모드로 복구;
  6. 펫 오른쪽 클릭 → 캡처 `m6-pet-menu` → "조종하기" 클릭 → `pet.control start` → ←를 1초 누름(첫 반복 0.5초 뒤 33ms 간격) → box x 감소(`control_walks`) → Space → Esc → `pet.control end`, 앞 창이 시험 창(`control_esc_restores_focus`);
  7. 시험용 전체 화면 창 → 1.1초 안에 `pet.visibility` visible false·reason fullscreen → 닫으면 1.1초 안에 다시 표시(`pet_hides_fullscreen`);
  8. 입력 없이 70초 → `pet.state sleep`(`pet_sleeps`) → 펫 위로 커서 → `pet.state wake`(`pet_wakes_on_hover`);
  9. 로그에 메모 글·"가상자동차"·말풍선 문구("가명으로 바꿨어요")가 없음(`log_has_no_content`); 참고값 `memory_mb`(§16 350MB 목표, 넘으면 renderer 경로별 코드 분할 검토);
  10. `-IdleMinutes 5`: 입력 없이 5분, `idle_cpu_percent` = CPU 초 증가 / (300 × 논리 프로세서 수) × 100(목표 1 미만), `pet_slept_during_idle`. 작업 관리자 5분 평균은 사람이 같은 조건에서 확인한다.
- [ ] **Step 3: 문서** — README 표에 t19 행과 "t19 결과를 눈으로 확인할 곳"(True여야 하는 줄; 캡처 4장에서 확인할 것: 앉은 펫이 바 꼭대기에 붙음, 말풍선 문구와 꼬리, 메뉴가 바 메뉴와 같은 가족; 125%·150% 배율로 바꿔 다시 실행; 작업 표시줄을 왼쪽·자동 숨김으로 바꿔 다시 실행해 펫이 새 바닥에 서는지)을 추가한다. 회사 PC 점검표에 펫 항목(펫이 바탕화면 아이콘·작업 표시줄 클릭을 막지 않는지, 발표·전체 화면 영상에서 숨는지, 보안 프로그램 경고 여부, `t19-run.ps1 -Idle`의 CPU)을 추가한다.
- [ ] **Step 4: 결정 기록** — `docs/decisions.md`에 한 줄씩 추가한다(날짜는 작업한 날, 형식 `날짜 · 결정 — 이유`):
  - 펫 클릭 통과는 main이 커서를 조회(가까우면 34ms, 멀면 100ms, 졸 때 250ms)해 펫 몸·말풍선·메뉴 위에서만 `setIgnoreMouseEvents(false)`, `forward`는 사용하지 않음 — `forward`는 Electron이 WH_MOUSE_LL 전역 마우스 훅으로 구현(§10·M5 조회 원칙), 사용자 확인 결과 함께 기록
  - 바가 바닥에 닿지 않으면 바 안쪽 면 아래에서 뛰어올라(중력 식으로 계산한 높이) 옆면에 붙은 뒤 오름 — 바 높이는 항목 수(§14-1), 시안은 바닥까지 닿는 띠
  - 시작·깬 뒤 첫 계획과 바에서 내려온 지 45초가 지난 계획은 바 오르기, 첫 가만히 3초, 처음 위치는 바닥 가운데 — 완료 기준 "1분 안에"(가중치만으로는 약 50%)
  - 활발함 가중치(가만히·걷기·바) 차분 0.6·0.3·0.1, 보통 0.4·0.4·0.2, 활발 0.2·0.5·0.3, 오르기 속도는 걷기의 0.75, 기본 크기 56 — 설계에 값 없음
  - 펫 창 320×240 DIP, 모니터 밖으로 나가지 않게 자르고 화면 끝에서는 펫이 창 안에서 이동 — 너비 200 말풍선·4행 메뉴를 펫 위나 옆에 포함, 배율이 다른 옆 모니터에 걸치면 창 크기가 바뀜(electron#27651)
  - 바닥은 작업 영역 아래 끝, 벽은 작업 영역 좌우 끝 — Win32 조회 없이 작업 표시줄 아래·위·옆·자동 숨김을 모두 처리, 옆 작업 표시줄을 가리지 않음
  - 바 꼭대기 위에 펫이 들어갈 자리가 없으면 오르지 않음 — 머리가 화면 밖으로 나감
  - 졸 때 z는 떠오르지 않음 — §14-2 "졸 때는 애니메이션도 멈춘다"(시안은 떠오름), CPU
  - 졸기는 시스템 입력이 없는 시간(`powerMonitor.getSystemIdleTime`)으로 판단하고 마우스 올림·클릭·앱 반응·메뉴로만 깸 — 전역 훅 없이 조회
  - "가만히 있을 때 CPU 1%"는 사용자가 5분 동안 입력하지 않는 동안(펫은 혼자 놀다 졺) Sure-Mate 전체로 측정 — §16 바·펫 전체 기준
  - 가져오기 실패 반응은 busy를 제외한 모든 이유(선택 없음 포함), 문구는 `CAPTURE_NOTES` — §10 안내 문구와 같은 글
  - 프롬프트 복사 반응은 클립보드에 쓴 직후(AI 창을 열기 전) — 완료 기준 1초
  - 반응은 들려 있거나 공중이면 내려놓은 뒤 마지막 하나만, 숨긴 동안·전체 화면 중에는 없음 — 쌓이지 않게(§14-2)
  - 흰색 토큰 `--white: #FFFFFF` 추가 — §14-2가 말풍선 바탕·하이라이트를 흰색으로 지정했으나 §14-4 표에 없음
  - 펫 오른쪽 클릭 메뉴는 펫 창 안에 그림 — 포커스를 받지 않고 펫 옆에 붙음, 닫기 규칙은 M5 바 메뉴와 같음
  - 클릭 뛰기는 CSS 한 번(창은 움직이지 않음), 더블클릭 간격 500ms — 두 번째 클릭이 움직인 몸을 놓치지 않게, Windows 기본값
  - 조종 모드: ←→는 바 꼭대기에서도 걷고 끝을 넘으면 떨어짐, Space 높이는 몸 크기, ↑는 바 옆 24 DIP 안에서 오르기, 다른 창을 누르면 종료(포커스 되돌리지 않음) — 설계에 없는 세부
  - 펫을 다시 부르는 곳은 바 펫 단추, 트레이 "말랑 메이트 보이기", 팔레트 "말랑 메이트 보이기" — 바를 끈 상태, §16 키보드
  - 선글라스는 반응 끄기와 무관하게 가명 처리 상태를 표시 — 바 상태 점과 같은 상태 표시
  - 바 런타임이 시작하지 못하면 펫은 전체 화면 앱에서 숨지 못함 — 전체 화면 감시가 바 런타임에 있음
  - 펫 창은 `backgroundThrottling: true` — 숨긴 동안 그리지 않음(CPU)
  - Task 6·7·8 디자인 단계에서 정한 값
- [ ] **Step 5: 리눅스 확인** — `npm test`, `npm run typecheck`, `npx electron-vite build` PASS. 서버에 `pwsh`가 있으면 M5 Task 13과 같은 방법으로 새·수정 `.ps1`의 구문 오류를 확인한다(없으면 건너뛰고 보고).
- [ ] **Step 6: 커밋** — `test: 말랑 메이트 스모크 시험과 결정 기록`
- [ ] **Step 7: 보고** — 사용자에게 Windows에서 `t19-run.ps1`·`t19-run.ps1 -Idle` 실행을 요청하고, 확인할 결과(README의 True 줄, 캡처 4장, 125%·150% 재실행, 작업 표시줄 위치 변경, 5분 CPU)를 전달한다. §20 "펫 말풍선 문구 검토(존댓말, 짧게)"는 사람이 할 일로 함께 전달한다. 결과를 받기 전에는 M6 완료로 보고하지 않는다(§0 단계 보고 규칙).
