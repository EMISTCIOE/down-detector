import { NextResponse } from "next/server";
import { headers } from "next/headers";

// Add your webhook URL here (Discord, Slack, or generic webhook)
const RAW_WEBHOOK = process.env.ADMIN_WEBHOOK_URL || "";
const WEBHOOK_URL = RAW_WEBHOOK.trim().replace(/^=+/, "");

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { service_id, service_name, user_agent } = body;

    // Get user IP
    const headersList = await headers();
    const forwarded = headersList.get("x-forwarded-for");
    const ip = forwarded
      ? forwarded.split(",")[0]
      : headersList.get("x-real-ip") || "unknown";

    const timestamp = new Date().toISOString();

    // Basic UA parsing (lightweight heuristic)
    const parseUA = (ua: string | undefined) => {
      const s = ua || "Unknown";
      let browser = "Unknown";
      let os = "Unknown";
      try {
        if (/Edg\/(\d+)/.test(s)) browser = `Edge ${RegExp.$1}`;
        else if (/OPR\/(\d+)/.test(s)) browser = `Opera ${RegExp.$1}`;
        else if (/Chrome\/(\d+)/.test(s)) browser = `Chrome ${RegExp.$1}`;
        else if (/Firefox\/(\d+)/.test(s)) browser = `Firefox ${RegExp.$1}`;
        else if (/Version\/(\d+).+Safari\//.test(s))
          browser = `Safari ${RegExp.$1}`;
        else if (/Safari\//.test(s)) browser = "Safari";

        if (/Windows NT/.test(s)) os = "Windows";
        else if (/Mac OS X/.test(s)) os = "macOS";
        else if (/Android/.test(s)) os = "Android";
        else if (/iPhone OS/.test(s)) os = "iOS";
        else if (/Linux/.test(s)) os = "Linux";
      } catch {}
      return { browser, os };
    };

    const { browser, os } = parseUA(user_agent);

    // Convert ISO country code to flag emoji
    const toFlag = (cc?: string) => {
      try {
        if (!cc) return "";
        const code = cc.trim().toUpperCase();
        if (code.length !== 2) return "";
        const A = 0x1f1e6;
        return String.fromCodePoint(
          A + (code.codePointAt(0)! - 65),
          A + (code.codePointAt(1)! - 65)
        );
      } catch {
        return "";
      }
    };

    // Geolocation (best-effort)
    async function geoLookup(ipAddr: string) {
      try {
        if (
          !ipAddr ||
          ipAddr === "unknown" ||
          ipAddr === "::1" ||
          ipAddr === "127.0.0.1"
        ) {
          return {
            location: "Localhost",
            isp: "",
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            asn: "",
            country_code: "",
            country_name: "",
            city: "",
            region: "",
            latitude: null as number | null,
            longitude: null as number | null,
            languages: "",
            currency: "",
            currency_name: "",
            version: "",
            offset: "",
          };
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const resp = await fetch(`https://ipapi.co/${ipAddr}/json/`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!resp.ok) throw new Error(`ipapi ${resp.status}`);
        const j = await resp.json();
        const parts = [j.city, j.region, j.country_name].filter(Boolean);
        return {
          location: parts.join(", ") || "Unknown",
          isp: j.org || "",
          timezone:
            j.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
          asn: j.asn || "",
          country_code: j.country_code || j.country || "",
          country_name: j.country_name || "",
          city: j.city || "",
          region: j.region || "",
          latitude: typeof j.latitude === "number" ? j.latitude : null,
          longitude: typeof j.longitude === "number" ? j.longitude : null,
          languages: j.languages || "",
          currency: j.currency || "",
          currency_name: j.currency_name || "",
          version: j.version || "",
          offset: j.utc_offset || "",
        };
      } catch (e) {
        return {
          location: "Unknown",
          isp: "",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          asn: "",
          country_code: "",
          country_name: "",
          city: "",
          region: "",
          latitude: null,
          longitude: null,
          languages: "",
          currency: "",
          currency_name: "",
          version: "",
          offset: "",
        };
      }
    }

    const geo = await geoLookup(ip);
    const flag = toFlag(geo.country_code);
    const mapLink =
      geo.latitude != null && geo.longitude != null
        ? `https://www.openstreetmap.org/?mlat=${geo.latitude}&mlon=${geo.longitude}#map=10/${geo.latitude}/${geo.longitude}`
        : "";

    // Prepare webhook payload
    const webhookPayload = {
      content: ``,
      embeds: [
        {
          title: "User Reported Service Down",
          description: "A user reported an outage via the public status page.",
          color: 0xff5555,
          fields: [
            { name: "Service", value: service_name, inline: true },
            { name: "Service ID", value: service_id.toString(), inline: true },
            { name: "Reporter IP", value: ip, inline: true },
            {
              name: "Location",
              value:
                `${geo.location}${flag ? ` ${flag}` : ""}`.trim() || "Unknown",
              inline: true,
            },
            {
              name: "Timezone",
              value: `${geo.timezone || "Unknown"}${
                geo.offset
                  ? ` (UTC ${geo.offset.replace(/^(?=[^+-])/, "+")})`
                  : ""
              }`,
              inline: true,
            },
            {
              name: "Network",
              value:
                [geo.asn, geo.isp].filter(Boolean).join(" • ") || "Unknown",
              inline: true,
            },
            ...(geo.languages
              ? [
                  {
                    name: "Languages",
                    value: String(geo.languages),
                    inline: true,
                  } as const,
                ]
              : []),
            ...(geo.currency
              ? [
                  {
                    name: "Currency",
                    value: geo.currency_name
                      ? `${geo.currency} (${geo.currency_name})`
                      : geo.currency,
                    inline: true,
                  } as const,
                ]
              : []),
            ...(mapLink
              ? [
                  {
                    name: "Map",
                    value: `[OpenStreetMap](${mapLink})`,
                    inline: true,
                  } as const,
                ]
              : []),
            ...(geo.version
              ? [
                  {
                    name: "IP Version",
                    value: geo.version,
                    inline: true,
                  } as const,
                ]
              : []),
            { name: "Browser", value: browser, inline: true },
            { name: "OS", value: os, inline: true },
            {
              name: "User Agent",
              value: user_agent || "Unknown",
              inline: false,
            },
            {
              name: "Reported At",
              value: new Date(timestamp).toLocaleString(),
              inline: false,
            },
          ],
          footer: { text: "TCIOE Status Monitor" },
          timestamp: timestamp,
        },
      ],
    } as const;

    // Send to webhook if configured
    if (WEBHOOK_URL) {
      try {
        // Validate URL
        new URL(WEBHOOK_URL);
        const webhookResponse = await fetch(WEBHOOK_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(webhookPayload),
        });

        if (!webhookResponse.ok) {
          console.error("Webhook failed:", await webhookResponse.text());
        }
      } catch (webhookError) {
        console.error("Error sending webhook:", webhookError);
      }
    } else {
      console.log("No webhook configured or invalid URL. Report:", {
        service_id,
        service_name,
        ip,
        user_agent,
        timestamp,
      });
    }

    // You can also log to database here if you want to track reports
    // await query('INSERT INTO user_reports ...', [...]);

    return NextResponse.json({
      success: true,
      message: "Report received",
    });
  } catch (error) {
    console.error("Error processing report:", error);
    return NextResponse.json(
      { error: "Failed to process report" },
      { status: 500 }
    );
  }
}
