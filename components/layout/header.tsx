"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

export const Header = () => {
  return (
    <header className="w-full sticky top-0 z-40">
      {/* Top utility bar (students, faculty, alumni | library, journal, suggestions, search) */}
      <UtilityBar />
      {/* White bar like TCIOE site */}
      <div className="bg-white text-gray-900 border-b">
        <div className="container mx-auto px-4 py-3 md:py-4">
          <div className="grid grid-cols-3 items-center gap-4">
            {/* Left: Logo + institute */}
            <Link href="/" className="flex items-center gap-3 min-w-0">
              <Image
                src="/logo.jpg"
                alt="Tribhuvan University Logo"
                width={48}
                height={48}
                className="w-10 h-10 md:w-12 md:h-12 rounded"
              />
              <div className="min-w-0">
                <div className="text-[#5b21b6] font-bold text-sm md:text-base leading-tight">
                  Tribhuvan University
                </div>
                <div className="text-[#1e3a8a] font-bold text-base md:text-lg leading-tight -mt-0.5">
                  Institute of Engineering
                </div>
                <div className="text-gray-600 text-[10px] md:text-xs">
                  Thapathali Campus
                </div>
              </div>
            </Link>

            {/* Center: Page title */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="font-semibold text-sm md:text-base tracking-wide">
                  System Status
                </span>
              </div>
            </div>

            {/* Right: Accreditation mark */}
            <div className="hidden md:flex items-center justify-end gap-3 text-right">
              <Image
                src="/acc.webp"
                alt="UGC Accreditation"
                width={40}
                height={40}
                className="w-10 h-10"
              />
              <div className="text-xs">
                <div className="font-semibold text-gray-900">
                  Accredited by University Grants Commission
                </div>
                <div className="text-gray-600">(UGC) Nepal</div>
                <div className="text-gray-600">
                  Quality Education Since 1930 A.D.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Announcement strip (orange) */}
      <AnnouncementBar />
    </header>
  );
};

function UtilityBar() {
  return (
    <div className="bg-gray-100 text-gray-700 border-b">
      <div className="container mx-auto px-4 py-2 text-xs md:text-sm">
        <div className="flex items-center justify-between">
          {/* Left links */}
          <nav className="flex items-center gap-3 md:gap-4">
            <span className="text-gray-300">|</span>
            <Link href="https://tcioe.edu.np" className="hover:text-gray-900">
              TCIOE
            </Link>
            <span className="text-gray-300">|</span>
          </nav>

          {/* Right links */}
          <span className="text-gray-300">|</span>
          <nav className="flex items-center gap-3 md:gap-4">
            <a
              href="https://library.tcioe.edu.np"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-900"
            >
              Library
            </a>
            <span className="text-gray-300">|</span>
            <a
              href="https://journal.tcioe.edu.np"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-900"
            >
              Journal
            </a>
            <span className="text-gray-300">|</span>
            <Link
              href="https://tcioe.edu.np/suggestion-box"
              className="hover:text-gray-900"
            >
              <span className="hidden md:inline">Suggestions</span>

              <span className="md:hidden">Suggest</span>
              <span className="text-gray-300">|</span>
            </Link>
          </nav>
        </div>
      </div>
    </div>
  );
}

function AnnouncementBar() {
  const [items, setItems] = useState<string[]>([]);
  const [visible, setVisible] = useState(false);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const REASONS = [
      "Possible ISP disruption",
      "Server maintenance or outage",
      "Cache/CDN propagation issue",
      "Upstream DNS problem",
      "Hardware or network fault",
      "Datacenter connectivity issue",
      "Unexpected software crash",
      "Regional network congestion",
    ];

    // Deterministic index so all users see the same reason for the same outage window
    const pickDeterministic = (seed: string, len: number) => {
      let h = 2166136261; // FNV-1a base
      for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      if (h < 0) h = ~h + 1; // make positive
      return h % Math.max(1, len);
    };

    async function run() {
      try {
        const res = await fetch("/api/incidents/active-summary", {
          cache: "no-store",
        });
        const data = await res.json();
        const active = Number(data?.active_count || 0);
        const stamp = String(data?.latest_started_at || "");
        const affected: string[] = Array.isArray(data?.affected_services)
          ? (data.affected_services as string[])
          : [];
        const reasons: Array<{ service: string; reason: string }> =
          Array.isArray(data?.reasons)
            ? (data.reasons as Array<{ service: string; reason: string }>)
            : [];
        if (active > 0 && stamp) {
          const list: string[] = [];
          if (reasons.length > 0) {
            // Show each service: reason as separate slide
            reasons.forEach((r) => list.push(`${r.service}: ${r.reason}`));
          } else {
            // Deterministic fallback
            const seed = `${stamp}|${active}|${affected.join(",")}`;
            const di = pickDeterministic(seed, REASONS.length);
            const reason = REASONS[di];
            if (affected.length > 0) {
              affected.forEach((s) => list.push(`${s}: ${reason}`));
            } else {
              list.push(reason);
            }
          }
          setItems(list);
          setIdx(0);
          setVisible(true);
        } else {
          setVisible(false);
          setItems([]);
        }
      } catch (e) {
        setVisible(false);
      }
    }

    run();
    const t = setInterval(run, 60_000);
    return () => {
      isMounted = false;
      clearInterval(t);
    };
  }, []);

  if (!visible || items.length === 0) return null;
  const onPrev = () => setIdx((i) => (i - 1 + items.length) % items.length);
  const onNext = () => setIdx((i) => (i + 1) % items.length);
  return (
    <div className="bg-accent-orange text-white">
      <div className="container mx-auto px-4 py-2 text-sm">
        <div className="flex items-center justify-center gap-3">
          <strong className="mr-1">Announcements</strong>
          {items.length > 1 && (
            <button
              aria-label="Previous announcement"
              onClick={onPrev}
              className="p-1 rounded hover:bg-white/10 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          <div className="truncate max-w-[70vw] md:max-w-[60vw] text-center opacity-90">
            {items[idx]}
          </div>
          {items.length > 1 && (
            <button
              aria-label="Next announcement"
              onClick={onNext}
              className="p-1 rounded hover:bg-white/10 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
