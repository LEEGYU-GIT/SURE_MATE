# M4 Sure-Wiki·검색 랭커·{{terms}}·상용구 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 팔레트에서 사내 용어를 초성·자모·한영 오입력까지 찾아 보고 고치고 나누며(F3), 프롬프트에 입력 글의 용어 설명이 자동으로 붙고(`{{terms}}`), `!이슈` 같은 상용구를 직전 창에 붙여넣는다(F5).

**Architecture:** 한글 검색 키(초성·자모·자판 키)와 §9 점수 단계를 shared의 순수 함수로 만들고, 팔레트의 모든 구역 검색을 이 랭커로 바꾼다. 용어는 기본 팩(`resources/glossary.json`)과 사용자 파일(`%APPDATA%\Sure-Mate\glossary.json`)을 id로 합쳐 main에서 읽고, 팔레트에 `wiki:<id>` 항목과 상세·편집 화면을 둔다. `{{terms}}`는 가명 사전과 같은 이름 찾기 규칙을 일반화해 쓴다. 상용구는 프롬프트와 같은 템플릿 엔진으로 채워 §10 붙여넣기 순서로 직전 창에 넣는다.

**Tech Stack:** Electron 45, React 19, TypeScript, Tailwind v4, cmdk, Vitest. 새 의존성 없음(한글 분해는 직접 구현).

**Spec:** `docs/superpowers/specs/2026-11-05-sure-mate-design.md` (§6 팔레트, §7 `{{terms}}`, §9 F3, §10 붙여넣기, §12 F5, §14-4 디자인 토큰)

**이번에 하지 않는 것:** 선택 텍스트 위키 카드(바 옆 펼침 창)는 M5 바와 함께. 랭커 동점 처리의 학습 연결·최근·자주 쓴 항목과 맨 위 후보 의도 표시는 M7 말하듯 입력과 함께(그때까지 동점은 짧은 제목·넣은 순서).

## Global Constraints

- 앱은 네트워크 요청을 하지 않는다. 링크는 http/https만 `shell.openExternal`로 연다.
- 로그에는 길이·id·건수만. 용어·설명·검색어·상용구 본문·창 제목을 남기지 않는다. 오류 글은 `errorText()`.
- 정규화: NFC + 전각→반각(U+FF01~FF5E, U+3000) + 소문자. **NFKC 금지**(§9).
- 용어 항목 제한(§9): term 1~60자, definition 1,000자 이하, example 500자 이하, links 5개 이하(http/https만), tags 5개 이하.
- 용어 팩 형식(§9): `{ format: 'sure-mate-glossary', version: 1, exportedAt, entries: [...] }`, 내보낸 파일 이름 `sure-mate-용어팩-YYYYMMDD.json`.
- 상용구에는 가명 처리를 하지 않는다(§12). 붙여넣은 뒤 클립보드는 되돌리지 않는다(§10).
- 클립보드 쓰기는 모두 `native/selection.ts`(`writeClipboardText`·`pasteText`)를 거친다.
- 한글 입력 규칙(§6): 조합 중에는 Enter·화살표·Tab·Space로 동작하지 않는다. 키는 `e.code`+보조키로 본다. 같은 항목을 300ms 안에 두 번 실행하지 않는다.
- 색·글자·모양은 §14-4 토큰만 쓴다. 데모·시험 데이터의 이름은 가상(가상자동차, XY방산)만.

## Review Focus

