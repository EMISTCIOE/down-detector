import { StatusCheck, UptimeData } from "@/types";

export function getStatusColor(
  status: "operational" | "degraded" | "down" | "unknown"
): string {
  switch (status) {
    case "operational":
      return "bg-success";
    case "degraded":
      return "bg-warning";
    case "down":
      return "bg-error";
    case "unknown":
      return "bg-gray-400";
    default:
      return "bg-gray-500";
  }
}

export function getStatusTextColor(
  status: "operational" | "degraded" | "down" | "unknown"
): string {
  switch (status) {
    case "operational":
      return "text-success";
    case "degraded":
      return "text-warning";
    case "down":
      return "text-error";
    case "unknown":
      return "text-gray-500";
    default:
      return "text-gray-500";
  }
}

export function getStatusText(
  status: "operational" | "degraded" | "down" | "unknown"
): string {
  switch (status) {
    case "operational":
      return "Operational";
    case "degraded":
      return "Degraded Performance";
    case "down":
      return "Major Outage";
    case "unknown":
      return "Unknown";
    default:
      return "Unknown";
  }
}

export function getSeverityColor(
  severity: "minor" | "major" | "critical"
): string {
  switch (severity) {
    case "minor":
      return "bg-yellow-100 text-yellow-800 border-yellow-300";
    case "major":
      return "bg-orange-100 text-orange-800 border-orange-300";
    case "critical":
      return "bg-red-100 text-red-800 border-red-300";
    default:
      return "bg-gray-100 text-gray-800 border-gray-300";
  }
}

export function getIncidentStatusBadgeColor(
  status: "investigating" | "identified" | "monitoring" | "resolved"
): string {
  switch (status) {
    case "investigating":
      return "bg-orange-100 text-orange-800";
    case "identified":
      return "bg-blue-100 text-blue-800";
    case "monitoring":
      return "bg-purple-100 text-purple-800";
    case "resolved":
      return "bg-green-100 text-green-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export function calculateDailyUptime(checks: StatusCheck[]): UptimeData[] {
  const dailyMap = new Map<
    string,
    { total: number; successful: number; sumLatency: number; latencyCount: number }
  >();

  checks.forEach((check) => {
    const date = new Date(check.checked_at).toISOString().split("T")[0];
    const current =
      dailyMap.get(date) ||
      { total: 0, successful: 0, sumLatency: 0, latencyCount: 0 };

    current.total++;
    if (check.status === "operational") {
      current.successful++;
    }
    if (typeof check.response_time === "number") {
      current.sumLatency += check.response_time;
      current.latencyCount += 1;
    }

    dailyMap.set(date, current);
  });

  const result: UptimeData[] = [];
  dailyMap.forEach((value, date) => {
    result.push({
      date,
      uptime_percentage:
        value.total > 0
          ? Math.round((value.successful / value.total) * 10000) / 100
          : 0,
      total_checks: value.total,
      successful_checks: value.successful,
      avg_response_time:
        value.latencyCount > 0
          ? Math.round((value.sumLatency / value.latencyCount) * 100) / 100
          : null,
    });
  });

  return result.sort((a, b) => a.date.localeCompare(b.date));
}

export async function checkServiceStatus(url: string): Promise<{
  status: "operational" | "degraded" | "down";
  response_time: number | null;
  status_code: number | null;
  error_message: string | null;
}> {
  const startTime = Date.now();

  // Helper to classify based on status code and latency
  const classify = (
    statusCode: number,
    latencyMs: number
  ): { status: "operational" | "degraded" | "down"; message: string | null } => {
    // Treat typical auth-required responses as up
    if (statusCode >= 200 && statusCode < 300) {
      return {
        status: latencyMs > 2500 ? "degraded" : "operational",
        message: latencyMs > 2500 ? "Slow response" : null,
      };
    }
    if (statusCode === 401 || statusCode === 403) {
      return { status: "operational", message: null };
    }
    if (statusCode === 429) {
      return { status: "degraded", message: "Rate limited (429)" };
    }
    if (statusCode === 404) {
      // Many roots legitimately 404; treat as degraded rather than down
      return { status: "degraded", message: "Page not found (404)" };
    }
    if (statusCode >= 500) {
      return { status: "down", message: `Server error (${statusCode})` };
    }
    if (statusCode >= 400) {
      return { status: "degraded", message: `Client error (${statusCode})` };
    }
    if (statusCode >= 300 && statusCode < 400) {
      // If we still see a 3xx after following, treat as up
      return { status: "operational", message: null };
    }
    return { status: "degraded", message: `Unexpected status (${statusCode})` };
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "User-Agent": "TCIOE-Status-Monitor/1.0",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    clearTimeout(timeout);
    const responseTime = Date.now() - startTime;

    const { status, message } = classify(response.status, responseTime);

    return {
      status,
      response_time: responseTime,
      status_code: response.status,
      error_message: message,
    };
  } catch (error: any) {
    // Fallback to a quick HEAD request (some sites block GET or are heavy)
    try {
      const headStart = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000); // quick 5s fallback

      const headResp = await fetch(url, {
        method: "HEAD",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": "TCIOE-Status-Monitor/1.0",
        },
      });

      clearTimeout(timeout);
      const headLatency = Date.now() - headStart;
      const { status, message } = classify(headResp.status, headLatency);

      return {
        status,
        response_time: headLatency,
        status_code: headResp.status,
        error_message: message ? `Fallback HEAD: ${message}` : null,
      };
    } catch (fallbackError: any) {
      const totalLatency = Date.now() - startTime;
      let errorMessage = "Connection failed";
      const e = error as any;
      if (e?.name === "AbortError") {
        errorMessage = "Request timeout (>10s)";
      } else if (e?.message?.includes("ENOTFOUND")) {
        errorMessage = "Domain not found (DNS error)";
      } else if (e?.message?.includes("ECONNREFUSED")) {
        errorMessage = "Connection refused";
      } else if (e?.message) {
        errorMessage = e.message;
      }

      return {
        status: "down",
        response_time: e?.name === "AbortError" ? null : totalLatency,
        status_code: null,
        error_message: errorMessage,
      };
    }
  }
}
