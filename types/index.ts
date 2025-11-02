export interface Service {
  id: number;
  name: string;
  url: string;
  description: string | null;
  is_active: boolean;
  check_interval: number;
  created_at: Date;
  updated_at: Date;
}

export interface StatusCheck {
  id: number;
  service_id: number;
  status: "operational" | "degraded" | "down";
  response_time: number | null;
  status_code: number | null;
  error_message: string | null;
  checked_at: Date;
}

export interface Incident {
  id: number;
  service_id: number;
  title: string;
  description: string | null;
  status: "investigating" | "identified" | "monitoring" | "resolved";
  severity: "minor" | "major" | "critical";
  started_at: Date;
  resolved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface IncidentUpdate {
  id: number;
  incident_id: number;
  message: string;
  status: string;
  created_at: Date;
}

export interface ServiceWithStatus extends Service {
  current_status: "operational" | "degraded" | "down" | "unknown";
  last_checked: Date | null;
  uptime_percentage: number | null;
  active_incidents: number;
}

export interface UptimeData {
  date: string;
  uptime_percentage: number;
  total_checks: number;
  successful_checks: number;
  avg_response_time: number | null;
}
