# Synthetic media fixtures

Generated locally with `node scripts/generate-media-fixtures.mjs`, using FFmpeg synthetic test pattern and sine sources. No user content is included. Files cover JPEG/PNG/WebP/GIF/AVIF, MP3, H.264+AAC MP4, HEVC+AAC MOV, VP9+Opus MKV, silent H.264, a 90-degree rotation matrix and PQ/BT.2020 10-bit HEVC HDR metadata. They are deliberately small; they do not establish 100 MB throughput, real-device playback, photometric HDR correctness or current iPhone camera compatibility. The HEIC fixture is external and documented in docs/media-pipeline.md.
