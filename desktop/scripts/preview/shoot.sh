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

./node_modules/.bin/vite build -c vite.preview.config.ts
./node_modules/.bin/vite preview -c vite.preview.config.ts --host 127.0.0.1 --port "$PORT" --strictPort > "$OUT/vite-preview.log" 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT

for _ in $(seq 1 50); do
  if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/preview.html"; then break; fi
  sleep 0.2
done
curl -fsS -o /dev/null "http://127.0.0.1:$PORT/preview.html"

for id in "$@"; do
  for f in 1 1.25 1.5; do
    /usr/bin/google-chrome --headless=new --disable-gpu --hide-scrollbars --window-size=640,600 \
      --force-device-scale-factor="$f" --virtual-time-budget=3000 \
      --screenshot="$OUT/$id@$f.png" "http://127.0.0.1:$PORT/preview.html#$id"
  done
done
echo "완료: $OUT"
