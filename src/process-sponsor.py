"""Resize sponsor artwork and encode the two supplied portrait clips for the stadium.
Usage: python src/process-sponsor.py /path/to/original/files
Requires ffmpeg and ffprobe. Original files are never modified.
"""
from pathlib import Path
import subprocess
import sys

source = Path(sys.argv[1])
dest = Path(__file__).resolve().parent.parent / 'docs' / 'media'
dest.mkdir(parents=True, exist_ok=True)


def ffmpeg(*args):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *map(str, args)], check=True)


for original, name, size in [
    ('Screenshot_20231123-233903_4924x2820.png', 'ragtime-logo.webp', '512:-2'),
    ('IMG20190512171611_1360x1020.png', 'ragtime-curry.webp', '384:-2'),
]:
    ffmpeg('-i', source / original, '-vf', 'scale=' + size,
           '-c:v', 'libwebp', '-quality', '84', '-frames:v', '1', dest / name)

for i, original in enumerate([
    '無題のビデオ ‐ Clipchampで作成.mp4',
    '3fbddd15-a2fe-4804-8f5d-4a357e4a626c.mp4',
], 1):
    duration = subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries',
        'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', str(source / original)], text=True).strip()
    # Keep the complete video and its aspect ratio; use the spare space for the sponsor.
    filters = (
        '[0:v]fps=15,scale=230:288:force_original_aspect_ratio=decrease:force_divisible_by=2,'
        'pad=232:288:(ow-iw)/2:(oh-ih)/2:color=0x19373c[left];'
        '[1:v]scale=256:146:force_original_aspect_ratio=decrease,'
        'pad=280:164:(ow-iw)/2:(oh-ih)/2:color=white[brand];'
        '[2:v]scale=280:124:force_original_aspect_ratio=increase,crop=280:124[food];'
        '[brand][food]vstack=inputs=2[ads];'
        '[left][ads]hstack=inputs=2,setsar=1,format=yuv420p[out]'
    )
    ffmpeg('-i', source / original, '-i', dest / 'ragtime-logo.webp',
           '-i', dest / 'ragtime-curry.webp', '-filter_complex', filters,
           '-map', '[out]', '-an', '-t', duration, '-c:v', 'libx264', '-preset', 'slow',
           '-profile:v', 'baseline', '-level', '3.0', '-crf', '32', '-maxrate', '240k',
           '-bufsize', '480k', '-g', '30', '-r', '15', '-fps_mode', 'cfr', '-movflags', '+faststart', dest / f'ragtime-{i:02}.mp4')

for item in sorted(dest.iterdir()):
    print(item.name, item.stat().st_size, 'bytes')
