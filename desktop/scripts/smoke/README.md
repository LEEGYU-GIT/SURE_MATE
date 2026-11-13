# 스모크 시험 (개발 PC용)

시험용 창에 사람처럼 키를 보내 실제 앱을 확인한다. 사람이 직접 하는 회사 PC 점검(`docs/reports/company-pc-checklist.md`)과 달리 개발 PC에서 자동으로 돈다.

- 실행: `powershell -NoProfile -ExecutionPolicy Bypass -File .\run-smoke.ps1 -Script t11-smoke.ps1`
  - dev 앱(`npm run dev`)을 띄우고, 앱 로그의 `app.ready`에서 팔레트 단축키를 읽어 시험 스크립트에 넘긴 뒤 모두 정리한다.
  - 결과와 dev 로그는 `%TEMP%\sure-mate-smoke`, 앱 로그는 `%APPDATA%\Sure-Mate\logs`.
  - `-TimeoutSec`: 시험 스크립트 제한 시간(기본 60초), `-ScriptArgs`: 시험 스크립트에 덧붙일 인자(예: `'-AutoHide'`).
- 설치본: `t10-installed.ps1` (dist의 설치 파일을 조용히 설치 → 15초 뒤 메모리·30초 CPU 측정 → t9 → 삭제 → 시작 프로그램 항목 정리)
  - 메모리는 `info_private_mb`(사용 메모리, 작업 관리자의 메모리 열에 가깝다)로 설계 §16 목표 350MB와 비교한다. `info_memory_mb`(작업 집합 합)는 프로세스들이 함께 쓰는 DLL을 겹쳐 세어 더 크게 나온다. 2026-11-10 main(e39ab8a) 설치본: 프로세스 6개, 사용 메모리 286MB, 작업 집합 합 526MB, 가만히 있을 때 CPU 0.1%
- koffi 차단: `t12-run-blocked.ps1` (koffi.node를 잠시 숨기고 t12 → 되돌림)

| 스크립트 | 확인하는 것 |
|---|---|
| t5 | 단축키로 표시, Esc로 닫고 원래 창 복귀, 빠른 반복 입력, 두 번째 실행 |
| t6 | 검색 "mc"+Enter가 한 번만 실행, 다시 열면 검색어 비움 |
| t7 | 한글 입력 기록기 열기, JSON 저장 |
| t8 | 창 목록, 직전 창 옮기기 |
| t9 | 선택 글 가져오기(`wiki.card` 로그를 읽음, 옛 `dev.capture` 대체), 선택 없음, 붙여넣기, 기록 제외 형식 |
| t11 | (`wiki.card` 로그를 읽음) 사람 손 타이밍: 1.5초 누르기, 보조키 늦게 떼기, 누른 채, 연달아 두 번 |
| t12 | (`wiki.card` 로그를 읽음) koffi가 막혔을 때 팔레트와 안내 |
| t13 | (`wiki.card` 로그를 읽음) 파일만 복사된 클립보드 |
| t14 | 프롬프트 흐름: 선택 → 팔레트 `/` → 확인 화면 → 복사(`t14-run.ps1`로 실행, AI 대상을 잠시 "복사만"으로), 선택 없으면 클립보드, Esc로 목록 |
| t15 | 팔레트 화면 캡처(디자인 검토용, `%TEMP%\sure-mate-smoke\*.png`) |
| t16 | 가명 처리: §8 예시 선택 → 확인 화면 되돌리기·빼기·끔 캡처, 항목 끄기, 복사한 프롬프트의 가명 줄·머리말, 로그에 이름 없음(`t16-run.ps1`로 실행, 가상 예시 사전과 "복사만" 대상을 잠시 넣고 되돌림) |
| t17 | 위키·상용구: 팔레트 `?` + mcdc → MC/DC 맨 위(캡처) → Enter 상세(캡처) → Enter 설명 복사 → 클립보드가 설명과 같음. 시험 창 글상자에서 `!` + issue → Enter → 글상자에 결함 리포트 양식이 한 번만(캡처), 로그에 용어·설명·본문 없음(`run-smoke.ps1 -Script t17-wiki-snippet.ps1`) |
| t18 | 바·펼침 창·위키 카드(M5): 가장자리 띠 배치와 너비 56, 고정 프롬프트 클릭 실행(확인 화면 없이·선택 유지·앞 창 유지), 가명 처리 메뉴 끔·되돌리기(같은 메뉴를 두 번째 열어도 눌림), 이름표 0.6초 표시·0.3초 미표시, `Ctrl+Alt+W` 위키 카드와 8초 뒤 자동 닫힘, 전체 화면 창에서 바 숨김·복귀, 다른 맨 앞(topmost) 창이 덮은 뒤 2초 안에 맨 위 복귀, 바 메뉴로 캡슐↔띠 전환, 끌어서 위치 저장, 자동 숨김 손잡이, 로그에 선택 글·프롬프트·용어 이름 없음, 참고값 메모리·유휴 CPU(`t18-run.ps1`로 실행, 설정을 잠시 바꾸고 되돌림) |
| t20 | 말랑 메이트(M6): 시작 60초 안에 바를 올라 꼭대기에 앉음, 펫 몸 밖 클릭 통과·몸 클릭(뛰기)·앞 창 유지·작업 표시줄 클릭 뒤 바 복귀, 0.15초 간격 두 번 클릭 → 팔레트, 던지면 바닥에 닿고 바 위에서 놓으면 앉음, 놓은 직후 클릭 통과, 오른쪽 클릭 메뉴(캡처)·숨기기 → 바 펫 단추로 다시 부른 직후 첫 행 클릭, 조종 모드(←1초 걷기·Space·Esc로 끝나고 앞 창 복귀, Alt+Space·Alt+F4, 조종 중 팔레트), 복사 1초 안에 축하·가명 처리 끔이면 경고(캡처), 다시 나타난 직후 첫 클릭·첫 끌기, 전체 화면에서 숨김·복귀와 직후 첫 행 클릭, 입력 없이 70초 뒤 졸고 커서를 올리면 깸, 로그에 메모 글·말풍선 문구 없음, 참고값 메모리. `-Idle`: 입력 없이 5분 동안 앱 전체 CPU와 졺(`t20-run.ps1`·`t20-run.ps1 -Idle`로 실행, 설정·가상 가명 사전을 잠시 바꾸고 되돌림) |
| t21 | 워크스페이스(M7): 팔레트 `@` → "지금 배치 저장"으로 시험 창 3개(보통·보통·최대화) 저장 → 설정 창 워크스페이스 탭이 열리고 이름 칸이 선택된 상태에서 이름 바꾸기(그 자리에서 저장), 흐트러뜨린 뒤 팔레트로 불러오면 ±10px·최소화·최대화 상태 복원·불러오기 전 앞 창 복귀, 닫은 창은 "못 찾음"으로 집계, `Ctrl+Enter`로 설정 창 → Tab 두 번 → 단축키 `Ctrl+Alt+9` 녹화 → 단축키로 불러오기, 조종 모드 중 단축키(조종이 먼저 종료되고 앞 창이 시험 창, 펫이 보일 때만), 바 워크스페이스 메뉴 둘째 행으로 불러오기(메뉴 캡처·앞 창 유지, 첫 행은 기본 워크스페이스 '화면 감추기'), 화면 감추기에 B를 저장한 뒤 감추면 C만 최소화되고 다시 누르면 되돌아옴, 로그에 창 제목·이름 없음(`t21-run.ps1`로 실행, 설정을 잠시 바꾸고 워크스페이스·기억한 문장·사용 기록·단어 목록 파일을 비웠다가 되돌림) |
| t22 | 말하듯 입력(M7): 팔레트 `@보고서 모드` → 목록 끝 저장 줄로 지금 배치 저장, '회의록 정리해줘'와 영문 자판 상태로 입력한 같은 문장 → 회의록 정리 프롬프트(의도 표시 캡처), '보고서 모드로 바꿔줘' → 그 워크스페이스 불러오기, '가명 되돌려줘' → 가명 되돌리기, '보고서 띄워줘'에서 ↓로 둘째 행을 선택하고 Shift+Enter로 기억한 뒤 같은 문장의 맨 위가 그 워크스페이스(기억하기 안내 캡처), 로그에 입력 문장 없음(`t22-run.ps1`로 실행, 설정을 잠시 바꾸고 워크스페이스·기억한 문장·사용 기록·단어 목록 파일을 비웠다가 되돌림) |

