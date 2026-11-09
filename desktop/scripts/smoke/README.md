# 스모크 시험 (개발 PC용)

시험용 창에 사람처럼 키를 보내 실제 앱을 확인한다. 사람이 직접 하는 회사 PC 점검(`docs/reports/company-pc-checklist.md`)과 달리 개발 PC에서 자동으로 돈다.

- 실행: `powershell -NoProfile -ExecutionPolicy Bypass -File .\run-smoke.ps1 -Script t11-smoke.ps1`
  - dev 앱(`npm run dev`)을 띄우고, 앱 로그의 `app.ready`에서 팔레트 단축키를 읽어 시험 스크립트에 넘긴 뒤 모두 정리한다.
  - 결과와 dev 로그는 `%TEMP%\sure-mate-smoke`, 앱 로그는 `%APPDATA%\Sure-Mate\logs`.
- 설치본: `t10-installed.ps1` (dist의 설치 파일을 조용히 설치 → t9 → 삭제 → 시작 프로그램 항목 정리)
- koffi 차단: `t12-run-blocked.ps1` (koffi.node를 잠시 숨기고 t12 → 되돌림)

| 스크립트 | 확인하는 것 |
|---|---|
| t5 | 단축키로 표시, Esc로 닫고 원래 창 복귀, 빠른 반복 입력, 두 번째 실행 |
| t6 | 검색 "mc"+Enter가 한 번만 실행, 다시 열면 검색어 비움 |
| t7 | 한글 입력 기록기 열기, JSON 저장 |
| t8 | 창 목록, 직전 창 옮기기 |
| t9 | 선택 글 가져오기, 선택 없음, 붙여넣기, 기록 제외 형식 |
| t11 | 사람 손 타이밍: 1.5초 누르기, 보조키 늦게 떼기, 누른 채, 연달아 두 번 |
| t12 | koffi가 막혔을 때 팔레트와 안내 |
| t13 | 파일만 복사된 클립보드 |
| t14 | 프롬프트 흐름: 선택 → 팔레트 `/` → 확인 화면 → 복사(`t14-run.ps1`로 실행, AI 대상을 잠시 "복사만"으로), 선택 없으면 클립보드, Esc로 목록 |
| t15 | 팔레트 화면 캡처(디자인 검토용, `%TEMP%\sure-mate-smoke\*.png`) |
| t16 | 가명 처리: §8 예시 선택 → 확인 화면 되돌리기·빼기·끔 캡처, 항목 끄기, 복사한 프롬프트의 가명 줄·머리말, 로그에 이름 없음(`t16-run.ps1`로 실행, 가상 예시 사전과 "복사만" 대상을 잠시 넣고 되돌림) |
| t17 | 위키·상용구: 팔레트 `?` + mcdc → MC/DC 맨 위(캡처) → Enter 상세(캡처) → Enter 설명 복사 → 클립보드가 설명과 같음. 시험 창 글상자에서 `!` + issue → Enter → 글상자에 결함 리포트 양식이 한 번만(캡처), 로그에 용어·설명·본문 없음(`run-smoke.ps1 -Script t17-wiki-snippet.ps1`) |

설정을 잠시 바꾸는 `t14-run.ps1`·`t16-run.ps1`의 출력은 `Select-Object -First`로 자르지 말고 파일로 받아 읽는다. 파이프가 일찍 끊기면 되돌리기(`finally`)가 돌지 않아 `settings.json`이 시험 값으로 남는다.

스크립트는 UTF-8 BOM으로 저장한다. Windows PowerShell 5.1은 BOM 없는 파일을 시스템 코드 페이지로 읽어 한글 주석에서 구문이 깨진다.

지킬 것: 키는 스캔 코드와 함께 보내고, 시험 창은 시스템 메뉴(ControlBox)를 끈다. 키 타이밍은 사람처럼 한다(첫 자동 반복 0.5초 뒤 33ms 간격, 보조키는 0.2~0.8초 늦게 떼기).

### t17 결과를 눈으로 확인할 곳

Windows에서 돌린 뒤 `%TEMP%\sure-mate-smoke`에 저장된 캡처 3장을 설계 문서 §14-4(색·글자·모양 토큰)와 맞춰 본다. 스크립트가 출력하는 `... = True/False` 줄은 먼저 모두 True인지 확인한다(`wiki_run`·`wiki_copy_log`·`snippet_log`는 로그 줄이며 id와 길이만 있어야 한다).

- `m4-wiki-search.png`: 위키 검색. 입력줄에 `?mcdc`가 보이고, 목록이 위키 용어만이며 맨 위 행이 MC/DC(위키 아이콘)이며 선택 강조가 되어 있다. 다른 용어(코드 커버리지 등)가 그 아래에 이어진다.
- `m4-wiki-detail.png`: 용어 상세. 머리줄에 용어 이름·출처 표시(기본 용어)·`Esc 목록으로`, 본문에 별칭 줄·설명·사용 예 상자가 보인다. 링크가 없는 용어이므로 링크 구역은 없다. 글자 크기와 여백이 팔레트 목록과 같은 토큰이다.
- `m4-snippet-search.png`: 상용구 검색. 입력줄에 `!issue`가 보이고, 목록이 상용구만이며 맨 위 행이 결함 리포트이고 부제에 설명이 보인다.
- 캡처에서 내용이 잘리거나 두 줄로 어긋나면 `src/renderer/src/palette/`를 고친다. 글상자에 양식이 두 번 들어갔거나 한 글자라도 다르면 `textbox_form_count`·`textbox_is_form`이 False로 나온다.
