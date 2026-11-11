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

설정을 잠시 바꾸는 `t14-run.ps1`·`t16-run.ps1`·`t18-run.ps1`·`t20-run.ps1`의 출력은 `Select-Object -First`로 자르지 말고 파일로 받아 읽는다. 파이프가 일찍 끊기면 되돌리기(`finally`)가 돌지 않아 `settings.json`이 시험 값으로 남는다.

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

실행: `powershell -NoProfile -ExecutionPolicy Bypass -File .\t20-run.ps1 > t20-out.txt` 뒤 `t20-out.txt`를 연다(약 6~8분, 그동안 마우스·키보드를 사용하지 않는다. 스크립트가 직접 누르고 옮긴다). 5분 동안 입력하지 않고 CPU만 재는 실행은 `.\t20-run.ps1 -Idle > t20-idle-out.txt`(약 6분)다. 시험 창과 바를 가리는 창은 닫아 둔다. 설정 파일(`settings.json`)과 가명 사전(`masking-dictionary.json`)의 `.smoke-backup` 파일이 이미 있으면 앞선 시험이 도중에 끊긴 것이므로 시험이 시작하지 않고 멈춘다. 원래 파일과 비교해 정리한 뒤 다시 실행한다.

t20은 아직 Windows에서 실행한 적이 없다(리눅스 서버에서 작성해 구문과 로그 항목만 정적으로 확인했다). 처음 실행에서 False가 나오면 스크립트 문제인지 앱 문제인지 먼저 구분한다(좌표 계산·펫 창 찾기는 스크립트 쪽 가정이다).

판정 줄은 모두 `True`여야 한다. 아래 판정 줄이 출력에 없거나 `error`로 시작하는 줄(`error =`, `error_1_flow =` 등)이 있으면 그 단계는 실패한 것이다. 단계가 도중에 멈춰도 다음 단계는 이어서 실행한다.

- 시작: `bar_place_found`, `pet_bar_flow_within_60s`(앱이 시작하고 60초 안에 바를 오른 뒤 꼭대기에 앉음, `info_pet_flow`에 상태 순서와 걸린 시간)
- 클릭 통과: `click_through_transparent`(펫 몸 밖의 시험 단추가 눌림), `click_on_pet_received`(몸 클릭은 펫이 받고 단추는 안 눌림), `pet_click_kept_focus`(앞 창이 시험 창 그대로), `taskbar_click_ok`(작업 표시줄 빈 곳을 누른 뒤 2초 안에 바가 다시 맨 위, 작업 표시줄이 자동 숨김이면 건너뜀 표시, 걸린 시간은 `info_taskbar_ms`)
- 두 번 클릭: `double_click_opens_palette`(0.15초 간격으로 두 번 누르면 팔레트)
- 집어 던지기: `thrown_lands_on_floor`(발이 작업 영역 아래 끝에 닿음, `info_throw`에 발 위치와 상태 순서), `dropped_on_bar_sits`(바 꼭대기 위 40 DIP에서 놓으면 1초 안에 앉음, `info_drop`), `click_through_after_drag`(놓고 0.2초 안에 시험 단추가 다시 눌림)
- 메뉴: `pet_menu_opened`, `menu_hide_row_works`(숨기기), `recall_via_bar_button`(바 펫 단추로 다시 부름), `menu_first_row_after_recall`(다시 부른 직후 첫 행 "조종하기"가 한 번에 눌림)
- 조종 모드: `control_walks`(←를 1초 누르면 왼쪽으로 이동, `info_control_walk`), `control_esc_ends`, `control_esc_restores_focus`(Esc로 끝나고 앞 창이 시험 창), `alt_space_keeps_control`, `alt_f4_ends_control`, `alt_f4_keeps_pet_window`(Alt+F4는 펫 창을 닫지 않고 조종만 끝냄), `control_palette_keeps_focus`, `control_palette_ends_control`(조종 중 팔레트를 열면 팔레트가 포커스를 갖고 조종은 끝남)
- 반응: `reaction_within_1s`(고정 프롬프트 복사 후 1초 안에 축하, 걸린 시간은 `info_reaction_ms`), `warning_on_masking_off`(가명 처리를 끄고 복사하면 경고), `masking_restored`
- 다시 나타난 직후: `first_click_after_reappear`, `first_drag_after_reappear`(숨겼다 바 펫 단추로 부른 직후 첫 클릭·첫 끌기). 펫 창은 숨길 때 `hide()`를 쓰므로 첫 누름이 드물게(약 40번에 1번) 사라질 수 있다. 한 번만 False면 다시 실행해 보고, 반복되면 앱 문제로 기록한다
- 전체 화면: `pet_hides_fullscreen`(1.1초 안에 숨고 닫으면 1.1초 안에 다시 나타남, `info_fullscreen_ms`), `menu_first_row_after_fullscreen`(전체 화면이 끝난 직후 첫 메뉴 행)
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
- 작업 표시줄을 왼쪽으로 옮기고, 또 자동 숨김으로 바꿔 다시 실행해 펫이 새 바닥(작업 영역 아래 끝)에 서는지 확인한다. 자동 숨김이면 `taskbar_click_ok`는 건너뜀으로 나온다.
- 조종 모드에서 작업 표시줄에 단추가 생기지 않는지, 설정 창을 눌러도 포커스가 설정 창에 남는지는 `docs/reports/company-pc-checklist.md` 8번에서 사람이 확인한다.
- 펫 말풍선 문구 검토(설계 §20: 존댓말, 짧게)는 사람이 한다.