설정을 잠시 바꾸는 `t14-run.ps1`·`t16-run.ps1`·`t18-run.ps1`·`t20-run.ps1`·`t21-run.ps1`·`t22-run.ps1`의 출력은 `Select-Object -First`로 자르지 말고 파일로 받아 읽는다. 파이프가 일찍 끊기면 되돌리기(`finally`)가 돌지 않아 `settings.json`이 시험 값으로 남는다.

안전하게 중단하는 방법: 실행 중인 창에서 `Ctrl+C`를 한 번 누른다. `run-smoke.ps1`은 `finally`에서 시험 스크립트 프로세스, dev 앱(`npm run dev`와 그 자식 프로세스), 이 저장소의 electron, 시험 창을 정리한다. `*-run.ps1`은 자기 `finally`에서 설정·사용자 파일을 되돌리고, t21·t22는 클립보드도 되돌린다. 이 동작은 리눅스 서버에서 확인할 수 없고 Windows에서 확인하지 않았다(확인 필요).
- 창 닫기 단추·작업 관리자의 강제 종료·`Stop-Process`는 `finally`를 돌리지 않는다. 이때는 dev 앱과 electron이 남을 수 있으므로 작업 관리자에서 `electron`·`node`·`cmd`를 정리하고, `%APPDATA%\Sure-Mate`에 `.smoke-backup` 파일이 남아 있으면 원래 파일과 비교해 되돌린 뒤 지운다. `.smoke-backup`이 있으면 다음 실행이 멈추는 것은 의도한 동작이다.
- 시험 중에는 마우스·키보드를 사용하지 않는다. 중단한 뒤 시험 창(`SureMate-Test`·`SureMate-WS-*`)이 남아 있으면 직접 닫는다.

스크립트는 UTF-8 BOM으로 저장한다. Windows PowerShell 5.1은 BOM 없는 파일을 시스템 코드 페이지로 읽어 한글 주석에서 구문이 깨진다.

지킬 것: 키는 스캔 코드와 함께 보내고, 시험 창은 시스템 메뉴(ControlBox)를 끈다. 키 타이밍은 사람처럼 한다(첫 자동 반복 0.5초 뒤 33ms 간격, 보조키는 0.2~0.8초 늦게 떼기).

### t17 결과를 눈으로 확인할 곳

t17은 2026-11-09 Windows 11(배율 1.25)에서 처음 실행해 판정 줄이 모두 True였다. 다시 실행할 때도 판정 줄과 캡처를 함께 확인하고, False가 나오면 스크립트 문제인지 앱 문제인지 먼저 구분한다.

맨 위 판정(`?mcdc` → MC/DC)은 기본 용어 팩만 있는 상태를 기준으로 한다. 사용자가 추가하거나 가져온 용어(`%APPDATA%\Sure-Mate\glossary.json`)가 있으면 맨 위 용어가 달라질 수 있다(예: 이름이 `MCDC`인 사용자 용어). 그 파일이 있으면 잠시 다른 이름으로 옮긴 뒤 실행한다.

Windows에서 돌린 뒤 `%TEMP%\sure-mate-smoke`에 저장된 캡처 3장을 설계 문서 §14-4(색·글자·모양 토큰)와 맞춰 본다. 스크립트 출력 중 아래 줄은 모두 `True`여야 한다. 하나라도 False면 그 항목이 실패한 것이다.

- `expected_loaded`: 기대 글을 앱 자료에서 읽음
- `detail_in_front`: 위키 상세 화면이 앞에 있음
- `wiki_copy_logged_once`, `wiki_copy_log_id_length_only`: 설명 복사 로그가 한 번이고 id(mcdc)와 길이만 담음
- `clipboard_is_definition`: 클립보드가 MC/DC 설명과 같음
- `snippet_logged_once`, `snippet_pasted`: 상용구 실행 로그가 한 번이고 결과가 붙여넣음(id defect-report, 길이 일치)
- `textbox_is_form`, `log_has_no_content`, `log_has_no_typed_text`: 글상자가 양식과 같고 로그에 용어·본문·입력한 글이 없음
- `textbox_form_count`는 숫자 1이어야 한다(양식이 한 번만 들어감).

`clipboard_length`·`textbox_length`는 참고용 길이이고, `info_foreground_after_wiki`·`info_foreground_after_snippet`은 참고용 창 제목이다. 시험 창 제목 `SureMate-Test`가 나오면 정상이다. 창 제목은 앱 로그에 남지 않는다.

- `m4-wiki-search.png`: 위키 검색. 입력줄에 `?mcdc`가 보이고, 목록이 위키 용어만이며 맨 위 행이 MC/DC(위키 아이콘)이며 선택 강조가 되어 있다. 다른 용어(코드 커버리지 등)가 그 아래에 이어진다.
- `m4-wiki-detail.png`: 용어 상세. 머리줄에 용어 이름·출처 표시(기본 용어)·`Esc 목록으로`, 본문에 별칭 줄·설명·사용 예 상자가 보인다. 링크가 없는 용어이므로 링크 구역은 없다. 글자 크기와 여백이 팔레트 목록과 같은 토큰이다.
- `m4-snippet-search.png`: 상용구 검색. 입력줄에 `!issue`가 보이고, 목록이 상용구만이며 맨 위 행이 결함 리포트이고 부제에 설명이 보인다.
- 캡처에서 내용이 잘리거나 두 줄로 어긋나면 `src/renderer/src/palette/`를 고친다. 글상자에 양식이 두 번 들어갔거나 한 글자라도 다르면 `textbox_form_count`·`textbox_is_form`이 False로 나온다.

### Windows 확인 결과 (2026-11-13, Windows 11, 주 모니터 2560×1600 150% + 보조 1920×1080 100%)

합친 코드(main `d9fd629`: 화면 감추기, 첫 실행 안내 세 화면, 쉬어 가기 말)로 돌렸다. 이 PC의 팔레트 단축키는 Alt+Space다.

| 시험 | 결과 |
|---|---|
| t18 | 판정 44개 모두 True(가만히 있을 때 CPU 0.05%) |
| t21 | 판정 27개 모두 True(`mixed_dpi`, 화면 감추기 세 줄 포함). 조종 모드 두 줄은 펫을 숨겨 둔 설정이라 skipped |
| t22 | 판정 9개 모두 True |
| t20 | 세 번 돌려 가장 좋은 실행이 판정 32개 중 28개 True. 실패한 단계가 실행마다 달라 앱 문제인지 시험 문제인지 아직 가리지 못했다(아래) |

t20에서 남은 것(회사 PC 점검표 8번에서 사람이 함께 확인한다):

