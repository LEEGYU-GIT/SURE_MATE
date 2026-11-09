#!/usr/bin/env bash
# 개발 전용: 미리 보기 장면을 배율 1, 1.25, 1.5로 캡처한다.
# 사용: bash scripts/preview/shoot.sh <출력 폴더> <장면 id...>
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "사용법: bash scripts/preview/shoot.sh <출력 폴더> <장면 id...>" >&2
  exit 1
fi

cd "$(dirname "$0")/../.."
OUT="$1"
shift
mkdir -p "$OUT"
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
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT INT TERM

for _ in $(seq 1 50); do
  if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/preview.html"; then break; fi
  sleep 0.2
done
curl -fsS -o /dev/null "http://127.0.0.1:$PORT/preview.html"

for id in "$@"; do
  for f in 1 1.25 1.5; do
    /usr/bin/google-chrome --headless=new --disable-gpu --hide-scrollbars --window-size=$SCENE_W,$((SCENE_H + CHROME_H)) \
      --force-device-scale-factor="$f" --virtual-time-budget=3000 \
      --screenshot="$OUT/$id@$f.png" "http://127.0.0.1:$PORT/preview.html#$id"
    python3 -c "
import sys
from PIL import Image
path, f = sys.argv[1], float(sys.argv[2])
im = Image.open(path)
im.crop((0, 0, round($SCENE_W * f), round($SCENE_H * f))).save(path)
" "$OUT/$id@$f.png" "$f"
  done
done
echo "완료: $OUT"
