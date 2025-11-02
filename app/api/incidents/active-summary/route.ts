import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const [
      { rows: countRows },
      { rows: latestRows },
      { rows: servicesRows },
      { rows: reasonsRows },
    ] = await Promise.all([
      query(`SELECT COUNT(*)::int AS active_count FROM incidents WHERE status != 'resolved'`),
      query(`SELECT MAX(started_at) AS latest_started_at FROM incidents WHERE status != 'resolved'`),
      query(`
        SELECT s.name
        FROM incidents i
        JOIN services s ON s.id = i.service_id
        WHERE i.status != 'resolved'
        GROUP BY s.name
        ORDER BY s.name
      `),
      query(`
        SELECT s.name, ar.reason_text
        FROM incidents i
        JOIN services s ON s.id = i.service_id
        LEFT JOIN announcement_reasons ar ON ar.incident_id = i.id
        WHERE i.status != 'resolved'
        ORDER BY s.name
      `),
    ]);

    const active_count = countRows[0]?.active_count ?? 0;
    const latest_started_at = latestRows[0]?.latest_started_at ?? null;
    const affected_services = servicesRows.map((r: any) => r.name);

    const reasons = reasonsRows.map((r: any) => ({ service: r.name, reason: r.reason_text })).filter((r: any) => r.reason);

    return NextResponse.json({ active_count, latest_started_at, affected_services, reasons });
  } catch (error) {
    console.error("Error fetching active incidents summary:", error);
    return NextResponse.json(
      { error: "Failed to fetch incidents summary" },
      { status: 500 }
    );
  }
}