- `pet_sleeps`·`pet_wakes_on_hover`: 펫은 시스템 입력이 설정한 시간(시험은 1분) 동안 없어야 존다. 한 실행에서는 입력이 없는 동안 60초 만에 졸았고(앱 동작 확인), 두 실행에서는 시험 중에 졸지 않았다. 시험 중 누가 마우스·키보드를 쓰면 실패하므로 자리를 비우고 돌린다
- `click_through_after_drag`: 펫을 바 꼭대기에 놓고 0.2초 안에 펫 창 왼쪽 위 구석을 누른 클릭이 세 번 모두 아래 시험 창에 닿지 않았다. 단추 횟수를 메시지 처리 뒤에 세도록 고친 뒤에도 같으므로 앱 쪽(놓은 직후 클릭 통과로 돌아가는 시점)일 수 있다
- 펫 메뉴로 숨긴 직후 바의 펫 단추 클릭이 한 번 들어가지 않아, 그 뒤 조종·반응 단계가 펫이 숨은 채로 이어져 실패한 실행이 있었다(같은 단추를 다른 단계에서 누른 것은 매번 동작했다)

이번에 고친 시험 스크립트 문제:

- run-smoke.ps1이 시험을 숨김(`-WindowStyle Hidden`)으로 실행하므로 시험 프로세스에서 처음 띄운 창이 숨은 창이 되었다(첫 ShowWindow는 넘긴 값 대신 STARTUPINFO의 숨김을 쓴다). 그 창은 클릭을 받지 못하고 앱이 창 목록에서 뺀다. smoke-lib.ps1이 불러질 때 투명한 보통 창 하나로 첫 호출을 미리 쓴다(작업 표시줄에 없는 창·테두리 없는 창은 첫 호출을 쓰지 않는다). t21의 시험 창 A가 저장되지 않고 t20의 단추가 눌리지 않던 원인이다
- 모니터가 둘이면 팔레트가 마우스가 있는 모니터에 떠서 시험이 놓쳤다. 설정을 잠시 바꾸는 `*-run.ps1`이 팔레트를 주 모니터에 고정한다(`palette.display` primary)
- t18: 2560px·150% 화면에서 작업 영역이 1706.67 DIP라 바 너비가 57 DIP로 읽혔다. 너비·자리 판정을 ±1 DIP(손잡이 오른쪽 끝은 ±1.5)로 본다
- t20: 팔레트 단축키가 Alt+Space이면 Alt+Space 단계는 팔레트를 여는 것이 맞으므로 skipped다. 놓은 직후 클릭 통과는 시험 창 메시지를 처리한 뒤 센다
- t21·t22: 출력 끝 클립보드 줄의 `$clipState:`가 PowerShell 5.1에서 구문 오류였다(`${clipState}`)
- t22: 저장 직후 workspaces.json을 2초 동안 다시 읽고, 찾은 항목을 `@()`로 받는다. PowerShell 5.1의 PSCustomObject에는 `.Count`가 없어 하나뿐인 항목을 못 찾은 것으로 셌다
- PowerShell 5.1의 `>`는 UTF-16으로 저장하므로 출력 파일을 grep으로 읽으려면 먼저 UTF-8로 바꾼다

### Windows 확인 결과 (2026-11-09, Windows 11, 배율 125%)

아래 결과는 집 PC에서 집에서 만든 코드(`origin/m5-bar`, 커밋 `b565f98`)로 얻은 것이다. 리눅스 개발 서버에서 만든 코드와 합친 뒤에는 아직 돌리지 않았다.

- t17: 처음 실행해 판정 줄이 모두 True였다.
- t18: 첫 번째 묶음(자동 숨김 끔)과 두 번째 묶음(`-AutoHide`)의 판정 줄이 모두 True였다.
- t9·t11·t12·t13: 옛 `dev.capture` 대신 `wiki.card` 줄을 읽도록 고쳐 다시 돌려 확인했다.

이 시험 스크립트는 집에서 확인한 것을 바탕으로 리눅스 개발 서버에서 만든 코드에 맞춰 고쳤으므로, **합친 코드에서 t18을 한 번 더 실행해야 한다.** 맞춰 고친 점은 다음과 같다.

- 같은 바 단추를 0.5초 안에 두 번 클릭하면 두 번째 클릭은 앱이 무시한다(운영 체제의 두 번 클릭 처리). 시험은 같은 자리 연속 클릭 사이를 0.7초 이상 띄운다.
- 선택한 글이 없을 때 위키 안내 카드는 키를 뗀 뒤 약 1초 늦게 뜬다(클립보드 읽기 순서를 기다린다). t9·t11·t12·t13의 `wiki.card` 대기 시간은 3초 이상이다.
- 위키 카드의 맨 위 항목은 설명 본문에만 일치한 결과로 정해지지 않는다. 시험은 이름이 일치하는 `MC/DC`를 사용하며 `mcdc`가 맨 위에 나온다.
- 자동 숨김의 접힘·펼침은 `bar.place` 로그에 남는다. 시험은 이 로그의 너비와 위치를 읽는다.
- 이름표·손잡이 올림 시간은 시험이 직접 재서(`info_` 줄) 근접 실패를 구분한다.

### t18 결과를 눈으로 확인할 곳

실행: `powershell -NoProfile -ExecutionPolicy Bypass -File .\t18-run.ps1 > t18-out.txt` 뒤 `t18-out.txt`를 연다(약 3분, 그동안 마우스·키보드를 사용하지 않는다). 첫 번째 결과 묶음은 자동 숨김 끔, 두 번째 묶음(`-AutoHide`)은 자동 숨김 켬이다. 시험 창과 바를 가리는 창은 닫아 둔다. `settings.json.smoke-backup` 파일이 이미 있으면 앞선 시험이 도중에 끊긴 것이므로 시험이 시작하지 않고 멈춘다. 설정 파일과 비교해 정리한 뒤 다시 실행한다.

판정 줄은 모두 `True`여야 한다. 아래 판정 줄이 출력에 없거나 `error =` 줄이 있으면 그 단계는 실패한 것이다. 하나라도 False면 그 항목이 실패한 것이며, 먼저 스크립트 문제인지 앱 문제인지 구분한다.

첫 번째 묶음(자동 숨김 끔):

- 바: `bar_place_found`, `bar_no_mismatch`(요청한 바 사각형과 실제 사각형이 같음), `bar_width_56`(오른쪽 가장자리 띠, 너비 56), `layout_height_matches`(시험이 계산한 항목 위치의 높이가 실제 바 높이와 같음, False면 아래 클릭 시험이 엉뚱한 곳을 누른다)
- 고정 프롬프트: `prompt_bar_ran`(확인 화면 없이 실행), `prompt_clipboard_has_selection`, `prompt_selection_kept`(글상자 선택 그대로), `prompt_kept_focus`(앞 창이 시험 창 그대로)
- 가명 처리 메뉴: `masking_menu_shown`, `masking_menu_kept_focus`, `masking_set_off`, `masking_set_restore`(같은 메뉴를 두 번째 열어 누른 것도 들어가야 한다)
- 이름표: `label_after_600ms`, `no_label_after_300ms`(올린 시간은 `info_label_dwell_ms`, `info_short_dwell_ms`로 확인한다. 0.3초 쪽이 0.35초를 넘으면 시험 쪽 지연이다)
- 위키 카드: `wiki_card_best`, `wiki_card_length_5`, `wiki_card_shown`, `wiki_card_kept_focus`, `wiki_clipboard_restored`, `wiki_card_timeout`(8초 뒤 저절로 닫힘), `wiki_selection_kept`
- 전체 화면: `fullscreen_hides_bar`, `fullscreen_close_shows_bar`, `fullscreen_within_1_1s`(걸린 시간은 `info_fullscreen_ms`로 근접 실패를 확인한다)
- 맨 위 유지: `topmost_cover_over_bar`(시험용 맨 위 창이 실제로 바를 덮음, False면 시험이 성립하지 않은 것이다), `topmost_regained_2s`(2초 안에 바가 다시 맨 위, 걸린 시간은 `info_topmost_ms`)
- 바 메뉴: `bar_menu_shown`, `capsule_placed`, `capsule_width_44`, `back_to_edge`, `edge_again_width_56`, `bar_shape_saved_edge`
- 끌기: `drag_moved_120`(`info_drag_direction`이 down이 아니면 아래 공간이 부족해 위로 끌었다), `drag_saved_position`
- 로그: `log_has_no_content`, `log_has_no_typed_text`, `bar_no_mismatch_at_end`

