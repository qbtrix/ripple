#!/usr/bin/env bash
# review/standup-board/review.sh: one visual review round of the standup-board
# widget. Builds the site, serves it on :4820, renders every spec in specs/
# at 380 and 1024 in light and dark through skills/ripple/scripts/render.mjs,
# stops the server, and assembles round-<N>/sheet.png (each spec at 380 light,
# 380 dark and 1024 light, labelled). Prints each spec's audit counts.
#
# Usage (from anywhere): packages/svelte/review/standup-board/review.sh <N> [--no-build]
# Needs: ImageMagick (magick), Playwright's headless Chromium in the
# ms-playwright cache. render.mjs exits 1 on audit faults; that never stops
# the round, the counts land in round-<N>/<spec>/audit.json.
set -euo pipefail

ROUND="${1:?usage: review.sh <round number> [--no-build]}"
HERE="$(cd "$(dirname "$0")" && pwd)"
SVELTE="$(cd "$HERE/../.." && pwd)"
ROOT="$(cd "$SVELTE/../.." && pwd)"
OUT="$HERE/round-$ROUND"
PORT=4820
GATE="$ROOT/../../scripts/gate"

if [[ "${2:-}" != "--no-build" ]]; then
	if [[ -x "$GATE" ]]; then (cd "$SVELTE" && "$GATE" --scope ripple bun run build:site); else (cd "$SVELTE" && bun run build:site); fi
	# build:site rebuilds core; refresh the copy svelte resolves first.
	rsync -a --delete --exclude node_modules "$ROOT/packages/core/" "$SVELTE/node_modules/@ripple-ui/core/"
fi

(cd "$SVELTE" && exec ../../node_modules/.bin/vite preview --port $PORT --strictPort) >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -sf "http://localhost:$PORT/" >/dev/null && break; sleep 0.5; done

CHROME_PATH="$(ls -d ~/Library/Caches/ms-playwright/chromium_headless_shell-1228/*/chrome-headless-shell | head -1)"
export CHROME_PATH
mkdir -p "$OUT"
TILES=()
for spec in "$HERE"/specs/*.json; do
	name="$(basename "$spec" .json)"
	(cd "$ROOT" && node skills/ripple/scripts/render.mjs "$spec" "$OUT/$name" --base "http://localhost:$PORT" --widths 380,1024 >/dev/null) || true
	echo "$name $(node -e "const a=require('$OUT/$name/audit.json');const c=a.counts??a;console.log(JSON.stringify(c))" 2>/dev/null || echo 'no audit')"
	for shot in 380-light 380-dark 1024-light; do TILES+=(-label "$name $shot" "$OUT/$name/$shot.png"); done
done

kill $SERVER 2>/dev/null || true
magick montage "${TILES[@]}" -tile 3x -geometry '560x>+12+12' -font /System/Library/Fonts/Helvetica.ttc -pointsize 18 -background "#f4f4f5" -depth 8 "$OUT/sheet.png"
echo "sheet: $OUT/sheet.png"
