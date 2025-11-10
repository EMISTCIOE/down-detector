"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ServiceWithStatus, StatusCheck, UptimeData } from "@/types";
import { toast } from "sonner";
import {
  getStatusColor,
  getStatusText,
  calculateDailyUptime,
} from "@/lib/status-utils";
import { formatRelativeTime } from "@/lib/utils";
import {
  Activity,
  AlertCircle,
  CheckCircle,
  Clock,
  TrendingUp,
  Flag,
} from "lucide-react";

export default function HomePage() {
  const [services, setServices] = useState<ServiceWithStatus[]>([]);
  const [serviceHistory, setServiceHistory] = useState<
    Record<number, StatusCheck[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [reportingService, setReportingService] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    fetchServices();
    // Refresh every 60 seconds
    const interval = setInterval(fetchServices, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchServices = async () => {
    try {
      const response = await fetch("/api/services");
      const data = await response.json();
      setServices(data.services || []);

      // Fetch history for each service
      for (const service of data.services || []) {
        fetchServiceHistory(service.id);
      }

      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error fetching services:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchServiceHistory = async (serviceId: number) => {
    try {
      const response = await fetch(`/api/services/${serviceId}`);
      const data = await response.json();
      setServiceHistory((prev) => ({
        ...prev,
        [serviceId]: data.history || [],
      }));
    } catch (error) {
      console.error(`Error fetching history for service ${serviceId}:`, error);
    }
  };

  const handleReportDown = async (serviceId: number, serviceName: string) => {
    setReportingService(serviceId);
    try {
      const response = await fetch("/api/report-down", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: serviceId,
          service_name: serviceName,
          reporter_ip: "client", // Will be set by API
          user_agent: navigator.userAgent,
        }),
      });

      if (response.ok) {
        toast.success("Report sent. Thank you for the heads up.");
      } else {
        toast.error("Failed to send report. Please try again.");
      }
    } catch (error) {
      console.error("Error reporting service down:", error);
      toast.error("Failed to send report. Please try again.");
    } finally {
      setReportingService(null);
    }
  };

  const allOperational =
    services.length > 0 &&
    services.every((s) => s.current_status === "operational");
  const anyDown = services.some((s) => s.current_status === "down");
  const hasUnknown = services.some((s) => s.current_status === "unknown");

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-5xl mx-auto space-y-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 bg-gray-200 rounded w-1/3"></div>
              </CardHeader>
              <CardContent>
                <div className="h-4 bg-gray-200 rounded w-full"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 md:py-8">
      <div className="max-w-5xl mx-auto">
        {/* Overall Status Banner */}
        <Card
          className={`mb-6 border-l-4 ${
            anyDown
              ? "border-l-error"
              : allOperational
              ? "border-l-success"
              : hasUnknown
              ? "border-l-gray-300"
              : "border-l-warning"
          }`}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {allOperational ? (
                  <CheckCircle className="w-8 h-8 text-success" />
                ) : anyDown ? (
                  <AlertCircle className="w-8 h-8 text-error" />
                ) : hasUnknown ? (
                  <Activity className="w-8 h-8 text-gray-400" />
                ) : (
                  <Activity className="w-8 h-8 text-warning" />
                )}
                <div>
                  <CardTitle className="text-xl md:text-2xl">
                    {allOperational
                      ? "All Systems Operational"
                      : anyDown
                      ? "System Issues Detected"
                      : hasUnknown
                      ? "Status Unknown"
                      : "Partial System Outage"}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Last updated: {formatRelativeTime(lastUpdated)}
                  </CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Services List */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-text-dark mb-2">
            Services Status
          </h2>

          {services.map((service) => {
            const history = serviceHistory[service.id] || [];
            // Use full 30-day history returned by the API
            // (previously only used last 90 checks, which could be < 30 days)
            const dailyUptime = calculateDailyUptime(history);

            return (
              <Card
                key={service.id}
                className="group hover:shadow-lg transition-shadow"
                onMouseEnter={() => setExpandedId(service.id)}
                onMouseLeave={() =>
                  setExpandedId((prev) => (prev === service.id ? null : prev))
                }
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between flex-wrap gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <CardTitle className="text-lg md:text-xl">
                          {service.name}
                        </CardTitle>
                        <Badge
                          className={`${getStatusColor(
                            service.current_status
                          )} text-white border-none`}
                        >
                          {getStatusText(service.current_status)}
                        </Badge>
                        {service.active_incidents > 0 && (
                          <Badge variant="destructive">
                            {service.active_incidents} active incident
                            {service.active_incidents > 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="mt-1">
                        <a
                          href={service.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={service.url}
                          aria-label={`Open ${service.name} at ${service.url}`}
                          className="block max-w-full text-xs md:text-sm text-primary-blue hover:underline whitespace-nowrap overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                        >
                          {service.url}
                        </a>
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2 w-full md:w-auto justify-start md:justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          handleReportDown(service.id, service.name)
                        }
                        disabled={reportingService === service.id}
                        className="flex items-center gap-2"
                      >
                        <Flag className="w-4 h-4" />
                        {reportingService === service.id
                          ? "Reporting..."
                          : "Report Down"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="md:hidden"
                        onClick={() =>
                          setExpandedId((prev) =>
                            prev === service.id ? null : service.id
                          )
                        }
                      >
                        Details
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div
                    className={`transition-[max-height] duration-300 overflow-hidden ${
                      expandedId === service.id
                        ? "max-h-80"
                        : "max-h-0 md:group-hover:max-h-80"
                    }`}
                  >
                    <div className="space-y-3 pt-2">
                      {/* Uptime Percentage */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-text-light flex items-center gap-2">
                          <TrendingUp className="w-4 h-4" />
                          30-day uptime
                        </span>
                      </div>

                      {/* Daily Uptime Graph (30 equal cells) */}
                      <div className="space-y-2">
                        {(() => {
                          // Build lookup by date for quick access
                          const byDate: Record<string, UptimeData> = {};
                          dailyUptime.forEach((d) => (byDate[d.date] = d));

                          // Generate last 30 calendar dates from oldest -> newest
                          const last30: string[] = Array.from(
                            { length: 30 },
                            (_, i) => {
                              const daysAgo = 29 - i; // start 29 days ago, end today
                              return new Date(
                                Date.now() - daysAgo * 24 * 60 * 60 * 1000
                              )
                                .toISOString()
                                .split("T")[0];
                            }
                          );

                          return (
                            <div
                              className="grid gap-[2px] bg-gray-50 p-2 rounded h-16 items-end"
                              style={{
                                gridTemplateColumns:
                                  "repeat(30, minmax(0, 1fr))",
                              }}
                            >
                              {last30.map((date) => {
                                const day = byDate[date] || null;
                                let color = "bg-gray-200"; // no data
                                if (day) {
                                  color =
                                    day.uptime_percentage === 100
                                      ? "bg-success"
                                      : day.uptime_percentage >= 95
                                      ? "bg-warning"
                                      : "bg-error";
                                }
                                const maxLatency = 2500; // ms
                                const avgLatency =
                                  day?.avg_response_time ?? maxLatency;
                                const speedScore = Math.max(
                                  0,
                                  Math.min(1, 1 - avgLatency / maxLatency)
                                );
                                const uptimeScore =
                                  (day?.uptime_percentage ?? 0) / 100;
                                const h =
                                  Math.max(0.1, speedScore * uptimeScore) * 100;
                                const title = day
                                  ? `${date}: ${day.uptime_percentage.toFixed(
                                      2
                                    )}% uptime (${day.successful_checks}/${
                                      day.total_checks
                                    }), avg ${Math.round(avgLatency)}ms`
                                  : `${date}: no data`;
                                return (
                                  <div
                                    key={date}
                                    className={`${color} rounded-sm transition-opacity hover:opacity-80 focus:opacity-80 outline-none`}
                                    style={{
                                      height: `${h}%`,
                                      minHeight: "6px",
                                    }}
                                    title={title}
                                    tabIndex={0}
                                    aria-label={title}
                                  />
                                );
                              })}
                            </div>
                          );
                        })()}
                        <div className="flex items-center justify-between text-xs text-text-light">
                          <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1">
                              <div className="w-3 h-3 bg-success rounded"></div>
                              100%
                            </span>
                            <span className="flex items-center gap-1">
                              <div className="w-3 h-3 bg-warning rounded"></div>
                              95–99%
                            </span>
                            <span className="flex items-center gap-1">
                              <div className="w-3 h-3 bg-error rounded"></div>
                              &lt; 95%
                            </span>
                            <span className="flex items-center gap-1">
                              <div className="w-3 h-3 bg-gray-200 rounded"></div>
                              No data
                            </span>
                          </div>
                          {service.last_checked && (
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatRelativeTime(service.last_checked)}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
