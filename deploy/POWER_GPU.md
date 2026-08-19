# Self-Hosted Paid GPU — Match & Exceed FASHN.ai Quality

This doc explains how to get **768px–4K**, **fast inference**, and optionally **sell API access** — without depending on Kaggle free sessions.

---

## What FASHN.ai sells vs what you self-host

| Layer | FASHN.ai (commercial) | Your LuxeForLess stack |
|-------|-------------------------|-------------------------|
| Model | Try-On v1.6, **Try-On Max** (up to 4K) | FASHN VTON **v1.5** (open weights, ~768px) |
| Inference | Optimized multi-GPU fleet | Your single GPU pod |
| Extras | BG remove, product→model, API keys | You build: rembg, studio preprocess, fit layer, outfit builder |
| Speed | ~5–15 sec (their infra) | 60–360 sec on T4; 15–60 sec on A100 |
| Resolution | Up to **4K** (Try-On Max) | Default **768px**; upscale post-process optional |

**You cannot beat FASHN.ai on raw model version alone while staying on v1.5 weights.** To match 4K you either:
- **Upgrade API route** to [Try-On Max](https://docs.fashn.ai/api-reference/tryon-max) (hosted), or
- **Self-host Max-equivalent** when/if open weights ship, or
- **Self-host v1.5 + Real-ESRGAN upscale** (768→2K looks good, not true 4K diffusion)

Your **product moat** is the retail layer (mirror UX, fit scores, outfit builder, store catalog) — not beating their GPU farm on latency alone.

---

## Recommended paid GPU path (production)

### Tier A — RunPod / Vast.ai (best balance)

| GPU | VRAM | ~Try-ons/hr (768px, 20 steps) | Cost/hr | Cost/try-on |
|-----|------|----------------------------------|---------|-------------|
| RTX 4090 | 24GB | ~40–60 | $0.35–0.50 | **$0.006–0.012** |
| A100 40GB | 40GB | ~60–90 | $1.10–1.80 | **$0.012–0.030** |
| L4 | 24GB | ~25–35 | $0.25–0.40 | **$0.007–0.016** |

**Setup:**
1. Deploy `services/vto/Dockerfile` on RunPod pod
2. Mount persistent volume for `weights/` (download once)
3. Set env:
   ```bash
   VTO_NUM_TIMESTEPS=20
   VTO_MAX_IMAGE_SIZE=768
   VTO_DEVICE=cuda
   VTO_ENHANCE_RESULT=true
   VTO_PREPROCESS_PERSON=true
   ```
4. Expose port 8000 → stable HTTPS (Cloudflare tunnel or RunPod proxy)
5. Point Vercel `NEXT_PUBLIC_VTO_SERVICE_URL` to that URL

**Quality boost knobs (self-hosted v1.5):**
```bash
VTO_NUM_TIMESTEPS=24        # sharper, +20% time
VTO_MAX_IMAGE_SIZE=896      # A100 only; may OOM on T4
VTO_UPSCALE=1               # future: Real-ESRGAN 2x after inference
```

### Tier B — FASHN API (fastest to 4K, no GPU ops)

| Endpoint | Resolution | Credits | ~USD (on-demand) |
|----------|------------|---------|------------------|
| v1.6 | ~768px | 1 | $0.075 |
| Try-On Max 2K quality | ~4MP | 4 | $0.30 |
| Try-On Max 4K quality | ~16MP | 5 | $0.375 |

Source: [FASHN API pricing](https://help.fashn.ai/plans-and-pricing/api-pricing)

**Hybrid strategy (recommended for you):**
- **Dev/demo:** RunPod 4090 self-host (~$0.01/try-on)
- **Premium "4K export":** FASHN Try-On Max API for saved looks / QR
- **Your margin:** charge stores $0.15–0.25/try-on bundled in SaaS

---

## How to polish YOUR stack beyond raw FASHN

These are **your** differentiators FASHN.ai doesn't ship as a product:

| Enhancement | Status | Impact |
|-------------|--------|--------|
| Studio person preprocess (rembg + 3:4 canvas) | ✅ | Cleaner try-on input |
| Waist seam repair post-process | ✅ | Fixes upper/lower artifact |
| Fit score + size chart | ✅ | Retail conversion |
| Chained full-outfit VTO | ✅ Stage 1 | Top → bottom on same person |
| Run AI per color SKU | ✅ Stage 1 | Realistic multi-color |
| Hard pose guardrails | ✅ Stage 1 | Fewer garbage inputs |
| Real-ESRGAN 2x upscale | 🔜 Stage 2 | Sharper output without 4K diffusion |
| SAM garment mask for color preview | 🔜 Optional | Better instant preview |
| VTO router (local/cloud/max) | 🔜 Stage 3 | Best quality per tier |

---

## Selling API keys (income stream)

Architecture for **LuxeForLess VTO API** (Stage 4):

```
Customer app → Your API Gateway (FastAPI)
              ├─ API key auth + rate limits
              ├─ Usage metering (Postgres/Redis)
              └─ VTO router
                   ├─ RunPod pool (cheap bulk)
                   └─ FASHN Max (premium tier)
```

**Pricing example you could charge:**
- Starter: 500 try-ons/mo included @ $99/mo store fee
- Overage: $0.12/try-on (your cost ~$0.02–0.08)
- Premium 4K: $0.35/try-on (pass-through + margin)

**Legal:** Apache-2.0 on FASHN v1.5 allows commercial use; audit DWPose/YOLOX/human-parser licenses before reselling. Do **not** brand as official FASHN product.

---

## Quick start: RunPod bootstrap

```bash
# On RunPod pod with CUDA
git clone https://github.com/mintukumar0000/luxeforless.git
cd luxeforless/services/vto
pip install -e ../../vendor/fashn-vton-1.5 rembg uvicorn fastapi
python ../../vendor/fashn-vton-1.5/scripts/download_weights.py --weights-dir ./weights
export VTO_NUM_TIMESTEPS=20 VTO_MAX_IMAGE_SIZE=768 VTO_DEVICE=cuda
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Point Vercel env to `https://your-pod-id.proxy.runpod.net` — no ngrok needed.

---

## Realistic quality expectations

| Goal | Path | Achievable? |
|------|------|-------------|
| Better than current Kaggle | RunPod 4090 + 768px + 24 steps | ✅ Yes |
| Match fashn.ai v1.6 speed | Self-host only with batching + A100 | ⚠️ Hard |
| True 4K try-on | FASHN Try-On Max API or wait for open Max weights | ✅ Via API |
| Beat fashn.ai on retail UX | Your mirror + fit + outfit + inventory | ✅ Your focus |

**Bottom line:** Self-host paid GPU gets you **stable 768px quality at ~$0.01/try-on**. For **4K and Zara-level speed**, use FASHN API as premium tier while your product owns the store experience.
