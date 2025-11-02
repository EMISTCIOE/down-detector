export const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const SITE_NAME = "TCIOE Services Status";

export const DEFAULT_TITLE = "TCIOE Services Status - Real-time Monitoring";

export const DEFAULT_DESCRIPTION =
  "Real-time status monitoring for TCIOE services and websites. Monitor uptime, performance, and incidents for Thapathali Campus services.";

// Allow keywords from env (comma-separated), fallback to sensible defaults
const envKeywords = (process.env.NEXT_PUBLIC_KEYWORDS || "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);

export const DEFAULT_KEYWORDS: string[] = envKeywords.length
  ? envKeywords
  : [
      "TCIOE status",
      "Thapathali Campus status",
      "IOE Thapathali status",
      "service monitoring",
      "uptime",
      "status page",
      "system status Nepal",
      "website status",
    ];

export const OG_IMAGE = "/logo.jpg"; // falls back to a static image in /public