두 번째 묶음(`-AutoHide`): `autohide_collapsed`, `autohide_short_hover_stays`, `autohide_hover_opens`, `autohide_collapses_again`, `log_has_no_typed_text`. 접힘·펼침의 너비는 `bar.place` 로그에서 읽는다(손잡이 6 DIP는 배율에 따라 물리 픽셀로 반올림되므로 ±1 DIP 허용). 걸린 시간은 `info_short_hover_ms`, `info_hover_open_ms`, `info_collapse_ms`로 확인한다.

`info_`로 시작하는 줄은 참고값이다. `info_memory_mb`는 dev 앱 Electron 프로세스 작업 집합의 합(설계 §16 목표 350MB, dev 모드는 설치본보다 크다), `info_idle_cpu_percent`는 바만 떠 있는 30초 동안의 CPU(전체 코어 대비, 목표 1% 미만, 5분 평균은 작업 관리자로 확인한다)다.

캡처 8장은 `%TEMP%\sure-mate-smoke`에 저장된다. 설계 §14-1·§14-4와 대조해 눈으로 확인한다.

- `m5-bar-edge.png`: 가장자리 띠. 안쪽 모서리만 둥글고 화면 쪽은 직선이다. 로고 칸이 청록색 사각형이고 가명 처리 방패에 초록 점이 있다. 그림자가 없다.
- `m5-masking-menu.png`: 가명 처리 메뉴. 바에서 8 DIP 떨어져 있고 머리 글 아래에 끔, 가명 후 되돌리기, 결과에서 빼기 세 행이 있다. 지금 값 행에 체크와 굵은 글씨가 보인다. 그림자가 잘리지 않는다.
- `m5-bar-masking-off.png`: 끔 상태의 바. 끊어진 방패, 주황 점, 방패 밑 "끔" 글자가 모두 보인다(색만으로 알리지 않음).
- `m5-label.png`: 로고 이름표. "팔레트 열기"와 단축키 칩이 한 줄이고 글자가 잘리지 않는다.
- `m5-wiki-card.png`: 위키 카드. 맨 위 용어 MC/DC, 별칭 줄, 설명, [설명 복사]·[고정] 단추가 보이고 카드 너비는 360 DIP다. 글자가 잘리지 않는다.
- `m5-bar-menu.png`: 바 메뉴. 바 모양 세 행(바 끄기에 설명), 30분 동안 숨기기, 설정 열기.
- `m5-bar-capsule.png`: 떠 있는 캡슐. 너비 44, 화면 가장자리에서 12 떨어져 있고 완전히 둥글다. 불투명한 단색이다(흐림 없음).
- `m5-bar-handle.png`: 자동 숨김 손잡이. 화면 끝에 너비 6의 세로 띠가 보인다.

배율 125%·150%에서도 다시 실행한다. Windows 설정 → 디스플레이 → 배율을 바꾸고 로그아웃·로그인한 뒤 `t18-run.ps1`을 돌린다. `info_bar`의 `scale`이 바뀌었는지, 판정이 배율과 상관없이 True인지, 캡처에서 아이콘·"끔" 글자가 흐리지 않고 칸 안에 들어오는지 확인한다. 모니터가 둘이면 주 모니터에서만 시험한다.

### t20 결과를 눈으로 확인할 곳

실행: `powershell -NoProfile -ExecutionPolicy Bypass -File .\t20-run.ps1 > t20-out.txt` 뒤 `t20-out.txt`를 연다(최대 10분, 그동안 마우스·키보드를 사용하지 않는다. 스크립트가 직접 누르고 옮긴다). 5분 동안 입력하지 않고 CPU만 재는 실행은 `.\t20-run.ps1 -Idle > t20-idle-out.txt`(약 6분)다. 시험 창과 바를 가리는 창은 닫아 둔다. 설정 파일(`settings.json`)과 가명 사전(`masking-dictionary.json`)의 `.smoke-backup` 파일이 이미 있으면 앞선 시험이 도중에 끊긴 것이므로 시험이 시작하지 않고 멈춘다. 원래 파일과 비교해 정리한 뒤 다시 실행한다.

t20은 2026-11-13 Windows 11(배율이 다른 모니터 두 대)에서 처음 실행했다(위 'Windows 확인 결과 (2026-11-13)'). False가 나오면 스크립트 문제인지 앱 문제인지 먼저 구분한다(좌표 계산·펫 창 찾기는 스크립트 쪽 가정이다). 펫이 로그에 없는 자리(걷는 중)에서 화면 가장자리에 눌려 있으면 자리를 어림하지 않으므로, 멈추길 기다리다 `error_` 줄에 이유가 출력될 수 있다.

판정 줄은 모두 `True`여야 한다. 아래 판정 줄이 출력에 없거나 `error`로 시작하는 줄(`error =`, `error_1_flow =` 등)이 있으면 그 단계는 실패한 것이다. 단계가 도중에 멈춰도 다음 단계는 이어서 실행한다.

- 시작: `bar_place_found`, `pet_bar_flow_within_60s`(앱이 시작하고 60초 안에 바를 오른 뒤 꼭대기에 앉음, `info_pet_flow`에 상태 순서와 걸린 시간)
- 클릭 통과: `click_through_transparent`(펫 창 안이고 몸 밖인 시험 단추가 눌림. 단추를 창 안에 놓지 못하면 `skipped` 이유가 출력되며 그 줄은 판정되지 않은 것이므로 다시 실행한다), `click_on_pet_received`(몸 클릭은 펫이 받고 단추는 안 눌림), `pet_click_kept_focus`(앞 창이 시험 창 그대로), `info_taskbar_click`(작업 표시줄 빈 곳을 누른 뒤 바가 맨 위인지 참고값. 바 사각형이 작업 표시줄과 겹치지 않아 판정으로 삼지 않는다. 2초 안 복귀는 회사 PC 점검표 7번에서 사람이 확인한다)
- 두 번 클릭: `double_click_opens_palette`(0.15초 간격으로 두 번 누르면 팔레트)
- 집어 던지기: `thrown_lands_on_floor`(발이 작업 영역 아래 끝에 닿음, `info_throw`에 발 위치와 상태 순서), `dropped_on_bar_sits`(바 꼭대기 위 40 DIP에서 놓으면 1초 안에 앉음, `info_drop`), `click_through_after_drag`(놓고 0.2초 안에 펫 창 왼쪽 위 구석의 시험 단추가 다시 눌림. 그 순간 단추가 펫 창 밖이면 `skipped`로 출력)
- 메뉴: `pet_menu_opened`, `menu_hide_row_works`(숨기기), `recall_via_bar_button`(바 펫 단추로 다시 부름), `menu_first_row_after_recall`(다시 부른 뒤 펫이 멈추길 0.5초 기다려 메뉴를 열고, 첫 행 "조종하기"가 한 번에 눌림. 부른 즉시가 아니라 약 1초 뒤다)
- 조종 모드: `control_walks`(←를 1초 누르면 왼쪽으로 이동, `info_control_walk`), `control_esc_ends`, `control_esc_restores_focus`(Esc로 끝나고 앞 창이 시험 창), `alt_space_keeps_control`, `alt_f4_ends_control`, `alt_f4_keeps_pet_window`(Alt+F4는 펫 창을 닫지 않고 조종만 종료함), `control_palette_keeps_focus`(앞 창이 앱 창이면서 펫 창 크기가 아님), `control_palette_ends_control`(조종 중 팔레트를 열면 조종이 원래 창으로 포커스를 돌리며 먼저 끝남: 기록 `reason` handoff), `control_palette_esc_returns`(그 팔레트를 Esc로 닫으면 앞 창이 시험 창, `info_control_palette_esc_foreground`), `alt_f4_ends_control`은 앞 창이 펫 창일 때만 Alt+F4를 보내며 아니면 `skipped`로 출력
- 반응: `reaction_within_1s`(고정 프롬프트 복사 후 1초 안에 축하, 걸린 시간은 `info_reaction_ms`), `warning_on_masking_off`(가명 처리를 끄고 복사하면 경고), `masking_restored`
- 다시 나타난 직후: `first_click_after_reappear`, `first_drag_after_reappear`(숨겼다 바 펫 단추로 부른 직후 첫 클릭·첫 끌기). 펫 창은 숨길 때 `hide()`를 쓰므로 첫 누름이 드물게(약 40번에 1번) 사라질 수 있다. 한 번만 False면 다시 실행해 보고, 반복되면 앱 문제로 기록한다
- 전체 화면: `pet_hides_fullscreen`(1.1초 안에 숨고 닫으면 1.1초 안에 다시 나타남, `info_fullscreen_ms`), `menu_first_row_after_fullscreen`(전체 화면이 종료된 뒤 펫이 멈추길 기다려 연 메뉴의 첫 행. 같은 이유로 즉시가 아니다)
- 졸기: `pet_sleeps`(입력 없이 70초 뒤 졸기), `pet_wakes_on_hover`(커서를 올리면 깸)
- 로그: `log_has_no_content`(메모 글·가상 이름·말풍선 문구 없음), `log_has_no_typed_text`, `pet_no_errors`(펫 오류 로그 없음)

