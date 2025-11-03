import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import path from "path";
import { promises as fs } from "fs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ServiceRow = {
  id: number;
  name: string;
  url: string;
  uptime_percentage: number | null;
  avg_response_time_ms: number | null;
  total_checks: number;
  incidents_30d: number;
};

type ReportData = {
  range_days: number;
  generated_at: string;
  services_count: number;
  avg_uptime_across_services: number | null;
  total_checks: number;
  total_incidents_30d: number;
  resolved_incidents_30d: number;
  mttr_minutes_30d: number | null;
  services: ServiceRow[];
  daily_uptime: Array<{ date: string; uptime_percentage: number | null }>;
  incidents_daily: Array<{ date: string; count: number }>;
  status_distribution: { operational: number; degraded: number; down: number };
  incidents_by_severity: { minor: number; major: number; critical: number };
};

async function getReportData(rangeDays = 30): Promise<ReportData> {
  // Services with per-service metrics
  const servicesRes = await query(
    `
    SELECT
      s.id,
      s.name,
      s.url,
      (
        SELECT COUNT(CASE WHEN sc.status = 'operational' THEN 1 END)::FLOAT 
               / NULLIF(COUNT(*), 0) * 100
        FROM status_checks sc
        WHERE sc.service_id = s.id
          AND sc.checked_at >= NOW() - make_interval(days => $1)
      ) AS uptime_percentage,
      (
        SELECT AVG(sc.response_time)::FLOAT
        FROM status_checks sc
        WHERE sc.service_id = s.id
          AND sc.checked_at >= NOW() - make_interval(days => $1)
          AND sc.response_time IS NOT NULL
      ) AS avg_response_time_ms,
      (
        SELECT COUNT(*)
        FROM status_checks sc
        WHERE sc.service_id = s.id
          AND sc.checked_at >= NOW() - make_interval(days => $1)
      ) AS total_checks,
      (
        SELECT COUNT(*)
        FROM incidents i
        WHERE i.service_id = s.id
          AND i.started_at >= NOW() - make_interval(days => $1)
      ) AS incidents_30d
    FROM services s
    WHERE s.is_active = true
    ORDER BY s.name
    `,
    [rangeDays]
  );

  const services: ServiceRow[] = servicesRes.rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    url: r.url,
    uptime_percentage:
      r.uptime_percentage != null
        ? Math.round(Number(r.uptime_percentage) * 100) / 100
        : null,
    avg_response_time_ms:
      r.avg_response_time_ms != null
        ? Math.round(Number(r.avg_response_time_ms))
        : null,
    total_checks: Number(r.total_checks || 0),
    incidents_30d: Number(r.incidents_30d || 0),
  }));

  const services_count = services.length;

  // Overall metrics
  const [incAll, incResolved, mttr, checksTotal] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS c FROM incidents WHERE started_at >= NOW() - make_interval(days => $1)`,
      [rangeDays]
    ),
    query(
      `SELECT COUNT(*)::int AS c FROM incidents WHERE resolved_at IS NOT NULL AND resolved_at >= NOW() - make_interval(days => $1)`,
      [rangeDays]
    ),
    query(
      `SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - started_at)))/60 AS mttr_minutes
       FROM incidents
       WHERE resolved_at IS NOT NULL AND resolved_at >= NOW() - make_interval(days => $1)`,
      [rangeDays]
    ),
    query(
      `SELECT COUNT(*)::int AS c FROM status_checks WHERE checked_at >= NOW() - make_interval(days => $1)`,
      [rangeDays]
    ),
  ]);

  const total_incidents_30d = Number(incAll.rows[0]?.c || 0);
  const resolved_incidents_30d = Number(incResolved.rows[0]?.c || 0);
  const mttr_minutes_30d_raw = mttr.rows[0]?.mttr_minutes;
  const mttr_minutes_30d =
    mttr_minutes_30d_raw != null
      ? Math.round(Number(mttr_minutes_30d_raw) * 100) / 100
      : null;
  const total_checks = Number(checksTotal.rows[0]?.c || 0);

  // Average of per-service uptimes (ignoring nulls)
  const uptimeValues = services
    .map((s) => s.uptime_percentage)
    .filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
  const avg_uptime_across_services =
    uptimeValues.length > 0
      ? Math.round(
          (uptimeValues.reduce((a, b) => a + b, 0) / uptimeValues.length) * 100
        ) / 100
      : null;

  // Daily uptime across all services (percentage of operational checks per day)
  const dailyUptimeRes = await query(
    `WITH days AS (
       SELECT gs::date AS day
       FROM generate_series(current_date - make_interval(days => $1), current_date, interval '1 day') gs
     ), agg AS (
       SELECT date_trunc('day', sc.checked_at)::date AS day,
              COUNT(*)::float AS total,
              COUNT(*) FILTER (WHERE sc.status = 'operational')::float AS ok
       FROM status_checks sc
       WHERE sc.checked_at >= NOW() - make_interval(days => $1)
       GROUP BY 1
     )
     SELECT d.day,
            CASE WHEN a.total > 0 THEN a.ok / a.total * 100 ELSE NULL END AS uptime
     FROM days d
     LEFT JOIN agg a ON a.day = d.day
     ORDER BY d.day`,
    [rangeDays]
  );

  const daily_uptime: Array<{
    date: string;
    uptime_percentage: number | null;
  }> = dailyUptimeRes.rows.map((r: any) => ({
    date: new Date(r.day).toISOString().slice(0, 10),
    uptime_percentage:
      r.uptime != null ? Math.round(Number(r.uptime) * 100) / 100 : null,
  }));

  // Incidents per day (count by started_at)
  const incidentsDailyRes = await query(
    `WITH days AS (
       SELECT gs::date AS day
       FROM generate_series(current_date - make_interval(days => $1), current_date, interval '1 day') gs
     ), agg AS (
       SELECT date_trunc('day', i.started_at)::date AS day,
              COUNT(*)::int AS c
       FROM incidents i
       WHERE i.started_at >= NOW() - make_interval(days => $1)
       GROUP BY 1
     )
     SELECT d.day, COALESCE(a.c, 0) AS c
     FROM days d
     LEFT JOIN agg a ON a.day = d.day
     ORDER BY d.day`,
    [rangeDays]
  );

  const incidents_daily: Array<{ date: string; count: number }> =
    incidentsDailyRes.rows.map((r: any) => ({
      date: new Date(r.day).toISOString().slice(0, 10),
      count: Number(r.c || 0),
    }));

  // Status distribution (checks)
  const statusDistRes = await query(
    `SELECT status, COUNT(*)::int AS c
     FROM status_checks
     WHERE checked_at >= NOW() - make_interval(days => $1)
     GROUP BY status`,
    [rangeDays]
  );
  const status_distribution = {
    operational: 0,
    degraded: 0,
    down: 0,
  } as const as {
    operational: number;
    degraded: number;
    down: number;
  };
  const sd: any = { operational: 0, degraded: 0, down: 0 };
  statusDistRes.rows.forEach((r: any) => {
    const k = String(r.status) as keyof typeof sd;
    if (k in sd) sd[k] = Number(r.c || 0);
  });

  // Incidents by severity
  const sevRes = await query(
    `SELECT severity, COUNT(*)::int AS c
     FROM incidents
     WHERE started_at >= NOW() - make_interval(days => $1)
     GROUP BY severity`,
    [rangeDays]
  );
  const sev: any = { minor: 0, major: 0, critical: 0 };
  sevRes.rows.forEach((r: any) => {
    const k = String(r.severity) as keyof typeof sev;
    if (k in sev) sev[k] = Number(r.c || 0);
  });

  return {
    range_days: rangeDays,
    generated_at: new Date().toISOString(),
    services_count,
    avg_uptime_across_services,
    total_checks,
    total_incidents_30d,
    resolved_incidents_30d,
    mttr_minutes_30d,
    services,
    daily_uptime,
    incidents_daily,
    status_distribution: {
      operational: sd.operational,
      degraded: sd.degraded,
      down: sd.down,
    },
    incidents_by_severity: {
      minor: sev.minor,
      major: sev.major,
      critical: sev.critical,
    },
  };
}

function formatDateRange(days: number) {
  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return `${fmt(start)} to ${fmt(now)}`;
}

async function generatePdf(data: ReportData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const pageMargin = 40;
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const addPage = () => doc.addPage([595.28, 841.89]); // A4 portrait
  let page = addPage();
  let y = page.getSize().height - pageMargin;

  const drawText = (
    text: string,
    size = 12,
    bold = false,
    color = rgb(0, 0, 0)
  ) => {
    const selected = bold ? fontBold : font;
    const textWidth = selected.widthOfTextAtSize(text, size);
    const textHeight = selected.heightAtSize(size);
    if (y - textHeight < pageMargin) {
      page = addPage();
      y = page.getSize().height - pageMargin;
    }
    page.drawText(text, {
      x: pageMargin,
      y: y - textHeight,
      size,
      font: selected,
      color,
    });
    y -= textHeight + 6;
  };

  const drawKV = (k: string, v: string) => {
    drawText(`${k}: ${v}`, 11, false, rgb(0.2, 0.2, 0.2));
  };

  const ensureSpace = (need: number) => {
    if (y - need < pageMargin) {
      page = addPage();
      y = page.getSize().height - pageMargin;
    }
  };

  // Helper: draw centered text
  const drawCentered = (
    text: string,
    size = 12,
    bold = false,
    color = rgb(0, 0, 0)
  ) => {
    const selected = bold ? fontBold : font;
    const textHeight = selected.heightAtSize(size);
    if (y - textHeight < pageMargin) {
      page = addPage();
      y = page.getSize().height - pageMargin;
    }
    const width = selected.widthOfTextAtSize(text, size);
    const x = (page.getSize().width - width) / 2;
    page.drawText(text, { x, y: y - textHeight, size, font: selected, color });
    y -= textHeight + 6;
  };

  // Header with centered logo and title
  try {
    const logoPath = path.join(process.cwd(), "public", "logo.jpg");
    const imgBytes = await fs.readFile(logoPath);
    const jpg = await doc.embedJpg(imgBytes);
    const scale = 140 / jpg.width; // target width ~140 px
    const imgWidth = jpg.width * scale;
    const imgHeight = jpg.height * scale;
    if (y - imgHeight < pageMargin) {
      page = addPage();
      y = page.getSize().height - pageMargin;
    }
    const cx = (page.getSize().width - imgWidth) / 2;
    page.drawImage(jpg, {
      x: cx,
      y: y - imgHeight,
      width: imgWidth,
      height: imgHeight,
    });
    y -= imgHeight + 8;
  } catch {
    // No logo available; ignore silently
  }

  drawCentered("EMIS UNIT", 16, true);
  drawCentered("Thapathali Campus, IOE", 14, false);
  drawCentered("Monthly Status Report", 18, true);
  drawCentered(`Date Range: ${formatDateRange(data.range_days)}`, 12, false);
  drawCentered(
    `Generated: ${new Date(data.generated_at).toLocaleString()}`,
    12,
    false
  );
  y -= 12; // vertical gap before content

  // First page content starts here
  // Services table (with borders) — first page
  y -= 6;
  drawText("Service Overview (30 days)", 14, true);
  const tableCols: Array<{
    title: string;
    width: number;
    align: "left" | "right";
  }> = [
    { title: "Service", width: 220, align: "left" },
    { title: "Uptime %", width: 80, align: "right" },
    { title: "Avg RT (ms)", width: 90, align: "right" },
    { title: "Checks", width: 70, align: "right" },
    { title: "Incidents", width: 70, align: "right" },
  ];
  const tableX = pageMargin;
  const tableW = tableCols.reduce((a, c) => a + c.width, 0);
  const headerH = 20;
  const rowH = 18;
  const cellPad = 6;

  const drawHeader = () => {
    ensureSpace(headerH + 2);
    const top = y;
    const bottom = y - headerH;
    // header background
    page.drawRectangle({
      x: tableX,
      y: bottom,
      width: tableW,
      height: headerH,
      color: rgb(0.96, 0.98, 1),
    });
    // header borders
    page.drawSvgPath(`M ${tableX} ${top} L ${tableX + tableW} ${top}`, {
      borderColor: rgb(0.8, 0.86, 0.92),
      borderWidth: 1,
    });
    page.drawSvgPath(`M ${tableX} ${bottom} L ${tableX + tableW} ${bottom}`, {
      borderColor: rgb(0.8, 0.86, 0.92),
      borderWidth: 1,
    });
    // left border
    page.drawSvgPath(`M ${tableX} ${bottom} L ${tableX} ${top}`, {
      borderColor: rgb(0.85, 0.9, 0.95),
      borderWidth: 1,
    });
    // column separators and titles
    let cx = tableX;
    tableCols.forEach((col) => {
      const sel = fontBold;
      const th = sel.heightAtSize(11);
      const ty = bottom + (headerH - th) / 2;
      const text = col.title;
      const tw = sel.widthOfTextAtSize(text, 11);
      const tx =
        col.align === "right" ? cx + col.width - cellPad - tw : cx + cellPad;
      page.drawText(text, {
        x: tx,
        y: ty,
        size: 11,
        font: sel,
        color: rgb(0.1, 0.1, 0.1),
      });
      page.drawSvgPath(
        `M ${cx + col.width} ${bottom} L ${cx + col.width} ${top}`,
        { borderColor: rgb(0.85, 0.9, 0.95), borderWidth: 1 }
      );
      cx += col.width;
    });
    y = bottom;
  };

  const drawRow = (vals: Array<string>) => {
    // Simple page break only when out of space
    if (y - (rowH + 2) < pageMargin) {
      page = addPage();
      y = page.getSize().height - pageMargin;
      // redraw header
      const topH = y;
      const bottomH = y - headerH;
      page.drawRectangle({ x: tableX, y: bottomH, width: tableW, height: headerH, color: rgb(0.96, 0.98, 1) });
      page.drawSvgPath(`M ${tableX} ${topH} L ${tableX + tableW} ${topH}`, { borderColor: rgb(0.8, 0.86, 0.92), borderWidth: 1 });
      page.drawSvgPath(`M ${tableX} ${bottomH} L ${tableX + tableW} ${bottomH}`, { borderColor: rgb(0.8, 0.86, 0.92), borderWidth: 1 });
      page.drawSvgPath(`M ${tableX} ${bottomH} L ${tableX} ${topH}`, { borderColor: rgb(0.85, 0.9, 0.95), borderWidth: 1 });
      let cxh = tableX;
      tableCols.forEach((col) => {
        const sel = fontBold;
        const th = sel.heightAtSize(11);
        const ty = bottomH + (headerH - th) / 2;
        const text = col.title;
        const tw = sel.widthOfTextAtSize(text, 11);
        const tx = col.align === "right" ? cxh + col.width - cellPad - tw : cxh + cellPad;
        page.drawText(text, { x: tx, y: ty, size: 11, font: sel, color: rgb(0.1,0.1,0.1) });
        page.drawSvgPath(`M ${cxh + col.width} ${bottomH} L ${cxh + col.width} ${topH}`, { borderColor: rgb(0.85, 0.9, 0.95), borderWidth: 1 });
        cxh += col.width;
      });
      y = bottomH;
    }

    const top = y;
    const bottom = y - rowH;
    page.drawSvgPath(`M ${tableX} ${bottom} L ${tableX + tableW} ${bottom}`, {
      borderColor: rgb(0.9, 0.92, 0.95),
      borderWidth: 1,
    });
    page.drawSvgPath(`M ${tableX} ${bottom} L ${tableX} ${top}`, {
      borderColor: rgb(0.95, 0.96, 0.98),
      borderWidth: 1,
    });
    let cx = tableX;
    vals.forEach((text, i) => {
      const col = tableCols[i];
      const sel = font;
      const ts = 10;
      const th = sel.heightAtSize(ts);
      const ty = bottom + (rowH - th) / 2;
      let safe = String(text);
      const maxTextW = col.width - cellPad * 2;
      if (sel.widthOfTextAtSize(safe, ts) > maxTextW) {
        while (
          safe.length > 1 &&
          sel.widthOfTextAtSize(safe + "…", ts) > maxTextW
        ) {
          safe = safe.slice(0, -1);
        }
        if (sel.widthOfTextAtSize(safe + "…", ts) <= maxTextW)
          safe = safe + "…";
      }
      const tw = sel.widthOfTextAtSize(safe, ts);
      const tx =
        col.align === "right" ? cx + col.width - cellPad - tw : cx + cellPad;
      page.drawText(safe, {
        x: tx,
        y: ty,
        size: ts,
        font: sel,
        color: rgb(0.1, 0.1, 0.1),
      });
      page.drawSvgPath(
        `M ${cx + col.width} ${bottom} L ${cx + col.width} ${top}`,
        { borderColor: rgb(0.95, 0.96, 0.98), borderWidth: 1 }
      );
      cx += col.width;
    });
    y = bottom;
  };

  // Draw table rows
  drawHeader();
  for (const s of data.services) {
    const vals = [
      s.name,
      s.uptime_percentage != null ? `${s.uptime_percentage.toFixed(2)}` : "N/A",
      s.avg_response_time_ms != null ? `${s.avg_response_time_ms}` : "-",
      String(s.total_checks),
      String(s.incidents_30d),
    ];
    drawRow(vals);
  }

    // End of first page (table only)


  // Second page: only the Daily Uptime line chart
  page = addPage();
  y = page.getSize().height - pageMargin;
  drawText("Daily Uptime (last 30 days)", 14, true);
  const chartWidth2 = page.getSize().width - pageMargin * 2;
  const chartHeight2 = 260; // leave space for signature on this page
  ensureSpace(chartHeight2 + 40);
  const chartX2 = pageMargin;
  const chartY2 = y - chartHeight2;
  page.drawRectangle({ x: chartX2, y: chartY2, width: chartWidth2, height: chartHeight2, borderColor: rgb(0.8, 0.86, 0.92), color: undefined, borderWidth: 1 });
  const grid2 = [0, 50, 100];
  grid2.forEach((pct) => {
    const gy = chartY2 + (pct / 100) * chartHeight2;
    const path = `M ${chartX2} ${gy} L ${chartX2 + chartWidth2} ${gy}`;
    page.drawSvgPath(path, { borderColor: rgb(0.9, 0.92, 0.95), color: undefined, borderWidth: 1 });
    page.drawText(`${pct}%`, { x: chartX2 + chartWidth2 + 6, y: gy - 4, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
  });
  const pts2 = data.daily_uptime;
  const valid = pts2
    .map((pt, idx) =>
      pt.uptime_percentage == null
        ? null
        : { idx, val: Math.max(0, Math.min(100, pt.uptime_percentage)) }
    )
    .filter((x): x is { idx: number; val: number } => !!x);

  const yForVal = (val: number) => {
    const yRaw = chartY2 + (val / 100) * chartHeight2;
    // keep 2px inset from borders so lines aren’t hidden by the frame
    return Math.min(chartY2 + chartHeight2 - 2, Math.max(chartY2 + 2, yRaw));
  };

  if (valid.length >= 2) {
    const stepX = chartWidth2 / (pts2.length - 1);
    let pathL = `M ${chartX2 + stepX * valid[0].idx} ${yForVal(valid[0].val)}`;
    for (let i = 1; i < valid.length; i++) {
      const px = chartX2 + stepX * valid[i].idx;
      const py = yForVal(valid[i].val);
      pathL += ` L ${px} ${py}`;
    }
    page.drawSvgPath(pathL, {
      borderColor: rgb(0.13, 0.45, 0.84),
      color: undefined,
      borderWidth: 3,
    });
    // draw point markers for visibility even on borders
    valid.forEach(({ idx, val }) => {
      const px = chartX2 + stepX * idx;
      const py = yForVal(val);
      page.drawCircle({ x: px, y: py, size: 3, color: rgb(0.13, 0.45, 0.84) });
    });
  } else if (valid.length === 1) {
    // Draw a single point marker and helper text
    const stepX = chartWidth2 / Math.max(1, (pts2.length - 1) || 1);
    const px = chartX2 + stepX * valid[0].idx;
    const py = yForVal(valid[0].val);
    page.drawCircle({ x: px, y: py, size: 3, color: rgb(0.13, 0.45, 0.84) });
    const msg = "Only 1 day of uptime data";
    const mw = font.widthOfTextAtSize(msg, 11);
    page.drawText(msg, {
      x: chartX2 + (chartWidth2 - mw) / 2,
      y: chartY2 + chartHeight2 / 2 - 6,
      size: 11,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
  } else {
    const msg = "No uptime data in this range";
    const mw = font.widthOfTextAtSize(msg, 11);
    page.drawText(msg, {
      x: chartX2 + (chartWidth2 - mw) / 2,
      y: chartY2 + chartHeight2 / 2 - 6,
      size: 11,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
  }

  // Add signature block at bottom-right of this page without creating a third page
  const sigMargin = 40;
  const sigXRight = page.getSize().width - sigMargin;
  const sigY = pageMargin + 40; // stays on this page
  const drawRight = (text: string, size = 12, bold = false, yOff = 0) => {
    const f = bold ? fontBold : font;
    const w = f.widthOfTextAtSize(text, size);
    page.drawText(text, { x: sigXRight - w, y: sigY + yOff, size, font: f, color: rgb(0,0,0) });
  };
  // line
  page.drawRectangle({ x: sigXRight - 200, y: sigY + 28, width: 200, height: 1, color: rgb(0.2,0.2,0.2) });
  drawRight("Suman Maharjan", 12, true, 8);
  drawRight("Technical Assistant", 11, false, -8);
  drawRight("suman@tcioe.edu.np", 11, false, -24);

  // (Services table moved to the first page earlier)

  // No signature block – document limited to two pages as requested

  // Footer
  const addFooter = () => {
    const p = doc.getPages();
    p.forEach((pg, idx) => {
      const txt = `EMIS UNIT — Thapathali Campus, IOE    •    Page ${
        idx + 1
      } of ${p.length}`;
      pg.drawText(txt, {
        x: pageMargin,
        y: 20,
        size: 9,
        font,
        color: rgb(0.4, 0.4, 0.4),
      });
    });
  };
  addFooter();

  return await doc.save();
}

function htmlEscape(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function renderHtml(data: ReportData): Promise<string> {
  // Basic, self-contained HTML for debugging/testing
  const logoUrl = "/logo.jpg";
  const rows = data.services
    .map(
      (s) => `
      <tr>
        <td>${htmlEscape(s.name)}</td>
        <td>${
          s.uptime_percentage != null ? s.uptime_percentage.toFixed(2) : "N/A"
        }%</td>
        <td>${
          s.avg_response_time_ms != null ? s.avg_response_time_ms : "-"
        }</td>
        <td>${s.total_checks}</td>
        <td>${s.incidents_30d}</td>
      </tr>`
    )
    .join("");

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Monthly Status Report</title>
      <style>
        body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #0a0a0a; margin: 24px; }
        .header { display: flex; align-items: center; gap: 16px; }
        .header img { height: 60px; }
        .title { font-size: 20px; font-weight: 700; }
        .subtitle { font-size: 14px; color: #444; }
        .section { margin-top: 20px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th, td { border-bottom: 1px solid #e5e7eb; padding: 8px; text-align: left; }
        th { background: #f8fafc; font-weight: 600; }
        .kv { color: #444; }
      </style>
    </head>
    <body>
      <div class="header">
        <img src="${logoUrl}" alt="Logo" />
        <div>
          <div class="title">EMIS UNIT</div>
          <div class="subtitle">Thapathali Campus, IOE</div>
        </div>
      </div>
      <h1>Monthly Status Report</h1>
      <div class="kv">Date Range: ${htmlEscape(
        formatDateRange(data.range_days)
      )}</div>
      <div class="kv">Generated: ${htmlEscape(
        new Date(data.generated_at).toLocaleString()
      )}</div>
      <div class="section">
        <h3>Executive Summary</h3>
        <div class="kv">Services Monitored: ${data.services_count}</div>
        <div class="kv">Average Uptime: ${
          data.avg_uptime_across_services != null
            ? data.avg_uptime_across_services.toFixed(2) + "%"
            : "N/A"
        }</div>
        <div class="kv">Total Incidents (30d): ${data.total_incidents_30d}</div>
        <div class="kv">Resolved Incidents (30d): ${
          data.resolved_incidents_30d
        }</div>
        <div class="kv">MTTR (minutes): ${
          data.mttr_minutes_30d != null
            ? data.mttr_minutes_30d.toFixed(2)
            : "N/A"
        }</div>
        <div class="kv">Total Checks (30d): ${data.total_checks}</div>
      </div>
      <div class="section">
        <h3>Service Overview (30 days)</h3>
        <table>
          <thead>
            <tr>
              <th>Service</th>
              <th>Uptime %</th>
              <th>Avg RT (ms)</th>
              <th>Checks</th>
              <th>Incidents</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </body>
  </html>`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get("secret");
    const format = (searchParams.get("format") || "pdf").toLowerCase();
    const rangeParam = Number(searchParams.get("range_days") || 30);
    const rangeDays =
      Number.isFinite(rangeParam) && rangeParam > 0
        ? Math.min(rangeParam, 365)
        : 30;

    const authHeader = request.headers.get("authorization") || "";
    const hasHeaderAuth = authHeader === `Bearer ${process.env.CRON_SECRET}`;
    const hasQueryAuth = secret === process.env.CRON_SECRET;

    if (!hasHeaderAuth && !hasQueryAuth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await getReportData(rangeDays);

    if (format === "json") {
      return NextResponse.json({ report: data });
    }

    if (format === "html") {
      const html = await renderHtml(data);
      return new NextResponse(html, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    // Default: PDF
    const pdfBytes = await generatePdf(data);
    const filename = `tcioe-monthly-report-${new Date()
      .toISOString()
      .slice(0, 10)}.pdf`;
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename=${filename}`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error generating report:", error);
    return NextResponse.json(
      { error: "Failed to generate report" },
      { status: 500 }
    );
  }
}
