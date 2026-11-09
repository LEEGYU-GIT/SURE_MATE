#!/usr/bin/env bash
# 개발 전용: 미리 보기 장면을 배율 1, 1.25, 1.5로 캡처한다.
# 사용: bash scripts/preview/shoot.sh <출력 폴더> <장면 id...>
# 필요: Node 22, /usr/bin/google-chrome, python3 + Pillow(캡처를 장면 크기로 자르는 데 사용).
#       Pillow가 없으면 시작 즉시 중단한다. 설치: python3 -m pip install --user Pillow
# Chrome은 실행마다 임시 프로필(--user-data-dir)을 쓰고 끝나면 지운다(공용 계정의 기본 프로필을 건드리지 않는다).
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "사용법: bash scripts/preview/shoot.sh <출력 폴더> <장면 id...>" >&2
  exit 1
fi

if ! python3 -c 'import PIL' 2>/dev/null; then
  echo "python3 Pillow(PIL)가 필요합니다. 설치: python3 -m pip install --user Pillow" >&2
  exit 1
fi

cd "$(dirname "$0")/../.."
OUT="$1"
shift
mkdir -p "$OUT"
PROFILE_DIR="$(mktemp -d "$OUT/chrome-profile.XXXXXX")"
SERVER_PID=""
PORT=4178
# headless=new 는 창 높이에 브라우저 틀(87px)이 포함되어 화면이 그만큼 짧아진다.
# 틀 높이를 더해 창을 만든 뒤 장면 크기(640x600)로 잘라낸다.
SCENE_W=640
SCENE_H=600
CHROME_H=87

./node_modules/.bin/vite build -c vite.preview.config.ts
./node_modules/.bin/vite preview -c vite.preview.config.ts --host 127.0.0.1 --port "$PORT" --strictPort > "$OUT/vite-preview.log" 2>&1 &
SERVER_PID=$!
# 이 스크립트가 띄운 서버만 종료한다(오류·Ctrl+C 포함). 이름으로 프로세스를 죽이지 않는다.
trap 'kill "$SERVER_PID" 2>/dev/null || true; rm -rf "$PROFILE_DIR"' EXIT INT TERM

for _ in $(seq 1 50); do
  if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/preview.html"; then break; fi
  sleep 0.2
done
curl -fsS -o /dev/null "http://127.0.0.1:$PORT/preview.html"

for id in "$@"; do
  for f in 1 1.25 1.5; do
    /usr/bin/google-chrome --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$PROFILE_DIR" --window-size=$SCENE_W,$((SCENE_H + CHROME_H)) \
      --force-device-scale-factor="$f" --virtual-time-budget=3000 \
      --screenshot="$OUT/$id@$f.png" "http://127.0.0.1:$PORT/preview.html#$id"
    python3 -c "
import sys
from PIL import Image
path, f = sys.argv[1], float(sys.argv[2])
w, h = round($SCENE_W * f), round($SCENE_H * f)
im = Image.open(path)
if im.width < w or im.height < h:
    sys.exit('캡처 크기 부족: %s 는 %dx%d, 필요 %dx%d (배율 %s). CHROME_H 확인 필요' % (path, im.width, im.height, w, h, f))
im = im.convert('RGB').crop((0, 0, w, h))
if all(im.getpixel((x, h - 1)) == (0, 0, 0) for x in range(0, w, 8)):
    sys.exit('캡처 맨 아래 줄이 검은색: %s (창 높이가 장면보다 짧음). CHROME_H 확인 필요' % path)
im.save(path)
" "$OUT/$id@$f.png" "$f"
  done
done
echo "완료: $OUT"