1. **조합 중 검색**: 한글을 치는 중간 상태('간'은 '가나'를 치는 중)와 초성만 친 검색어('ㅈㅈㅂㅅ')가 맨 위로 맞는 항목을 찾고, 한 글자·빈 검색어에서 위키 100개가 목록을 덮지 않는다. → Task 2·3 테스트.
2. **사용자 파일이 깨졌을 때**: BOM·잘못된 JSON·형식이 다른 `glossary.json`이면 기본 팩은 그대로 쓰고 오류를 알리며, 깨진 파일을 덮어써 사용자 용어를 잃지 않는다. → Task 4 테스트.
3. **가져오는 팩의 나쁜 값**: `javascript:` 링크, 제한을 넘는 글, 5MB 넘는 파일, 형식이 다른 JSON은 거르고, 미리 보기 숫자가 실제 반영 결과와 같다. → Task 7 테스트.
4. **`{{terms}}` 경계**: "MC/DC가"는 MC/DC를 찾고 'SILVER'에는 SIL이 걸리지 않으며, 같은 용어가 여러 번 나와도 설명은 한 번만 붙는다. → Task 8 테스트.
5. **상용구 붙여넣기 실패**: 직전 창이 사라졌거나 관리자 권한 창이면 복사만 하고 그 까닭을 알리며, 자동 반복 Enter로 두 번 붙지 않는다. → Task 9 테스트.

---

### Task 1: 한글 검색 키

**Files:**
- Create: `desktop/src/shared/text/hangul.ts`
- Test: `desktop/src/shared/text/hangul.test.ts`

**Interfaces:**
- Produces: `getChoseong(s: string): string`(음절은 초성 호환 자모로, 나머지는 그대로), `disassemble(s: string): string`(음절과 겹자모를 치는 순서의 기본 자모로: '과'→'ㄱㅗㅏ', '읽'→'ㅇㅣㄹㄱ', 'ㄲ'은 한 키), `toQwerty(s: string): string`(자모를 두벌식 자판 글자로, 쌍자음·ㅒ·ㅖ는 대문자), `isChoseongOnly(s: string): boolean`(한글 자음 자모만으로 된 글)

