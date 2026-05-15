# Scripts

| Command | Description |
|---------|-------------|
| `npm run sync:tiles` | Copies FBX from `/Tiles` into `public/assets/models/` ([sync-tiles.mjs](sync-tiles.mjs)). |
| `npm run process:hud-topbar` | Sharp pipeline for HUD topbar PNGs ([process-hud-topbar-art.mjs](process-hud-topbar-art.mjs)); uses [lib/writePngAtomic.mjs](lib/writePngAtomic.mjs). |
| `npm run process:realm-run-frame` | Sharp pipeline for realm run frame PNG ([process-realm-run-frame.mjs](process-realm-run-frame.mjs)). |
| `npm run strip:ui-bg` | Optional **Python** step: trims light checkerboard margins on listed UI PNGs ([strip_run_summary_png_bg.py](strip_run_summary_png_bg.py)). Requires [Pillow](https://pypi.org/project/pillow/) (`pip install pillow`). On Windows, if `python` is not on PATH, run the script manually with `py` or your Python launcher. |

The Python stripper is **not** a Sharp replacement; it mutates files in `public/assets/ui/` in place. Commit regenerated assets separately if you use it.
