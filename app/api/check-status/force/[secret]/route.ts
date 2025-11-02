import { NextResponse } from "next/server";
import { POST as runChecks } from "@/app/api/check-status/route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ secret: string }> }
) {
  const { secret } = await params;
  const expected = process.env.CRON_SECRET || "";
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Reuse the main POST handler with a force header
  const forced = new Request(request.url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${expected}`,
      "x-force-check": "1",
    },
  });

  return runChecks(forced);
}