- [ ] **Step 1: 실패하는 테스트** — `getChoseong('정적분석')`=`'ㅈㅈㅂㅅ'`, `disassemble('간')`=`'ㄱㅏㄴ'`, `disassemble('과')`=`'ㄱㅗㅏ'`, `disassemble('읽')`=`'ㅇㅣㄹㄱ'`, `toQwerty(disassemble('검색'))`=`'rjator'`, `toQwerty(disassemble('정적분석'))`=`'wjdwjrqnstjr'`, `toQwerty(disassemble('까'))`=`'Rk'`, 영문·숫자·기호는 그대로, `isChoseongOnly('ㅈㅈㅂㅅ')`=true, `isChoseongOnly('ㅈ정')`=false.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/shared/text/hangul.test.ts` FAIL(모듈 없음)
- [ ] **Step 3: 구현** — 유니코드 산술(0xAC00, 초성 19·중성 21·종성 28)과 겹모음·겹받침 분해표, 두벌식 표.
- [ ] **Step 4: 통과 확인** — PASS
- [ ] **Step 5: 커밋** — `feat: 한글 검색 키(초성·자모·자판)`

### Task 2: 검색 랭커

**Files:**
- Create: `desktop/src/shared/search/ranker.ts`
- Test: `desktop/src/shared/search/ranker.test.ts`

**Interfaces:**
- Consumes: Task 1, `foldForMatch`(`shared/text/normalize.ts`)
- Produces: `SearchDoc { id: string; title: string; aliases: string[]; body?: string }`, `buildSearchIndex(docs: SearchDoc[]): SearchIndex`, `rank(index: SearchIndex, query: string): { id: string; score: number }[]`(점수 높은 순, 0점은 뺌)

점수(§9): 제목 compact 일치 1000·별칭 950 > 앞부분 일치 900·별칭 850 > 토큰 일치·토큰 앞부분 800 > 초성 일치 750·앞부분 700·포함 600 > 자모 앞부분 650 > 한영 오입력 앞부분 600 > compact 포함 500 > 자모 포함 450 > 자모 오타 300−100×거리(검색어 자모 4~7개면 거리 1, 8개 이상이면 2까지, 앞 단계 결과가 5개 미만일 때만) > 본문 포함 100. 항목 점수는 제목·별칭 중 가장 높은 것. 동점은 제목이 짧은 순, 그다음 넣은 순서. 토큰은 공백·`-_/.,:()·`와 영문/숫자↔한글 경계로 나누고, compact가 1글자 이하로 줄면(`C++`) 정규화 원형을 쓴다. 초성 단계는 검색어가 초성만일 때만.

- [ ] **Step 1: 실패하는 테스트** — 설계 §9 완료 기준 `'ㅈㅈㅂㅅ'`·`'정적분삭'`·`'wjdwjrqnstjr'`→'정적분석' 맨 위, `'mcdc'`→'MC/DC' 맨 위(10개 남짓의 섞인 문서에서), 제목 일치가 별칭 일치보다 위, `'간'`→'가나다' 찾음(자모 앞부분), `'c++'`가 'C++'를 찾음, 본문에만 있는 말은 100점, 빈 검색어는 빈 결과.
- [ ] **Step 2: 실패 확인** — FAIL
- [ ] **Step 3: 구현** — 문서마다 이름(제목·별칭)별 정규화·토큰·compact·자모·초성·자판 키를 미리 계산. 오타 거리는 자모 레벤슈타인(한도 넘으면 일찍 멈춤).
- [ ] **Step 4: 통과 확인** — PASS
- [ ] **Step 5: 커밋** — `feat: 검색 랭커(설계 §9 점수 단계)`

### Task 3: 팔레트 검색을 랭커로

**Files:**
- Modify: `desktop/src/renderer/src/palette/filter-items.ts`, `Palette.tsx`, `desktop/src/shared/types.ts`(`PaletteItem.body?`)
- Test: `desktop/src/renderer/src/palette/filter-items.test.ts`

**Interfaces:**
- Consumes: Task 2
- Produces: `filterItems(items: PaletteItem[], query: string, index?: SearchIndex): PaletteItem[]`, `buildPaletteIndex(items: PaletteItem[]): SearchIndex`(제목, 별칭=keywords, 본문=body·subtitle)

- [ ] **Step 1: 실패하는 테스트** — 접두어 범위 유지, 랭커 순서로 정렬(구역 묶음은 그리기에서), 검색어가 비었고 범위가 없으면 위키 항목은 빼고 나머지는 넣은 순서, `?`만 치면 위키 항목 전부(용어 가나다순), 초성 'ㅎㅇㄹ'이 '회의록 정리'를 찾음.
- [ ] **Step 2: 실패 확인** — FAIL
- [ ] **Step 3: 구현** — 색인은 항목 배열이 바뀔 때만 만든다(`useMemo`). 기존 "검색어를 아직 못 따라왔을 때 맨 위 실행"도 같은 함수를 쓴다.
- [ ] **Step 4: 통과 확인** — PASS, `npm run typecheck`
- [ ] **Step 5: 커밋** — `feat: 팔레트 검색을 랭커로`

### Task 4: 용어 사전 모델·기본 팩·저장소

**Files:**
- Create: `desktop/src/shared/glossary/types.ts`, `desktop/src/shared/glossary/pack.ts`, `desktop/resources/glossary.json`, `desktop/src/main/glossary/glossary-store.ts`
- Test: `desktop/src/shared/glossary/pack.test.ts`, `desktop/src/main/glossary/glossary-store.test.ts`

**Interfaces:**
- Produces: `GlossaryEntry`(§9 그대로), `GLOSSARY_FORMAT = 'sure-mate-glossary'`, `parseGlossaryPack(raw: unknown, source: GlossaryEntry['source']): { entries: GlossaryEntry[]; errors: string[] }`(제한 검사, 링크는 http/https만 남김), `normalizedKey(term: string): string`(compact 정규화, 중복 판단용), `GLOSSARY_FILE = 'glossary.json'`, `loadGlossary(userDir: string, builtin: unknown): Promise<{ entries: GlossaryEntry[]; errors: string[] }>`(같은 id면 사용자 것이 이김, 자리는 기본 팩 순서), `saveUserEntries(userDir: string, entries: GlossaryEntry[]): Promise<void>`(임시 파일에 쓰고 이름 바꾸기), `createGlossaryCache(userDir, builtin, onErrors)`(템플릿 캐시처럼 수정 시각이 바뀔 때만 다시 읽음)

기본 팩 id는 읽기 쉬운 고정 id(`mcdc`, `static-analysis` …)로 둔다(팩을 고쳐도 사용자 수정본이 같은 id로 이어지게). 사용자가 새로 만든 항목만 uuid v4. 내용은 공개된 표준·일반 용어만(소프트웨어 검증, 정적분석, 커버리지, 기능 안전, 자동차·국방·항공 규격 이름 등) 약 100개, 설명은 300자 안팎, "결과는 사람이 검토"할 초안이라고 §20에 따라 사용자가 다듬는다.

- [ ] **Step 1: 실패하는 테스트** — 제한을 넘는 항목은 건너뛰고 까닭을 남김, `javascript:` 링크는 뺌, 형식이 다르면 빈 목록과 오류, 기본 팩 파일이 오류 없이 읽히고 90개 이상이며 id가 겹치지 않음, 사용자 파일이 BOM·깨진 JSON이어도 기본 팩은 그대로 오고 오류를 남기며 사용자 파일을 고치지 않음, 같은 id는 사용자 것이 이김.
- [ ] **Step 2: 실패 확인** — FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — PASS
- [ ] **Step 5: 커밋** — `feat: 용어 사전 모델·기본 팩·저장소`

### Task 5: 팔레트 위키(찾기·상세·설명 복사·링크)

**Files:**
- Create: `desktop/src/main/glossary/glossary-runtime.ts`, `desktop/src/renderer/src/palette/WikiDetail.tsx`
- Modify: `desktop/src/shared/ipc-channels.ts`, `desktop/src/preload/index.ts`, `desktop/src/main/ipc.ts`, `desktop/src/main/index.ts`, `desktop/src/main/prompts/palette-items.ts`, `Palette.tsx`
- Test: `desktop/src/main/prompts/palette-items.test.ts`, `desktop/src/main/glossary/glossary-runtime.test.ts`

**Interfaces:**
- Consumes: Task 3·4
- Produces: `buildPaletteItems(templates, commands, o: { maskingMode: MaskingMode; glossary: GlossaryEntry[] })`, 항목 `wiki:<id>`(구역 wiki, 제목 term, 부제 설명 첫 줄, keywords 별칭+태그, body 설명), `ShownPayload { mode: 'wiki'; entry: GlossaryEntry }`, IPC `wiki:copy(id)`(설명을 `writeClipboardText`로), `wiki:open-link(id, index)`(main이 항목의 링크만, http/https만 연다)

- [ ] **Step 1: 실패하는 테스트** — `buildPaletteItems`가 위키 항목을 위키 구역에 넣음, 런타임: 복사는 설명만 쓰고(용어 아님) 로그엔 id·길이만, 없는 링크 번호·http가 아닌 링크는 열지 않음.
- [ ] **Step 2: 실패 확인** — FAIL
- [ ] **Step 3: 구현** — 상세 화면: 용어(20px)·별칭·설명·사용 예·링크·태그·출처, Enter 설명 복사(복사하면 팔레트 닫고 원래 창으로), 숫자 1~5 링크 열기, E 수정(Task 6), Esc 목록으로. 위키 범위에 결과가 없으면 "이 용어를 아시나요? 직접 추가하기"(Task 6 편집 화면으로, 검색어를 미리 채움).
- [ ] **Step 4: 통과 확인** — PASS, `npm run typecheck`
- [ ] **Step 5: 커밋** — `feat: 팔레트 위키 상세와 설명 복사`

### Task 6: 용어 추가·수정

**Files:**
- Create: `desktop/src/renderer/src/palette/WikiEdit.tsx`, `desktop/src/renderer/src/palette/wiki-form.ts`
- Modify: `glossary-runtime.ts`, IPC·preload·ipc.ts
- Test: `desktop/src/renderer/src/palette/wiki-form.test.ts`, `glossary-runtime.test.ts`

**Interfaces:**
- Produces: `formToEntry(form: WikiForm, base?: GlossaryEntry): { entry?: GlossaryEntry; errors: string[] }`(쉼표로 나눈 별칭·태그, 링크 줄 "제목 | 주소"), IPC `wiki:save(entry, { allowDuplicate })` → `{ ok: true; entry } | { ok: false; duplicate?: GlossaryEntry; errors?: string[] }`(새 항목은 uuid·updatedAt·version 1·source user, 고치면 version+1, 기본 팩 항목을 고치면 같은 id의 사용자본)

- [ ] **Step 1: 실패하는 테스트** — 폼 검사(빈 용어, 60자 초과, 링크 6개, http가 아닌 주소), 같은 정규화 키가 있으면 저장하지 않고 duplicate를 돌려주고 allowDuplicate면 저장, 기본 팩 항목을 고치면 같은 id로 사용자 파일에 들어가고 version이 오름.
- [ ] **Step 2: 실패 확인** — FAIL
- [ ] **Step 3: 구현** — 편집 화면: 칸마다 한 줄 안내, 설명·사용 예·링크는 여러 줄(Enter 줄바꿈), Ctrl+Enter 저장, Esc 취소. 중복이면 "같은 용어가 있어요: 〈용어〉 — 그래도 새로 추가(Ctrl+Enter)".
- [ ] **Step 4: 통과 확인** — PASS, `npm run typecheck`
- [ ] **Step 5: 커밋** — `feat: 용어 추가·수정`

### Task 7: 용어 팩 내보내기·가져오기

**Files:**
- Create: `desktop/src/shared/glossary/merge.ts`, `desktop/src/main/glossary/pack-commands.ts`
- Modify: `palette-items.ts`(명령 2개), `index.ts`
- Test: `desktop/src/shared/glossary/merge.test.ts`, `desktop/src/main/glossary/pack-commands.test.ts`

**Interfaces:**
- Produces: `previewImport(current: GlossaryEntry[], incoming: GlossaryEntry[]): { added: number; changed: number; sameName: number; unchanged: number }`, `mergeImport(current, incoming): GlossaryEntry[]`(같은 id는 updatedAt이 새로운 쪽, 다른 id인데 정규화 키가 같으면 둘 다, 가져온 항목은 source imported), `exportPack(entries, now): string`(기본은 source가 builtin이 아닌 것), 명령 `cmd.glossary-export`·`cmd.glossary-import`(파일 대화상자, 5MB 넘으면 거절, 미리 보기 숫자를 메시지 상자로 보여 주고 확인하면 반영)

- [ ] **Step 1: 실패하는 테스트** — 미리 보기 숫자가 합친 결과와 맞음(새 2·바뀜 1·이름 겹침 1), 오래된 같은 id는 안 바뀜, 내보낸 글을 다시 파싱하면 같은 항목, 5MB 넘는 파일·형식이 다른 파일은 반영하지 않고 알림.
- [ ] **Step 2: 실패 확인** — FAIL
- [ ] **Step 3: 구현** — 대화상자는 팔레트를 숨긴 뒤 부모 없이 띄운다(팔레트는 blur로 닫힘). 내보낸 파일 이름 `sure-mate-용어팩-YYYYMMDD.json`, 기본 폴더 문서.
- [ ] **Step 4: 통과 확인** — PASS, `npm run typecheck`
- [ ] **Step 5: 커밋** — `feat: 용어 팩 내보내기·가져오기`

### Task 8: `{{terms}}` 용어 자동 첨부

**Files:**
- Create: `desktop/src/shared/text/find-names.ts`, `desktop/src/shared/glossary/find-terms.ts`
- Modify: `desktop/src/shared/masking/dictionary.ts`(공통 찾기 사용), `desktop/src/main/prompts/prompt-runtime.ts`, `index.ts`
- Test: `desktop/src/shared/text/find-names.test.ts`, `desktop/src/shared/glossary/find-terms.test.ts`(가명 사전 시험은 그대로 통과해야 함)

**Interfaces:**
- Produces: `findNames(text: string, entries: { key: string; names: string[]; exactOnly?: boolean }[]): { start: number; end: number; key: string; original: string }[]`(가명 사전의 찾기 규칙 그대로: 왼쪽부터 가장 긴 것, 한글은 한글 구간 맨 앞, 영문·숫자 경계, 조사 허용), `findGlossaryTerms(text: string, entries: GlossaryEntry[]): GlossaryEntry[]`(처음 나온 순서, 같은 항목은 한 번)

- [ ] **Step 1: 실패하는 테스트** — "MC/DC가 뭐야"→MC/DC, "SILVER 등급"→없음, "SIL 2 요구"→SIL, "정적분석은"→정적분석, 같은 용어 세 번→한 번, 별칭으로 찾아도 항목 하나. 가명 사전 기존 시험 모두 통과.
- [ ] **Step 2: 실패 확인** — FAIL
- [ ] **Step 3: 구현** — 프롬프트 런타임의 `terms`가 지금 용어 목록(캐시)에서 찾은 것을 `{ term, definition }`으로 넘긴다. 채우기 → 가리기 순서는 그대로(용어 설명도 가리기 대상).
- [ ] **Step 4: 통과 확인** — PASS, `npm run typecheck`
- [ ] **Step 5: 커밋** — `feat: {{terms}} 용어 자동 첨부`

### Task 9: 상용구 붙여넣기

**Files:**
- Create: `desktop/src/main/snippets/snippet-runner.ts`, `desktop/src/main/snippets/snippet-runtime.ts`
- Modify: `desktop/resources/prompts.json`(기본 상용구 2개), `index.ts`
- Test: `desktop/src/main/snippets/snippet-runner.test.ts`

**Interfaces:**
- Produces: `createSnippetRunner(deps).run(templateId)` — Enter·보조키 떼기 기다림 → 팔레트 숨기고 직전 창 앞으로 → (본문에 `{{selection}}`이 있을 때만 가져오기) → 채우기(가명 처리 없음) → `pasteText(직전 창, 글)`. 붙여넣지 못하면 복사만 하고 알림("붙여넣지 못해 복사만 했어요: 관리자 권한 창" 등). 로그에는 id·길이·결과만.
- 기본 상용구: `defect-report`(결함 리포트, 별칭 이슈·결함·issue·bug), `mail-signature`(메일 서명, 별칭 서명·signature). 본문은 칸 이름만 있는 빈 양식(사용자가 회사 양식으로 채움).

- [ ] **Step 1: 실패하는 테스트** — 순서(키 떼기 → 숨기기 → 붙여넣기), `{{selection}}`이 없으면 가져오지 않음, 붙여넣기 실패 까닭이 알림에 들어감, 직전 창이 없으면 복사만, 로그에 본문 없음.
- [ ] **Step 2: 실패 확인** — FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — PASS, `npm run typecheck`
- [ ] **Step 5: 커밋** — `feat: 상용구 붙여넣기`

### Task 10: 실제 앱 확인과 기록

**Files:**
- Create: `desktop/scripts/smoke/t17-wiki-snippet.ps1`
- Modify: `desktop/scripts/smoke/README.md`, `docs/decisions.md`

- [ ] **Step 1:** t17: 팔레트 `?` + "mcdc" → MC/DC가 맨 위(캡처) → Enter 상세(캡처) → Enter 설명 복사 → 클립보드에 설명. 시험 창 글상자에서 `!` + "issue" → Enter → 글상자에 결함 리포트 양식이 한 번만. 로그에 용어·본문 없음.
- [ ] **Step 2:** 캡처를 §14-4와 맞춰 보고 고친다. `docs/decisions.md` 기록, 커밋 — `test: 위키·상용구 스모크 시험과 결정 기록`
