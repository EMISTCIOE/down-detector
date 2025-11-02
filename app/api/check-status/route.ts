import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSupabaseServer } from "@/lib/supabase-server";
import { checkServiceStatus } from "@/lib/status-utils";

export async function POST(request: Request) {
  try {
    // Verify cron secret for security
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const forceHeader = String(request.headers.get("x-force-check") || "").toLowerCase();
    const force = forceHeader === "1" || forceHeader === "true";

    // Get services: either only those due, or all (force)
    const servicesResult = await query(
      force
        ? `SELECT * FROM services WHERE is_active = true`
        : `
      WITH last_check AS (
        SELECT DISTINCT ON (service_id) service_id, checked_at
        FROM status_checks
        ORDER BY service_id, checked_at DESC
      )
      SELECT s.*
      FROM services s
      LEFT JOIN last_check lc ON lc.service_id = s.id
      WHERE s.is_active = true
        AND (
          lc.checked_at IS NULL OR lc.checked_at <= NOW() - make_interval(secs => s.check_interval)
        )
      `
    );

    const services = servicesResult.rows;
    const results: Array<{ service: string; status: string; response_time: number | null }> = [];
    const supabase = getSupabaseServer();

    // Check services concurrently for better performance
    // Limit concurrency to reduce compute spikes
    const poolSize = 5;
    let i = 0;
    async function worker() {
      while (i < services.length) {
        const service = services[i++];
        const statusResult = await checkServiceStatus(service.url);

        // Collect the result; batch insert later
        collected.push({
          id: service.id,
          name: service.name,
          ...statusResult,
        });

        // Incident management + announcement reason persistence
        if (statusResult.status === "down") {
          // Ensure there's not already an active incident
          const active = await query(
            `SELECT id FROM incidents WHERE service_id=$1 AND status!='resolved' ORDER BY started_at DESC LIMIT 1`,
            [service.id]
          );
          let incidentId: number | null = active.rows[0]?.id ?? null;
          if (!incidentId) {
            const created = await query(
              `INSERT INTO incidents (service_id, title, description, status, severity, started_at)
               VALUES ($1,$2,$3,$4,$5,NOW()) RETURNING id`,
              [
                service.id,
                `${service.name} is down`,
                statusResult.error_message || "Service is not responding",
                "investigating",
                "major",
              ]
            );
            incidentId = created.rows[0].id as number;

            // Pick a reason template and persist it for this incident
            const templates = supabase
              ? (await supabase.from("announcement_reason_templates").select("code,label,weight")).data || []
              : [];
            let reasonCode = "SERVER";
            let reasonText = "Server maintenance or outage";
            if (templates.length > 0) {
              // Weighted random
              const expanded: Array<{ code: string; label: string }> = [];
              templates.forEach((t: any) => {
                const w = Math.max(1, Number(t.weight) || 1);
                for (let i = 0; i < w; i++) expanded.push({ code: t.code, label: t.label });
              });
              const pick = expanded[Math.floor(Math.random() * expanded.length)];
              if (pick) {
                reasonCode = pick.code;
                reasonText = pick.label;
              }
            }

            if (supabase) {
              await supabase.from("announcement_reasons").insert({
                incident_id: incidentId,
                service_id: service.id,
                reason_code: reasonCode,
                reason_text: reasonText,
              });
            } else {
              await query(
                `INSERT INTO announcement_reasons (incident_id, service_id, reason_code, reason_text)
                 VALUES ($1,$2,$3,$4) ON CONFLICT (incident_id) DO NOTHING`,
                [incidentId, service.id, reasonCode, reasonText]
              );
            }
          }
        } else if (statusResult.status === "operational") {
          // Auto-resolve any active incidents in a single query, then add one update per resolved incident
          const resolved = await query(
            `UPDATE incidents 
             SET status = 'resolved', resolved_at = NOW()
             WHERE service_id = $1 AND status != 'resolved'
             RETURNING id`,
            [service.id]
          );

          if (resolved.rows.length > 0) {
            // Remove announcement reasons for these incidents
            const ids = resolved.rows.map((r: any) => r.id);
            if (supabase) {
              await supabase.from("announcement_reasons").delete().in("incident_id", ids);
            } else {
              await query(`DELETE FROM announcement_reasons WHERE incident_id = ANY($1::int[])`, [ids]);
            }

            const values: any[] = [];
            const placeholders: string[] = [];
            resolved.rows.forEach((row: any, idx: number) => {
              placeholders.push(`($${idx * 3 + 1}, $${idx * 3 + 2}, $${idx * 3 + 3})`);
              values.push(row.id, "Service has been restored and is operational", "resolved");
            });
            await query(
              `INSERT INTO incident_updates (incident_id, message, status) VALUES ${placeholders.join(",")}`,
              values
            );
          }
        }

        results.push({
          service: service.name,
          status: statusResult.status,
          response_time: statusResult.response_time,
        });
      }
    }

    // Prepare batch containers
    const collected: Array<{
      id: number;
      name: string;
      status: string;
      response_time: number | null;
      status_code: number | null;
      error_message: string | null;
    }> = [];

    // Start worker pool
    const workers = Array.from({ length: Math.min(poolSize, services.length) }, () => worker());
    await Promise.all(workers);

    // Batch insert status checks in a single query
    if (collected.length > 0) {
      const placeholders: string[] = [];
      const values: any[] = [];
      collected.forEach((r, i) => {
        const base = i * 5;
        // Note: service_id is pushed separately at the end of the row
        placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
        values.push(r.id, r.status, r.response_time, r.status_code, r.error_message);
      });
      await query(
        `INSERT INTO status_checks (service_id, status, response_time, status_code, error_message)
         VALUES ${placeholders.join(",")}`,
        values
      );
    }

    // Cleanup old status checks (older than configured 30 days)
    await query(`SELECT cleanup_old_status_checks()`);

    return NextResponse.json({
      success: true,
      checked: results.length,
      results,
    });
  } catch (error) {
    console.error("Error checking service status:", error);
    return NextResponse.json(
      { error: "Failed to check service status" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  // Allow GET requests for manual triggering (with secret)
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  const forceParam = String(searchParams.get("force") || "").toLowerCase();

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Create a new request object for POST
  const postRequest = new Request(request.url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.CRON_SECRET}`,
      "x-force-check": forceParam === "1" || forceParam === "true" ? "1" : "0",
    },
  });

  return POST(postRequest);
}