`info_`로 시작하는 줄은 참고값이다. `info_memory_mb`는 앱 프로세스 작업 집합의 합, `info_private_mb`는 사용 메모리 합이다(설계 §16 목표 350MB 이하, dev 앱은 설치본보다 크다. 넘으면 renderer 경로별 코드 분할을 검토한다). `info_foreground_*`는 참고용 창 제목이다.

`-Idle`(졸기까지 3분 설정): `idle_cpu_under_1`(입력 없이 5분 동안 앱 전체 CPU가 1% 미만, 값은 `info_idle_cpu_percent` = CPU 초 증가 ÷ (걸린 초 × 논리 프로세서 수) × 100), `pet_slept_during_idle`(5분 안에 졺), `pet_no_errors`. 작업 관리자의 5분 평균은 사람이 같은 조건에서 확인한다.

캡처 5장은 `%TEMP%\sure-mate-smoke`에 저장된다. 설계 §14-2·§14-4와 대조해 눈으로 확인한다.

- `m6-pet-sit.png`: 바 꼭대기에 앉은 펫. 발이 바 윗면에 붙어 있고(떠 있거나 파묻히지 않음) 외곽선이 선명하다.
- `m6-pet-celebrate.png`: 축하 반응. 편지 소품과 웃는 얼굴, 말풍선에 "가명으로 바꿨어요" 문구가 보이고 꼬리가 펫 얼굴을 가리킨다. 글자가 잘리지 않고 흰 바탕 윗면에서도 외곽선으로 구분된다.
- `m6-pet-warn.png`: 경고 반응. 걱정하는 얼굴과 주황 느낌표, 말풍선 "가명 처리가 꺼져 있어요" 문구, 선글라스가 벗겨진 상태(가명 처리 꺼짐)가 보인다.
- `m6-pet-menu.png`: 오른쪽 클릭 메뉴. 4행(조종하기·재우기·숨기기·펫 설정)이 한 줄씩이고 바 메뉴와 같은 모양(모서리·테두리·그림자·글자 크기)이며 그림자가 창 가장자리에서 잘리지 않는다.
- `m6-pet-alt-space.png`: 조종 중 Alt+Space를 누른 직후. Windows 시스템 메뉴(복원·이동·크기·닫기)가 보이지 않아야 한다.

사람이 눈으로 볼 것(스크립트가 판정하지 않음):

- 배율 125%·150%에서 다시 실행한다. Windows 설정 → 디스플레이 → 배율을 바꾸고 로그아웃·로그인한 뒤 `t20-run.ps1`을 돌려 판정이 배율과 상관없이 True인지, 캡처의 외곽선이 흐리지 않은지 확인한다.
- 작업 표시줄을 왼쪽으로 옮기고, 또 자동 숨김으로 바꿔 다시 실행해 펫이 새 바닥(작업 영역 아래 끝)에 서는지 확인한다. 자동 숨김이면 `info_taskbar_click`은 건너뜀으로 나온다.
- 조종 모드에서 작업 표시줄에 단추가 생기지 않는지, 설정 창을 눌러도 포커스가 설정 창에 남는지는 `docs/reports/company-pc-checklist.md` 8번에서 사람이 확인한다.
- 펫 말풍선 문구 검토(설계 §20: 존댓말, 짧게)는 사람이 한다.

### t21 결과를 눈으로 확인할 곳

실행: `powershell -NoProfile -ExecutionPolicy Bypass -File .\t21-run.ps1 > t21-out.txt` 뒤 `t21-out.txt`를 연다(약 2분, 최대 10분. 그동안 마우스·키보드를 사용하지 않는다). 시험 창과 팔레트·바를 가리는 창은 닫아 둔다.

`Ctrl+Alt+9`를 다른 앱이 사용하면 `.\t21-run.ps1 -WsHotkey Ctrl+Alt+8 > t21-out.txt`처럼 다른 조합으로 실행한다. 아래 설명의 `Ctrl+Alt+9`는 그 조합으로 바뀐다.

시험 전후의 파일 처리는 t22와 같다. 시험 중 클립보드를 사용하며(팔레트가 선택 글을 가져오느라 복사 동작을 사용할 수 있다), 시작 전 클립보드가 글자였으면 시험이 종료된 뒤 되돌린다. 파일·그림이 들어 있었다면 되돌릴 수 없고 출력 끝의 `--- clipboard:` 줄에 그렇게 표시한다. 클립보드 내용은 로그·출력에 남기지 않는다.

- 설정 파일(`settings.json`)을 잠시 바꾼다: AI 대상 "복사만", 바는 주 모니터 오른쪽 가장자리 띠, 가명 처리 되돌리기, 첫 실행 안내 완료. 말랑 메이트 설정은 바꾸지 않는다.
- M7 파일(`workspaces.json`·`phrase-map.json`·`usage.json`·`intents.json`)과 `workspaces.json.bak`을 백업하고, M7 파일은 지워 빈 상태로 시작한다. 앱은 시작할 때 기본 워크스페이스 '화면 감추기'(id `builtin-hide`)를 만들므로 시작 시점의 `workspaces.json`에는 그것만 있어야 한다. 시험이 저장한 워크스페이스가 바 메뉴의 둘째 행(첫 행은 화면 감추기)이 되게 하기 위해서다.
- 시험이 종료되면 모두 되돌린다. `.smoke-backup` 파일이 이미 있으면 시험이 시작하지 않고 멈춘다. `t21-workspace.ps1`을 `run-smoke.ps1`로 직접 실행하면 `t21-run.ps1`이 넘기는 `-FromRunner`가 없으므로 `error =` 줄을 출력하고 멈춘다.

