# Stage 1 — Full Test Checklist

Complete this after `npm run db:push && npm run db:seed` and VTO GPU is running.

## Setup

1. **Database:** `cd apps/web && npm run db:push && npm run db:seed`
2. **VTO GPU:** Kaggle or RunPod — see `deploy/POWER_GPU.md`
3. **Env (Vercel/local):** `DATABASE_URL`, `NEXT_PUBLIC_VTO_SERVICE_URL`, optional `CRON_SECRET`, optional S3 vars

## Test 1 — Consent + hard guardrails

1. Open `/` → Get Started → Accept consent
2. Capture photo **with arms down, full body**
3. ✅ "Start browsing" only enabled when validation passes
4. Capture bad photo (cropped) → ✅ must Retake, cannot proceed

## Test 2 — AI try-on

1. Browse catalog → tap product
2. Wait for AI result modal
3. ✅ Fit score, size breakdown, disclaimer shown

## Test 3 — Run AI color

1. In result modal → tap Red (or other color)
2. Tap **"Run AI for Red (realistic)"**
3. ✅ New GPU job runs → cached green dot on swatch
4. ✅ Logo stays white, skin unchanged (real AI, not canvas)

## Test 4 — Instant size preview

1. Tap XL vs S without re-running AI
2. ✅ Fit ring updates; cloth region scales (preview)

## Test 5 — Outfit + chosen size

1. Try on item → pick size M → Add to Outfit
2. Save outfit
3. ✅ DB stores variant for size M (not XS)

## Test 6 — Full outfit VTO

1. Add a **top** and **bottom** to outfit builder
2. Tap **Try full outfit (AI)**
3. ✅ Two chained AI runs → one combined result

## Test 7 — Garment Upload Studio

1. `/studio` → upload flat-lay photo
2. ✅ Saved to storage URL (not giant data: URL in DB)
3. Product appears in catalog

## Test 8 — Admin size chart

1. `/admin` → select product → edit chest/waist → Save
2. Re-try-on → ✅ fit scores reflect new chart

## Test 9 — Privacy cron

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-app.vercel.app/api/cron/purge-expired
```
✅ Returns `{ ok: true, purgedSessions: N }`

## Stage 1 complete when

All 9 tests pass. Then proceed to **Stage 2** (kiosk, QR save, analytics, inventory location).
