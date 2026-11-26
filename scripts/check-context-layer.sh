#!/usr/bin/env bash
#
# docs/context/의 화면 색인이 src/views와 어긋났는지 본다.
#
# docs/context/는 웹 채팅 프로젝트 지식에 이 디렉터리 하나만 올려도 화면 구조를 논의할 수 있게
# 만든 압축 요약이다. 요약이 코드와 어긋나면 없는 것보다 나쁘므로, 셀 수 있는 것은 여기서 센다.
#
#   1. src/views의 디렉터리(그룹)마다 MAP.md 표에 `views/<그룹>/` (n) 행이 있고 n이 실제 파일 수와 같다.
#      최상위 파일은 `views/` 최상위 (n) 행.
#   2. docs/context/ 파일마다 분량 상한.
#
# 연결(CI·.githooks)은 아직 하지 않았다. 손으로 돌린다:
#   bash scripts/check-context-layer.sh

set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT" || exit 2
CTX=docs/context
MAP="$CTX/MAP.md"
STATUS=0

fail() { echo "check-context-layer: $*" >&2; STATUS=1; }

# MAP.md 행에서 "(n)"을 읽는다. 그룹 행이 없으면 빈 값.
documented() {
  grep -F "| $1 (" "$MAP" | head -1 | grep -oE '\(([0-9]+)\)' | tr -d '()'
}

TOTAL=0
ROOT_FILES="$(find src/views -maxdepth 1 -type f | wc -l)"
TOTAL=$((TOTAL + ROOT_FILES))
N="$(documented '`views/` 최상위')"
[ "$N" = "$ROOT_FILES" ] || fail "views/ 최상위: MAP.md ${N:-없음} ≠ 실제 $ROOT_FILES"

for d in src/views/*/; do
  g="$(basename "$d")"
  n="$(find "$d" -type f | wc -l)"
  TOTAL=$((TOTAL + n))
  N="$(documented "\`views/$g/\`")"
  [ "$N" = "$n" ] || fail "views/$g/: MAP.md ${N:-없음} ≠ 실제 $n"
done

echo "views: 파일 $TOTAL개, 그룹 $(find src/views -mindepth 1 -maxdepth 1 -type d | wc -l)개 + 최상위"

check_size() {
  local f="$CTX/$1" cap=$(($2 * 1000))
  [ -f "$f" ] || return 0
  local n
  n="$(wc -c < "$f")"
  [ "$n" -le "$cap" ] || fail "$1 ${n}B > 상한 ${cap}B"
}
check_size MAP.md 4
check_size ARCHITECTURE.md 8
check_size UI-CONTRACT.md 10
check_size CONVENTIONS.md 8

SUM="$(cat "$CTX"/*.md | wc -c)"
[ "$SUM" -le 30000 ] || fail "docs/context 합계 ${SUM}B > 30000B"

[ "$STATUS" -eq 0 ] && echo "check-context-layer: 통과"
exit "$STATUS"