시험 창은 3개다. 좌표는 주 모니터 작업 영역의 왼쪽 위를 기준으로 한 물리 픽셀이다.

- `SureMate-WS-A`: (100,100), 600×400
- `SureMate-WS-B`: (750,100), 600×400. 작업 영역 너비가 1,370 미만이면 x는 오른쪽 끝에서 620 안쪽이다. 배율이 다른 두 번째 모니터가 있으면 그 모니터 작업 영역의 (100,100)
- `SureMate-WS-C`: 최대화

저장은 그때 화면에 열린 창 전체를 대상으로 한다. 시험 창이 아닌 창도 저장되고, 불러올 때마다 저장한 자리로 다시 옮겨진다. 위치는 바뀌지 않지만 최대화한 창은 잠깐 보통 크기가 되었다가 다시 최대화된다.

진행 순서는 다음과 같다.

1. 팔레트에 `@` 입력 → 맨 위 "지금 배치 저장"에서 Enter → 설정 창 워크스페이스 탭이 열리면 이름 칸에 `smoke ws` 입력 → Enter → Esc·Alt+F4로 설정 창 종료
2. A를 옮긴 뒤 최소화, B 최대화, C를 보통 상태로 되돌려 옮김
3. 팔레트 `@smoke ws` → Enter로 불러오기
4. A를 닫고 다시 불러오기
5. 팔레트 `@smoke ws` → Ctrl+Enter → 설정 창에서 Tab 두 번(이름 → 별칭 → 단축키 "정하기") → Enter → `Ctrl+Alt+9` 녹화 → 설정 창 종료 → B를 옮기고 `Ctrl+Alt+9`로 불러오기
6. 펫이 보이면 펫 메뉴 "조종하기"로 조종을 시작한 뒤 `Ctrl+Alt+9`
7. B를 옮기고 바 워크스페이스 단추 → 메뉴 둘째 행으로 불러오기(첫 행은 화면 감추기라 선택하지 않는다)
8. C를 최소화하고 팔레트 `@화면 감추기` → End(목록 끝 '지금 배치로 바꾸기' 줄) → Enter로 B가 보이는 배치를 화면 감추기에 저장 → C를 보통 상태로 되돌린 뒤 `@화면 감추기` → Enter로 감추기 → 한 번 더 `@화면 감추기` → Enter로 되돌리기. 저장할 때 화면에 보이던 다른 앱 창은 화면 감추기에 함께 저장되므로 최소화되지 않고, 저장한 뒤에 연 창만 C와 함께 잠시 최소화했다가 되돌린다

t21은 2026-11-13 Windows 11(배율이 다른 모니터 두 대)에서 처음 실행해 판정 줄이 모두 True였다(위 'Windows 확인 결과 (2026-11-13)'). False가 나오면 스크립트 문제인지 앱 문제인지 먼저 구분한다. 설정 창의 이름 칸 선택과 Tab 위치는 로그에 남지 않으므로 `workspaces.json`의 이름·단축키와 캡처 `m7-ws-editor`로 확인한다.

판정 줄은 모두 `True`여야 한다. 판정 줄이 출력에 없거나 `error`로 시작하는 줄(`error =`, `error_2_save =` 등)이 있으면 그 단계는 실패한 것이다. `skipped (까닭)`은 앞 단계가 성립하지 않아 판정하지 않은 것이므로 까닭을 확인하고 다시 실행한다. 모니터가 1대이면 `mixed_dpi`는 `skipped`가 정상이다.

저장과 설정 창:

- `workspace_saved`: `workspace.save`가 성공하고(출처 palette, 창 3개 이상) `workspaces.json`에 시험 창 3개의 규칙이 하나씩 있다. 아래 판정의 전제다 열린 창이 40개를 넘어 앱이 40개까지만 저장했다고 알리면(`overLimit`) 시험 창이 빠졌을 수 있어 False가 아니라 `skipped (more than 40 windows open)`을 출력한다
- `default_name_batch_n`: 이름 없이 저장한 워크스페이스의 이름이 "배치 N"이다(`info_default_name`)
- `editor_opened`: 저장 뒤 `settings.window`(탭 workspace)가 기록되고 설정 창이 5초 안에 앞 창이 된다
- `name_committed`: 설정 창이 앞에 오고 2초 뒤 `smoke ws`를 입력하고 Enter → `workspace.edit` 성공, `workspaces.json`의 이름이 정확히 `smoke ws`다. 이름 칸 전체가 선택되어 있지 않았으면 기본 이름 뒤에 이어 붙어 False가 된다(`info_name`의 `file_name`으로 확인)
- `title_rules_written`: 같은 실행 파일(powershell.exe) 창 3개의 규칙에 제목 규칙(`titleIncludes`)이 창 제목과 같게 기록되어 있다
- `editor_closed`: Esc·Alt+F4 → `settings.window.closed`

불러오기:

- `palette_ran_workspace`: `@smoke ws` → Enter → `palette.run` id가 그 워크스페이스이고 `workspace.restore`(출처 palette)가 성공
- `a_within_10px`, `b_within_10px`: A(불러오기 전 최소화)·B(불러오기 전 최대화)의 보이는 테두리가 저장할 때와 위치·크기 모두 ±10px 안이다(차이는 `info_a_diff`·`info_b_diff`)
- `c_maximized`: 불러오기 전 보통 상태였던 C가 최대화된다
- `ab_normal`: A·B가 보통 상태다
- `focus_restored`: 불러온 뒤 앞 창이 불러오기 전 앞 창(B)이다. 로그 `workspace.restore`의 `restoredFocus`가 true일 때만 True다
- `mixed_dpi`: B가 배율이 다른 두 번째 모니터에 있을 때 B의 ±10px. 모니터가 1대이거나 배율이 같으면 `skipped`
- `missing_reported`: A를 닫고 다시 불러오면 `workspace.restore`의 missing이 앞 불러오기보다 1 많다(알림에 "못 찾음"이 표시된다)

단축키:

- `ctrl_enter_opens_editor`: `@smoke ws`에서 Ctrl+Enter → `palette.run` id가 `workspace-edit:<id>`이고 설정 창이 앞에 열린다
- `hotkey_registered`: Tab 두 번 → Enter → `Ctrl+Alt+9` → `hotkey.change`(id `workspace:<id>`, 성공)가 기록되고 `workspaces.json`의 hotkey가 `Ctrl+Alt+9`다. False이고 `info_hotkey_hint`가 있으면 캡처 `m7-ws-editor`에서 녹화 칸의 문구("다른 앱이 이 조합을 쓰고 있어요")나 포커스 위치를 확인한다
- `hotkey_restores`: 설정 창을 닫고 B를 옮긴 뒤 `Ctrl+Alt+9` → `workspace.restore`(출처 hotkey) 성공, B가 저장 위치 ±10px

조종 모드(펫이 보일 때만 판정하고, 펫을 숨겨 두었으면 `skipped`):

- `control_ends_before_restore`: 조종 중 `Ctrl+Alt+9` → 로그에서 `pet.control`(end, reason handoff) 줄이 `workspace.restore`(출처 hotkey) 줄보다 앞이다
- `control_focus_returns`: 불러온 뒤 앞 창이 펫 창이 아니라 시험 창(B)이다

바:

- `bar_menu_shown`: 바 워크스페이스 단추 클릭 → `flyout.show`(kind workspace-menu)
- `menu_kept_focus`: 메뉴가 열린 뒤에도 앞 창이 B다
- `bar_restores`: 메뉴 둘째 행(시험이 저장한 워크스페이스. 첫 행은 늘 화면 감추기다) 클릭 → `workspace.restore`(출처 bar) 성공, B가 저장 위치 ±10px

