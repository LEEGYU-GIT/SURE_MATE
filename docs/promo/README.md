# 공모전 게시글 시안

`sure-mate-promo.html`은 사내 공모전 게시글 시안이다. 첫째 탭은 게시글, 둘째 탭은 영상 콘티·촬영 준비물·게시 전 확인·본문 텍스트 초안이다. 같은 파일을 Artifact로 게시해 브라우저에서 보고, `export.cjs`로 게시판에 올릴 이미지를 뽑는다.

## 게시판용 이미지

`images/`에 760px 폭 PNG 일곱 장이 있다. 순서대로 올린다.

| 파일 | 내용 |
|---|---|
| `01-intro.png` | 첫 화면, 이런 순간 |
| `02-workspace.png` | 창 배치, 화면 감추기 |
| `03-ai.png` | 프롬프트 팔레트, 가명 처리 |
| `04-wiki-mate.png` | 용어 카드·상용구, 말랑 메이트 |
| `05-ttree.png` | Ttree·사내 메신저 열기, 이석 미리 알림 |
| `06-how.png` | AI를 이렇게, 설치 |
| `07-info.png` | 한눈에 보기, 궁금한 것, 함께 출품, 마무리 |

`@2x`가 붙은 파일은 같은 그림을 두 배 해상도(1520px)로 뽑은 것이다. 게시판 편집기에서 이미지 너비를 760으로 지정할 수 있으면 `@2x`를 쓰면 배율 125·150% 화면에서도 글자가 흐리지 않다. 너비를 지정할 수 없으면 `@2x` 없는 파일을 쓴다.

## 다시 뽑기

설치 파일 크기·메모리 숫자(한눈에 보는 Sure-Mate 표, 첫 화면의 첨부 파일 크기)를 고친 뒤 Windows에서 다시 뽑는다. 시범 사용자 실측 칸은 두지 않는다(2026-11-13, 게시 전까지 동료 시범 사용이 어렵다). 저장소 루트에서, `ELECTRON_RUN_AS_NODE`를 지운 셸로 실행한다(Claude Code에서 띄운 셸에는 이 변수가 들어 있다).

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
.\desktop\node_modules\electron\dist\electron.exe .\docs\promo\export.cjs
```

- 글꼴(Jua, IBM Plex Sans KR, IBM Plex Mono)을 Google Fonts에서 받으므로 인터넷이 필요하다. 진행 기록 `%TEMP%\sure-mate-promo-export.log`의 `fonts:` 줄에 세 글꼴이 모두 있어야 하고, `written:` 아래에 뽑은 파일과 크기가 나온다. 90초 안에 끝나지 않으면 멈춘 단계를 남기고 끝낸다.
- 화면에 창을 띄우지 않고(offscreen) 그리므로 다른 작업을 방해하지 않는다.
- `data-slice`가 붙은 칸에서 다음 `data-slice` 칸 앞까지가 한 장이다. 칸을 더하거나 나누면 `data-slice`를 옮긴다.
- `--theme dark`는 어두운 테마로 뽑아 파일 이름에 `-dark`를 붙인다(색 확인용).
- 탭 줄, 둘째 탭, 워크스페이스 데모 단추는 이미지에서 뺀다(`.export` 규칙).

## 게시판에 글로 올리기

`board/` 폴더에 게시판 편집기의 HTML(소스) 모드에 붙여넣는 본문이 있다.

| 파일 | 내용 |
|---|---|
| `board/post-design.html` | 시안 첫째 탭과 같은 모양. `node docs/promo/board/inline.mjs`가 시안을 브라우저로 그려 모든 모양을 줄 안 스타일(`style=""`)로 옮겨 만든다(편집기가 `<style>`·클래스를 지워도 남는다). 시안을 고치면 다시 만든다 |
| `board/post.html` | 같은 내용을 짧게 줄인 판(머리 줄, ①②③, 기능 카드, 사용법) |
| `board/post-body.html` | 꾸밈 없는 글만(이미지 자리 표시 포함) |

- 글꼴(Jua, IBM Plex Sans KR)은 맨 위 Google Fonts `<link>`로 부른다. 편집기가 `<link>`를 지우면 맑은 고딕으로 보인다.
- 첨부 파일은 설치 파일, 영상, 이미지만 올린다(프롬프트 텍스트 파일은 첨부하지 않는다).
