"""Process user recordings without modifying the original WAVs.

Usage: python src/process-voices.py /path/to/recordings
Requires ffmpeg. These cuts apply specifically to deadball.wav and fight.wav.
"""
import pathlib
import subprocess
import sys

source = pathlib.Path(sys.argv[1])
dest = pathlib.Path(__file__).resolve().parent.parent / 'docs' / 'audio'
for name, start, end in [('deadball', 0.24, 1.65), ('fight', 0.16, 2.23)]:
    # Keep pauses inside the announcement, and leave room for consonants/tails.
    # Deadball's isolated end transient after a long silence is excluded.
    filters = (
        f'atrim=start={start}:end={end},asetpts=PTS-STARTPTS,'
        'aformat=channel_layouts=mono,highpass=f=140,lowpass=f=6500,'
        'acompressor=threshold=0.12:ratio=2.5:attack=8:release=100:makeup=1.6,'
        'afade=t=in:d=0.008,'
        'aecho=0.8:0.9:45|105|190:0.17|0.11|0.06,'
        'loudnorm=I=-18:TP=-2:LRA=7'
    )
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
                    '-i', str(source / (name + '.wav')), '-af', filters,
                    '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '96k',
                    str(dest / ('v_' + name + '.mp3'))], check=True)
    print('Created', dest / ('v_' + name + '.mp3'))
