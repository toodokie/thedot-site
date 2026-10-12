#!/usr/bin/env bash
set -euo pipefail

# Renders the captured, editable studio scenes into two 28-second silent Reels.
# Refresh JPG frames from studio.html in a browser with the Adobe kit loaded after any design edit.
cd "$(dirname "$0")"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

for campaign in agents google; do
  list="$tmp_dir/$campaign.txt"
  : > "$list"
  for number in 00 01 02 03 04 05 06 07; do
    image="rendered/$campaign-$number.jpg"
    clip="$tmp_dir/$campaign-$number.mp4"
    test -s "$image"
    ffmpeg -hide_banner -loglevel error -y \
      -loop 1 -framerate 30 -i "$image" \
      -vf "zoompan=z='min(zoom+0.00024,1.025)':d=1:s=1080x1920:fps=30,format=yuv420p" \
      -frames:v 105 -an -c:v libx264 -preset veryfast -crf 18 -threads 2 \
      "$clip"
    printf "file '%s'\n" "$clip" >> "$list"
  done
  if [[ "$campaign" == agents ]]; then
    target="../agent-boundaries/reel.mp4"
  else
    target="../september-spam-update/reel.mp4"
  fi
  ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$list" \
    -c copy -movflags +faststart "$target"
  ffprobe -v error -show_entries format=duration -show_entries stream=codec_name,width,height,r_frame_rate \
    -of json "$target"
done
