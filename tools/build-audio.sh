#!/usr/bin/env bash
# Rebuild audio/*.mp3 from the CC0 sources listed in audio/CREDITS.md.
# usage: bash tools/build-audio.sh <dir with the downloaded sources, extracted>
# Needs ffmpeg. Output: mono mp3, trimmed, loudness-normalised.
set -euo pipefail
SRC="$1"; OUT="$(dirname "$0")/../audio"; mkdir -p "$OUT"
enc() { ffmpeg -v error -y "$@"; }
norm="loudnorm=I=-20:TP=-2"
# loops
enc -i "$SRC/drip.flac"    -ac 1 -af "$norm" -b:a 48k "$OUT/amb_drip.mp3"
enc -i "$SRC/dungeon.ogg"  -ac 1 -af "$norm" -b:a 40k "$OUT/amb_drone.mp3"
enc -i "$SRC/x/mb/musicbox2_cute_tune.ogg" -t 42 -ac 1 -af "afade=t=out:st=39:d=3,$norm" -b:a 48k "$OUT/guide_musicbox.mp3"
enc -i "$SRC/x/mb/musicbox3_sad_tune.ogg"  -t 42 -ac 1 -af "afade=t=out:st=39:d=3,$norm" -b:a 48k "$OUT/guide_sad.mp3"
# one-shots
enc -i "$SRC/wave2.flac" -ac 1 -af "$norm" -b:a 48k "$OUT/water_flow.mp3"
for i in 1 3 4; do enc -i "$SRC/x/splash/ezwa-water_splash/water_splash-0$i.flac" -ac 1 -b:a 64k "$OUT/splash_$i.mp3"; done
for i in 0 1 2 3 4; do enc -i "$SRC/x/impact/Audio/footstep_concrete_00$i.ogg" -ac 1 -b:a 64k "$OUT/step_$i.mp3"; done
enc -i "$SRC/x/ui/Audio/confirmation_002.ogg" -ac 1 -b:a 64k "$OUT/pickup.mp3"
ls -la "$OUT"; du -ch "$OUT"/*.mp3 | tail -1