화면 감추기(기본 워크스페이스, 2026-11-12):

- `builtin_created`: 시작 시점의 `workspaces.json`에 기본 워크스페이스(id `builtin-hide`)가 하나 있다. False이면 아래 세 줄은 `skipped`다
- `hide_saved`: C를 최소화한 채 `@화면 감추기` → End → Enter → `workspace.save`(출처 palette, op recapture, id `builtin-hide`) 성공(`info_hide_save`)
- `hide_minimizes_others`: C를 보통 상태로 되돌린 뒤 `@화면 감추기` → Enter → `workspace.hide`(출처 palette)가 기록되고 저장하지 않은 C는 최소화, 저장한 B는 최소화가 아니다(`info_hide`에 내린 창·관리자 권한 창·응답 없는 창 수)
- `hide_press_again_restores`: 한 번 더 `@화면 감추기` → Enter → `workspace.unhide`가 기록되고 C가 보통 상태로 돌아온다. False이고 `info_unhide`에 `the second press hid again`이 있으면 그사이 내린 창 가운데 하나가 스스로 되살아나 다시 감추기로 판정된 것이다(`why`)

로그:

- 아래 `log_has_no_*` 세 줄은 이번 실행의 앱 로그에 `palette.run`이나 `workspace.save` 줄이 하나라도 있어야 판정한다. 없으면 `skipped (no app log lines)`을 출력한다(로그를 읽지 못해 비어 있을 때 "없음"이 True로 나오는 것을 막는다)
- `log_has_no_titles`: 앱 로그에 시험 창 제목(`SureMate-WS`)이 없다
- `log_has_no_names`: 앱 로그에 워크스페이스 이름(`smoke ws`, 기본 이름, `화면 감추기`)이 없다. 있으면 `info_names_in_log`에 출력된다
- `log_has_no_typed_text`: 앱 로그에 이름·제목·문장을 담는 키(`text`·`query`·`sentence`·`phrase`·`input`·`title`·`name`·`label`·`words`·`aliases`·`savedTitle`·`titleIncludes`의 값이 글자나 배열)가 없다

`monitors`는 모니터 수(참고값)다. `info_`로 시작하는 줄도 참고값이다. `info_monitors`는 모니터마다 해상도·배율, `info_save`는 저장한 창 수와 건너뛴 창 수(최소화·셸 창·화면 밖), `info_restore_*`·`info_hotkey_restore`·`info_bar_restore`는 불러오기 결과(창 수·배치한 수·못 찾은 수·최대 차이 px·걸린 ms·포커스 복귀)다.

캡처 2장은 `%TEMP%\sure-mate-smoke`에 저장된다. 설계 §11·§14-4와 대조해 눈으로 확인한다.

- `m7-ws-editor.png`: 설정 창 워크스페이스 탭에 `smoke ws`가 열려 있다. 왼쪽 열에 이름 `smoke ws`, 빈 별칭 칸, 단축키 `Ctrl+Alt+9`와 "쓰는 중", 안내 "이제 Ctrl+Alt+9를 누르면 불러와요"가 있고, 창 배치 구역에 시험 창 규칙(powershell, `SureMate-WS-A`·`B`·`C`, C는 "최대화" 표시)과 '제목에 포함' 칸이 표시된다. 오른쪽 너비 240 열에 모니터 그림(최대화한 C는 오른쪽 위 작은 사각형)과 "불러오기"·"지금 배치로 다시 저장" 단추가 있다. 글자가 잘리거나 겹치지 않는다.
- `m7-flyout-workspaces.png`: 바 워크스페이스 메뉴. 머리 글 "워크스페이스" 아래 `smoke ws` 행(워크스페이스 아이콘, 설명 "창 N개"), 구분선, "지금 배치 저장"(+ 아이콘), "모두 보기·편집"(설정 아이콘, 설명 "설정에서 이름과 단축키를 바꿔요")이 있다. 카드 너비는 272이고 그림자가 잘리지 않는다.

배율이 다른 모니터 2대(예: 노트북 150%·외부 100%)에서 다시 실행한다. B가 두 번째 모니터에 놓이고(`info_b_monitor`) `mixed_dpi`가 True여야 한다. 배율 125%·150%의 모니터 1대에서도 다시 실행해 판정이 배율과 상관없이 True인지 확인한다.

사람이 확인할 것(스크립트가 판정하지 않음):

- 모니터 분리: 모니터 하나를 분리하고 불러오면 "다른 모니터 구성에서 저장한 배치예요. 주 모니터로 모을까요?" 질문이 표시되고, "주 모니터로 모으기"를 선택하면 모든 창이 주 모니터 안으로 모이는지 확인한다(회사 PC 점검표 9번과 같다).
- 관리자 권한 창: 관리자 권한으로 실행한 메모장을 포함해 저장하고 옮긴 뒤 불러오면 메모장은 옮겨지지 않고 알림에 "관리자 권한 창이라 건너뜀"이 표시되는지 확인한다.
- 응답 없는 창은 확인하지 않는다.
- 이미 열린 설정 창: 설정 창을 다른 탭(예: 일반)에 둔 채 팔레트의 워크스페이스 행에서 Ctrl+Enter → 설정 창을 다시 불러오지 않고 워크스페이스 탭으로 바뀌어 그 워크스페이스의 이름 칸이 선택되는지 확인한다.
- 설정 창에서 불러오기: "불러오기" 단추를 누르면 창을 옮긴 뒤 포커스가 설정 창으로 돌아오는지, 다른 모니터 구성일 때 질문 창이 설정 창 앞에 표시되는지 확인한다.
- 다시 저장: 설정 창을 연 채 "지금 배치로 다시 저장" → 창 목록에 설정 창이 포함되지 않는지 확인한다.
- "등록 못 함": 다른 앱이 사용하는 조합을 녹화 칸에 누르면 "다른 앱이 이 조합을 쓰고 있어요"가 표시되고 단축키가 바뀌지 않는지 확인한다. 워크스페이스 단축키를 정한 뒤 앱을 종료하고 다른 앱(예: PowerToys)에 같은 조합을 등록한 다음 다시 실행하면 목록과 상세에 "등록 못 함"과 안내 문구가 표시되는지 확인한다.
- 한글 IME: 이름 칸에 한글 자판으로 이름을 입력하고 마지막 글자를 조합하는 중에 Enter(또는 Tab) → 이름이 한 번만 저장되고 글자가 빠지거나 겹치지 않는지 확인한다.
- 모니터 그림: 배율 125%·150%에서 그림의 선과 모니터 이름표가 흐리지 않은지 확인한다.
- 포커스 표시: Tab으로 탭 안을 이동할 때 이름 칸·별칭 칸·단추·체크 상자·'제목에 포함' 칸에 포커스 테두리가 표시되는지 확인한다.

### t22 결과를 눈으로 확인할 곳

실행: `powershell -NoProfile -ExecutionPolicy Bypass -File .\t22-run.ps1 > t22-out.txt` 뒤 `t22-out.txt`를 연다(약 2분, 최대 7분. 그동안 마우스·키보드를 사용하지 않는다). 시험 창과 팔레트를 가리는 창은 닫아 둔다.

시험 전후의 파일 처리는 다음과 같다.

