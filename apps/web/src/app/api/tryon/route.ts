import { NextResponse } from "next/server";

export const maxDuration = 60;

/** Legacy route — cloud app uses browser → Kaggle VTO directly, then POST /api/tryon/complete */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Server-side try-on is disabled in cloud mode. The app submits jobs from the browser to your VTO GPU URL, then saves via /api/tryon/complete.",
    },
    { status: 410 }
  );
}
