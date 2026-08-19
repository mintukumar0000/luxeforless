# LuxeForLess — Option A Cloud Deploy (Vercel + Neon + Kaggle)

Split architecture for **free real AI try-on**:

```
Your browser
    → Vercel (Next.js web app)
    → Neon (PostgreSQL)
    → Kaggle GPU + ngrok (VTO / AI inference)
```

---

## Architecture

| Service | Platform | Role | Cost |
|---------|----------|------|------|
| Web app | **Vercel** | UI, API routes, catalog | Free tier |
| Database | **Neon** | Postgres (sessions, products) | Free tier |
| VTO / AI | **Kaggle** + **ngrok** | FASHN try-on, body validation | Free GPU hours |
| Tunnel | **ngrok** | Public HTTPS URL to Kaggle | Free tier |

---

## What was prepared in this repo

- `apps/web/vercel.json` — Vercel build config
- `apps/web/.env.example` — all environment variables
- `apps/web/public/garments/` — demo garment (works on Vercel without disk storage)
- `apps/web/src/lib/vto-client.ts` — browser calls VTO directly (required for Vercel 10s limit)
- `scripts/seed-neon.sh` — seed Neon after first deploy
- `deploy/kaggle/luxeforless_vto.ipynb` — Kaggle notebook
- `deploy/kaggle/run_vto.py` — VTO bootstrap script

---

## Step 1 — Push code to GitHub

Kaggle clones your repo. Vercel deploys from GitHub.

```bash
cd luxeforless
git init   # if not already
git add .
git commit -m "Prepare Option A cloud deployment"
# Create repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/luxeforless.git
git push -u origin main
```

**I need from you:** GitHub repo URL once pushed.

---

## Step 2 — Neon (PostgreSQL)