- 설정 파일(`settings.json`)을 잠시 바꾼다: AI 대상 "복사만", 바는 주 모니터 오른쪽 가장자리 띠, 가명 처리 되돌리기, 첫 실행 안내 완료.
- M7 파일(`workspaces.json`·`phrase-map.json`·`usage.json`·`intents.json`)은 백업한 뒤 지워 빈 상태로 시작한다. 최근 항목·기억한 문장·사용자 단어 목록이 목록 순서를 바꾸지 않게 하기 위해서다. `workspaces.json.bak`도 백업한다. 앱이 시작할 때 만드는 기본 워크스페이스 '화면 감추기'(id `builtin-hide`)만 있는 `workspaces.json`은 빈 상태로 간주한다.
- 끝나면 모두 되돌린다. `.smoke-backup` 파일이 이미 있으면 앞선 시험이 도중에 끊긴 것이므로 시험이 시작하지 않고 멈춘다. 원래 파일과 비교해 정리한 뒤 다시 실행한다.
- 시험 중 클립보드를 사용한다(처음에 가짜 글을 넣고, 가명 되돌리기 단계에서 가짜 글로 바꾸며, 팔레트가 선택 글을 가져오느라 복사 동작을 사용할 수 있다). 시작 전 클립보드가 글자였으면 시험이 종료된 뒤 되돌리고, 파일·그림이 들어 있었다면 되돌릴 수 없으며 출력 끝의 `--- clipboard:` 줄에 그렇게 표시한다. 클립보드 내용은 로그·출력에 남기지 않는다.
- `t22-natural.ps1`을 `run-smoke.ps1`로 직접 실행하면 `t22-run.ps1`이 넘기는 `-FromRunner`가 없으므로 `error =` 줄을 출력하고 멈춘다.

시험은 그때 화면에 열린 창 전체(시험 창 `SureMate-Test` 포함)를 저장하고 세 번 불러온다. 저장한 자리로 다시 옮기는 것이라 위치는 바뀌지 않는다. 다만 최대화한 창은 잠깐 보통 크기가 되었다가 다시 최대화되고, 창 순서는 저장할 때 순서로 돌아온다.

t22는 2026-11-13 Windows 11(배율이 다른 모니터 두 대)에서 처음 실행했다(위 'Windows 확인 결과 (2026-11-13)'). 문장별 맨 위 후보는 리눅스 서버에서 실제 랭커로 계산했다. False가 나오면 스크립트 문제인지 앱 문제인지 먼저 구분한다. 맨 위 후보는 기본 프롬프트·용어 팩만 있는 상태를 기준으로 계산했다. 사용자가 추가한 프롬프트·용어(`%APPDATA%\Sure-Mate\glossary.json` 등)에 '보고서'·'회의록'이 들어 있으면 순서가 달라질 수 있다. 그때는 `info_` 줄의 실행된 id와 캡처로 확인한다.

판정 줄은 모두 `True`여야 한다. 판정 줄이 출력에 없거나 `error`로 시작하는 줄(`error =`, `error_1_save =` 등)이 있으면 그 단계는 실패한 것이다. `skipped (까닭)`은 앞 단계가 성립하지 않아 판정하지 않은 것이므로 까닭을 확인하고 다시 실행한다.

- `workspace_saved`: 팔레트에 `@보고서 모드`를 입력하고 목록 끝 "‘보고서 모드’ 이름으로 지금 배치 저장" 줄(End)에서 Enter → `workspace.save`가 성공하고(출처 palette) `workspaces.json`에 그 id가 이름 '보고서 모드'로 있다. 아래 워크스페이스 판정의 전제다
- `natural_prompt`: '회의록 정리해줘' → Enter → `palette.run` id가 `prompt:meeting-notes`(회의록 정리)
- `english_mode`: 같은 문장을 영문 자판 상태로 입력한 글 'ghldmlfhr wjdflgownj' → 같은 id
- `natural_workspace`: '보고서 모드로 바꿔줘' → `palette.run` id가 저장한 워크스페이스(`workspace:<id>`)이고 그 id의 `workspace.restore`(출처 palette)가 성공
- `natural_unmask`: '가명 되돌려줘' → `palette.run` id가 `cmd.unmask`(가명 되돌리기). 가명 대응표가 비어 있어 "되돌릴 수 없어요" 알림이 표시되는 것이 정상이다
- `remember_learned`: '보고서 띄워줘'(맨 위 주간보고 초안, 둘째 행 보고서 모드) → ↓ 한 번 → Shift+Enter → `phrase.learn`이 기록되고, 실행한 항목이 그 워크스페이스이며, `phrase-map.json`에 그 워크스페이스로 연결된 줄이 하나 있다. False이고 `info_remember`의 `ran`이 다른 id이면 ↓가 다른 행을 선택한 것이다(캡처 `m7-remember`로 확인)
- `learned_top`: 다시 '보고서 띄워줘' → Enter → 기억한 워크스페이스가 실행된다(맨 위). `remember_learned`가 True일 때만 판정한다. 기억하기 안내는 맨 위가 아닌 행에만 표시되므로, 기억하기 전의 맨 위는 그 워크스페이스가 아니었다
- `log_has_no_phrases`, `log_has_no_typed_text`는 이번 실행의 앱 로그에 `palette.run`이나 `workspace.save` 줄이 없으면 `skipped (no app log lines)`을 출력한다
- `log_has_no_phrases`: 앱 로그에 입력 조각(회의록·보고서·가명 되돌려·띄워·바꿔줘·정리해줘·영문 자판 글)이 없다. 있으면 `info_phrases_in_log`에 찾은 조각이 출력된다
- `log_has_no_typed_text`: 앱 로그에 문장을 담는 키(`text`·`query`·`sentence`·`phrase`·`input`·`title`·`name`·`label`·`words`·`aliases`의 값이 글자나 배열)가 없다

`info_`로 시작하는 줄은 참고값이다. `info_save`는 저장한 창 수와 건너뛴 창 수(최소화·셸 창·화면 밖), `info_natural_workspace`는 불러오기 결과(창 수·배치한 수·최대 차이 px·걸린 ms·포커스 복귀), `info_sentences_typed`는 팔레트에 입력한 문장 수(7개 중)다.

캡처 2장은 `%TEMP%\sure-mate-smoke`에 저장된다. 설계 §6·§14-4와 대조해 눈으로 확인한다.

- `m7-natural-chip.png`: 입력줄에 '회의록 정리해줘'가 있고, 프롬프트 구역의 '회의록 정리' 한 행이 선택되어 있다. 행 오른쪽 끝에 의도 표시 '프롬프트'(청록 글자, 옅은 청록 테두리, 높이 20)가 한 줄로 표시되고, 부제가 의도 표시와 겹치지 않고 말줄임으로 줄어든다.
- `m7-remember.png`: 입력줄에 '보고서 띄워줘'가 있다. 맨 위 프롬프트 구역의 '주간보고 초안'에 의도 표시 '프롬프트'가 있고, 그 아래 워크스페이스 구역의 '보고서 모드' 행이 선택되어 오른쪽에 `Shift` `Enter` 키 모양과 "기억하고 실행"이 표시된다. 위키 구역(STR)이 그 아래에 이어진다.

사람이 확인할 것(스크립트가 판정하지 않음):

- 한글 IME로 직접 입력: TypeUnicode(KEYEVENTF_UNICODE)는 IME 조합을 거치지 않는다. 팔레트를 열고 한글 자판으로 '회의록 정리해줘'를 입력한 뒤, 마지막 글자 '줘'를 조합하는 중에 Enter를 누른다. '회의록 정리'가 한 번만 실행되는지(확인 화면이 두 번 열리거나 Enter를 한 번 더 눌러야 하면 기록), 맨 위 행에 '프롬프트' 표시가 있는지 확인한다. Shift+Enter(기억하고 실행)도 같은 방법으로 확인한다. Microsoft IME 새 버전과 이전 버전은 회사 PC 점검표 10번에서 확인한다.
- 의도 표시와 기억하기 안내 문구 검토(설계 §20)는 사람이 한다.
