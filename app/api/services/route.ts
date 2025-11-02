import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { Service, ServiceWithStatus } from "@/types";

export async function GET() {
  try {
    // Get all services with their current status
    const result = await query(`
      SELECT 
        s.*,
        COALESCE(
          (SELECT status FROM status_checks 
           WHERE service_id = s.id 
           ORDER BY checked_at DESC LIMIT 1),
          'unknown'
        ) as current_status,
        (SELECT checked_at FROM status_checks 
         WHERE service_id = s.id 
         ORDER BY checked_at DESC LIMIT 1) as last_checked,
        (
          SELECT COUNT(CASE WHEN status = 'operational' THEN 1 END)::FLOAT / 
                 NULLIF(COUNT(*), 0) * 100
          FROM status_checks
          WHERE service_id = s.id 
            AND checked_at >= NOW() - INTERVAL '30 days'
        ) as uptime_percentage,
        (
          SELECT COUNT(*)
          FROM incidents
          WHERE service_id = s.id 
            AND status != 'resolved'
        ) as active_incidents
      FROM services s
      WHERE s.is_active = true
      ORDER BY s.name
    `);

    const services: ServiceWithStatus[] = result.rows.map((row) => ({
      ...row,
      uptime_percentage:
        row.uptime_percentage != null
          ? Math.round(row.uptime_percentage * 100) / 100
          : null,
    }));

    return NextResponse.json({ services });
  } catch (error) {
    console.error("Error fetching services:", error);
    return NextResponse.json(
      { error: "Failed to fetch services" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, url, description, check_interval } = body;

    if (!name || !url) {
      return NextResponse.json(
        { error: "Name and URL are required" },
        { status: 400 }
      );
    }

    const result = await query(
      `INSERT INTO services (name, url, description, check_interval)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, url, description || null, check_interval || 300]
    );

    return NextResponse.json({ service: result.rows[0] }, { status: 201 });
  } catch (error) {
    console.error("Error creating service:", error);
    return NextResponse.json(
      { error: "Failed to create service" },
      { status: 500 }
    );
  }
}
