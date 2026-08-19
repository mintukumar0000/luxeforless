# LuxeForLess — Kaggle VTO single cell (run this only)

**Before running:** Settings → GPU T4 x2, Internet ON, Secret `NGROK_AUTHTOKEN`

**If nothing prints:** Session → Restart Session, then run the code cell below.

**If stuck at `[3.5/4] Pre-loading AI pipeline`:** Interrupt the cell, `git pull` in `/kaggle/working/luxeforless`, re-run. Preload now runs **in background** — you should see the ngrok URL within ~1–2 min while the human parser loads on CPU (10–20 min).

## Env vars (optional)

| Variable | Default | Effect |
|----------|---------|--------|
| `VTO_PRELOAD_BACKGROUND` | `1` | Start server + ngrok immediately; preload in background |
| `VTO_SKIP_PRELOAD` | off | Skip preload; first try-on loads all models |
| `VTO_NUM_TIMESTEPS` | `20` | Quality (20 @ 768px). Use `8` + `VTO_FAST_MODE=1` for faster tests |
| `VTO_HP_DEVICE` | `cpu` | Human parser on CPU (saves T4 VRAM) |

## After ngrok URL appears

1. Copy HTTPS URL → Vercel → `NEXT_PUBLIC_VTO_SERVICE_URL` and `VTO_SERVICE_URL`
2. Redeploy Vercel if env changed
3. First try-on may wait until background preload finishes (watch Kaggle logs)

See `luxeforless_vto.ipynb` cell 1 for the full bootstrap script.
