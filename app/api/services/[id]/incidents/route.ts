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

    const result = await query(
      `SELECT i.*, 
        (SELECT json_agg(iu ORDER BY iu.created_at DESC)
         FROM incident_updates iu 
         WHERE iu.incident_id = i.id) as updates
       FROM incidents i
       WHERE service_id = $1
       ORDER BY started_at DESC`,
      [serviceId]
    );

    return NextResponse.json({ incidents: result.rows });
  } catch (error) {
    console.error("Error fetching incidents:", error);
    return NextResponse.json(
      { error: "Failed to fetch incidents" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const serviceId = parseInt(id);
    const body = await request.json();
    const { title, description, severity, status } = body;

    if (isNaN(serviceId)) {
      return NextResponse.json(
        { error: "Invalid service ID" },
        { status: 400 }
      );
    }

    const result = await query(
      `INSERT INTO incidents (service_id, title, description, status, severity, started_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [
        serviceId,
        title,
        description || null,
        status || "investigating",
        severity || "major",
      ]
    );

    return NextResponse.json({ incident: result.rows[0] }, { status: 201 });
  } catch (error) {
    console.error("Error creating incident:", error);
    return NextResponse.json(
      { error: "Failed to create incident" },
      { status: 500 }
    );
  }
}
