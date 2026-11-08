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

설정을 잠시 바꾸는 `t14-run.ps1`·`t16-run.ps1`의 출력은 `Select-Object -First`로 자르지 말고 파일로 받아 읽는다. 파이프가 일찍 끊기면 되돌리기(`finally`)가 돌지 않아 `settings.json`이 시험 값으로 남는다.

스크립트는 UTF-8 BOM으로 저장한다. Windows PowerShell 5.1은 BOM 없는 파일을 시스템 코드 페이지로 읽어 한글 주석에서 구문이 깨진다.

지킬 것: 키는 스캔 코드와 함께 보내고, 시험 창은 시스템 메뉴(ControlBox)를 끈다. 키 타이밍은 사람처럼 한다(첫 자동 반복 0.5초 뒤 33ms 간격, 보조키는 0.2~0.8초 늦게 떼기).
