import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const serviceId = parseInt(id);

    if (isNaN(serviceId)) {
      return NextResponse.json(
        { error: "Invalid service ID" },
        { status: 400 }
      );
    }

    // Get service details
    const serviceResult = await query(`SELECT * FROM services WHERE id = $1`, [
      serviceId,
    ]);

    if (serviceResult.rows.length === 0) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }

    // Get 30-day history
    const historyResult = await query(
      `SELECT * FROM status_checks 
       WHERE service_id = $1 
         AND checked_at >= NOW() - INTERVAL '30 days'
       ORDER BY checked_at ASC`,
      [serviceId]
    );

    // Get active incidents
    const incidentsResult = await query(
      `SELECT i.*, 
        (SELECT json_agg(iu ORDER BY iu.created_at DESC)
         FROM incident_updates iu 
         WHERE iu.incident_id = i.id) as updates
       FROM incidents i
       WHERE service_id = $1
       ORDER BY started_at DESC
       LIMIT 10`,
      [serviceId]
    );

    return NextResponse.json({
      service: serviceResult.rows[0],
      history: historyResult.rows,
      incidents: incidentsResult.rows,
    });
  } catch (error) {
    console.error("Error fetching service details:", error);
    return NextResponse.json(
      { error: "Failed to fetch service details" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const serviceId = parseInt(id);
    const body = await request.json();
    const { name, url, description, check_interval, is_active } = body;

    if (isNaN(serviceId)) {
      return NextResponse.json(
        { error: "Invalid service ID" },
        { status: 400 }
      );
    }

    const result = await query(
      `UPDATE services 
       SET name = COALESCE($1, name),
           url = COALESCE($2, url),
           description = COALESCE($3, description),
           check_interval = COALESCE($4, check_interval),
           is_active = COALESCE($5, is_active)
       WHERE id = $6
       RETURNING *`,
      [name, url, description, check_interval, is_active, serviceId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }

    return NextResponse.json({ service: result.rows[0] });
  } catch (error) {
    console.error("Error updating service:", error);
    return NextResponse.json(
      { error: "Failed to update service" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const serviceId = parseInt(id);

    if (isNaN(serviceId)) {
      return NextResponse.json(
        { error: "Invalid service ID" },
        { status: 400 }
      );
    }

    await query(`DELETE FROM services WHERE id = $1`, [serviceId]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting service:", error);
    return NextResponse.json(
      { error: "Failed to delete service" },
      { status: 500 }
    );
  }
}
