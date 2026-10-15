# Media credits

The demo media here are generated with ffmpeg from its built-in test sources, so they carry no third-party rights.

| File | What | Made with |
| --- | --- | --- |
| chord.m4a | A six-second C major chord, faded in and out | `ffmpeg -f lavfi -i "sine=frequency=261.63:duration=6"` plus 329.63 and 392 Hz, `amix`, `afade`, AAC 40k mono |
| gradient.mp4 | Six seconds of drifting blue gradient, 640x360 | `ffmpeg -f lavfi -i "gradients=s=640x360:d=6:r=24:speed=0.015:c0=0x1877f2:c1=0x0b1f3a:c2=0x6aa8ff"`, H.264 CRF 30 |
| gradient-poster.jpg | The first frame of gradient.mp4 | `ffmpeg -i gradient.mp4 -frames:v 1` |
