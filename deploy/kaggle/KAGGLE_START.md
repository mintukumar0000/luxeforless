# LuxeForLess — Kaggle VTO single cell (run this only)

**Before running:** Settings → GPU T4 x2, Internet ON, Secret `NGROK_AUTHTOKEN`

**If nothing prints:** Session → Restart Session, then run the code cell below.

## Startup timeline

1. **~1 min** — server starts on port 8000
2. **5–15 min** — AI models load **inside the server** (watch for `AI pipeline ready`)
3. **Then** — ngrok URL prints → paste into Vercel env
4. **Only then** — click Try On in the app (~3–6 min per try-on)

**Do not try on before step 3 completes.** Old bootstrap loaded models in a useless subprocess; try-on then re-loaded everything and hung for 20+ min.

## Env vars (optional)

| Variable | Default | Effect |
|----------|---------|--------|
| `VTO_SKIP_PRELOAD` | off | Skip startup preload (loads on first try-on instead) |
| `VTO_FAST_MODE` | off | 8 steps @ 512px for faster tests |
| `VTO_NUM_TIMESTEPS` | `24` | Quality (24 @ 1080px) |
| `VTO_HP_DEVICE` | `cpu` | Human parser on CPU (saves T4 VRAM) |

See `luxeforless_vto.ipynb` cell 1 for the full bootstrap script.