1. Go to [neon.tech](https://neon.tech) → Sign up (free)
2. **New Project** → name: `luxeforless`
3. Copy the **connection string** (looks like):
   ```
   postgresql://user:pass@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
   ```

### Seed the database (run once from your Mac)

```bash
cd luxeforless
DATABASE_URL='postgresql://...your-neon-url...' ./scripts/seed-neon.sh
```

This creates demo store + 3 sample products.

**I need from you:** Neon `DATABASE_URL` (you can paste in Vercel yourself — don’t share in public chat if sensitive).

---

## Step 3 — Vercel (Web app)

1. Go to [vercel.com](https://vercel.com) → Sign up with GitHub
2. **Add New Project** → Import `luxeforless` repo
3. **Root Directory:** `apps/web`  ← important
4. **Environment Variables:**

| Name | Value |
|------|-------|
| `DATABASE_URL` | Your Neon connection string |
| `NEXT_PUBLIC_VTO_SERVICE_URL` | ngrok URL from Step 4 (add after Kaggle starts) |
| `VTO_SERVICE_URL` | Same ngrok URL (optional, for server proxies) |

5. Click **Deploy**

Your app will be live at `https://luxeforless-xxx.vercel.app`

**Note:** Try-on won’t work until Step 4 (Kaggle + ngrok) is running and env var is set. Redeploy after adding ngrok URL.

---

## Step 4 — ngrok (free tunnel)

1. Go to [ngrok.com](https://ngrok.com) → Sign up (free)
2. Copy your **authtoken** from [dashboard](https://dashboard.ngrok.com/get-started/your-authtoken)
3. Save it — you'll add as Kaggle secret `NGROK_AUTHTOKEN`

Free ngrok URLs change each session. Update Vercel env when you restart Kaggle.

---

## Step 5 — Kaggle (VTO GPU)

1. Go to [kaggle.com](https://kaggle.com) → Sign up
2. **Phone verify** (required for GPU)
3. **Create → New Notebook**
4. **Settings:**
   - Accelerator: **GPU T4 x2** (or P100)
   - Internet: **ON**
5. **Add-ons → Secrets:**
   - Key: `NGROK_AUTHTOKEN` → your ngrok token
6. Upload or import `deploy/kaggle/luxeforless_vto.ipynb`
7. Edit cell 2 — set your GitHub repo URL:
   ```python
   os.environ["LUXEFORLESS_REPO_URL"] = "https://github.com/YOUR_USERNAME/luxeforless.git"
   ```
8. **Run All** cells

First run downloads ~2GB model weights (5–15 min). When ready you'll see:

```
VTO PUBLIC URL (paste into Vercel env):
https://xxxx.ngrok-free.app
```

9. Copy that URL → Vercel → Settings → Environment Variables:
   - `NEXT_PUBLIC_VTO_SERVICE_URL` = `https://xxxx.ngrok-free.app`
10. **Redeploy** Vercel (Deployments → ... → Redeploy)

Verify: open `https://xxxx.ngrok-free.app/health` in browser → should show `"status":"ok"`

---

## Step 6 — Test end-to-end

1. Open your Vercel URL (e.g. `https://luxeforless.vercel.app`)
2. **Get Started** → consent → webcam capture
3. Browse catalog → tap a product → **Try On**
4. Wait ~1–3 min on Kaggle GPU (progress shown in overlay)
5. See AI try-on result + fit score

**Upload Studio** (`/studio`) also works — garment processing runs on Kaggle VTO.

---

## Daily workflow (Kaggle sessions expire)

Each time you want to test:

1. Open Kaggle notebook → **Run All** (GPU session)
2. Copy new ngrok URL
3. Update `NEXT_PUBLIC_VTO_SERVICE_URL` in Vercel → Redeploy
4. Test on Vercel URL

Tip: Keep Kaggle tab open while testing. GPU sessions end after ~9 hours idle or when you close the notebook.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Blank Vercel page | Check Vercel build logs; ensure Root Directory = `apps/web` |
| "Demo not initialized" | Run `./scripts/seed-neon.sh` with Neon DATABASE_URL |
| "Cannot reach VTO service" | Kaggle notebook not running, or wrong ngrok URL in Vercel |
| ngrok browser warning | Click "Visit Site" on ngrok interstitial (free tier) |
| CORS errors | VTO has `allow_origins=["*"]` — restart Kaggle notebook |
| Try-on very slow | Normal on first run (model load). Kaggle GPU ~1–3 min after load |
| Products have no images | Re-run seed; images served from `/garments/sample-garment.webp` |

---

## Optional upgrades (still mostly free)

| Need | Option |
|------|--------|
| Stable VTO URL (no ngrok changes) | Modal.com ($30 free credits/mo) |
| UI demo without GPU | Set `MOCK_VTO=true` on any host |
| Custom domain | Vercel → Domains (free on hobby) |
| More GPU hours | Colab Pro / Kaggle alternate account |

---

## What I need from you

Please complete these and tell me when done (or share what's blocking you):

1. **GitHub** — repo URL after you push luxeforless
2. **Neon** — confirm database seeded (or share if you want me to run seed locally)
3. **Vercel** — project URL after deploy
4. **ngrok** — confirm account + authtoken saved
5. **Kaggle** — confirm GPU notebook running + ngrok URL copied to Vercel

I **cannot** create accounts on your behalf (Vercel/Neon/Kaggle/ngrok need your login), but once you share the GitHub URL I can help verify deploy settings and fix any build errors.

---

## Quick reference — environment variables

```bash
# Vercel (production)
DATABASE_URL=postgresql://...@neon.tech/neondb?sslmode=require
NEXT_PUBLIC_VTO_SERVICE_URL=https://YOUR-NGROK.ngrok-free.app

# Kaggle notebook secrets
NGROK_AUTHTOKEN=your_ngrok_token

# Kaggle notebook env (in cell)
LUXEFORLESS_REPO_URL=https://github.com/YOUR_USERNAME/luxeforless.git
VTO_NUM_TIMESTEPS=4
```
