#!/bin/sh
# Runs the commands KROMA gives ffmpeg and ffprobe (HLS, downloads, subtitles,
# storyboards, images, loudness, markers, whisper, the demo seed) against a
# build, so a recipe that drops something the server needs fails here.
# Usage: check.sh <bin-dir> <x86_64|aarch64>
set -u
F=$1; ARCH=$2; ok=0; bad=0
run() {
  name=$1
  shift
  if "$@" >/tmp/out.log 2>&1; then
    ok=$((ok + 1))
  else
    bad=$((bad + 1))
    echo "FAIL $name"
    tail -3 /tmp/out.log
  fi
  return 0
}
cd /tmp
run demo-mkv $F/ffmpeg -y -hide_banner -f lavfi -i testsrc2=s=1280x720:d=6 -f lavfi -i sine=d=6 -f srt -i /dev/null -c:v libx264 -preset ultrafast -g 25 -c:a aac -map 0 -map 1 demo.mkv
printf '1\n00:00:00,500 --> 00:00:02,000\nHello\n' > s.srt
run demo-subs $F/ffmpeg -y -hide_banner -i demo.mkv -i s.srt -map 0 -map 1 -c copy -c:s srt demo2.mkv
run hls $F/ffmpeg -y -hide_banner -readrate 4 -readrate_initial_burst 2 -noaccurate_seek -ss 1 -i demo2.mkv -copyts -map 0:v:0 -map 0:a:0 -c:v libx264 -preset veryfast -crf 21 -force_key_frames "expr:gte(t,n_forced*2)" -c:a aac -ac 2 -b:a 192k -af "acompressor=threshold=0.04:ratio=8:attack=4:release=250:knee=5,volume=0.9" -progress p.txt -stats_period 1 -f hls -hls_segment_type fmp4 -hls_flags independent_segments+temp_file -hls_time 2 out.m3u8
run hls-copy $F/ffmpeg -y -hide_banner -i demo2.mkv -map 0:v:0 -c:v copy -map 0:a:0 -c:a copy -f hls -hls_segment_type fmp4 c.m3u8
run burst-flag sh -c "$F/ffmpeg -hide_banner -h full | grep -q readrate_initial_burst"
run download sh -c "$F/ffmpeg -hide_banner -i demo2.mkv -map 0:v:0 -map 0:a:0 -c:v copy -c:a aac -movflags frag_keyframe+default_base_moof -f mp4 pipe:1 > d.mp4"
run download-x264 sh -c "$F/ffmpeg -hide_banner -i demo2.mkv -c:v libx264 -preset veryfast -crf 21 -pix_fmt yuv420p -c:a aac -movflags frag_keyframe+default_base_moof -f mp4 pipe:1 > d2.mp4"
run webvtt sh -c "$F/ffmpeg -hide_banner -i demo2.mkv -map 0:s:0 -f webvtt - | grep -q Hello"
run webvtt-ext sh -c "$F/ffmpeg -hide_banner -i s.srt -f webvtt - | grep -q Hello"
run probe-json sh -c "$F/ffprobe -v error -show_format -show_streams -show_chapters -of json demo2.mkv | grep -q codec_name"
run probe-dur sh -c "$F/ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 demo2.mkv | grep -q '[0-9]'"
run probe-kf sh -c "$F/ffprobe -v error -select_streams v:0 -skip_frame nokey -read_intervals 2%+#1 -show_entries frame=pts_time -of csv=p=0 demo2.mkv | grep -q '[0-9]'"
run tile $F/ffmpeg -y -hide_banner -skip_frame nokey -i demo2.mkv -vf "fps=1,scale=160:90:force_original_aspect_ratio=increase,crop=160:90" -pix_fmt rgb24 t%04d.png
run gap $F/ffmpeg -y -hide_banner -f lavfi -i color=c=black:s=160x90 -frames:v 1 gap.png
run sheet $F/ffmpeg -y -hide_banner -i t%04d.png -vf tile=3x2 -frames:v 1 sheet.png
run sheet-jpg $F/ffmpeg -y -hide_banner -i sheet.png -c:v mjpeg -huffman optimal -q:v 4 sheet.jpg
run webp $F/ffmpeg -y -hide_banner -i sheet.png -vf scale=320:-1:flags=lanczos -c:v libwebp -q:v 80 -compression_level 4 x.webp
run png $F/ffmpeg -y -hide_banner -i sheet.png -vf "scale=200:-1,crop=200:40" y.png
run loudness sh -c "$F/ffmpeg -hide_banner -i demo2.mkv -filter_complex '[0:a:0]asplit=2[a][b];[a]loudnorm=print_format=json[o1];[b]pan=mono|c0=FC,loudnorm=print_format=json[o2]' -map '[o1]' -f null - -map '[o2]' -f null - 2>&1 | grep -q input_i"
run marker-audio sh -c "$F/ffmpeg -hide_banner -sseof -4 -t 2 -i demo2.mkv -vn -ac 1 -ar 11025 -f s16le - | wc -c | grep -qv '^0$'"
run marker-video sh -c "$F/ffmpeg -hide_banner -skip_frame nokey -i demo2.mkv -vf fps=1,scale=160:90,format=gray -f rawvideo - | wc -c | grep -qv '^0$'"
run whisper sh -c "$F/ffmpeg -hide_banner -i demo2.mkv -vn -map 0:a:0 -ac 1 -ar 16000 -f f32le - | wc -c | grep -qv '^0$'"
run hevc-decode $F/ffmpeg -hide_banner -f lavfi -i testsrc2=d=1 -f null -
run av1-decode-lib sh -c "$F/ffmpeg -hide_banner -decoders | grep -q libdav1d"
if [ "$ARCH" = x86_64 ]; then
  run hw-encoders sh -c "$F/ffmpeg -hide_banner -encoders | grep -c 'h264_\(vaapi\|qsv\|nvenc\)' | grep -q 3"
  run hwaccels sh -c "$F/ffmpeg -hide_banner -hwaccels | grep -q vaapi"
  run libva-api sh -c "grep -q vaMapBuffer2 $F/../lib/libva.so.2 && grep -q vaGetDisplayDRM $F/../lib/libva-drm.so.2"
fi
run no-network sh -c "! $F/ffmpeg -hide_banner -protocols | grep -qw https"
echo "ok=$ok bad=$bad"
[ "$bad" -eq 0 ]
