"use client";

import Link from "next/link";
import { ArrowUp, Facebook, Instagram, Linkedin } from "lucide-react";
import { useState, useEffect } from "react";

export const Footer = () => {
  const currentYear = new Date().getFullYear();
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [activeIncidents, setActiveIncidents] = useState<number | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 300) {
        setShowBackToTop(true);
      } else {
        setShowBackToTop(false);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    async function loadSummary() {
      try {
        const res = await fetch("/api/incidents/active-summary", {
          cache: "no-store",
        });
        const data = await res.json();
        setActiveIncidents(Number(data?.active_count || 0));
      } catch (e) {
        setActiveIncidents(null);
      }
    }
    loadSummary();
    const t = setInterval(loadSummary, 60000);
    return () => clearInterval(t);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resources = [
    { label: "About TCIOE", href: "https://tcioe.edu.np/about" },
    { label: "Departments", href: "https://tcioe.edu.np/departments" },
    { label: "Admissions", href: "https://admission.tcioe.edu.np" },
    { label: "Campus Map", href: "https://tcioe.edu.np/campus-map" },
  ];

  return (
    <footer className="bg-wheat-light text-gray-800 py-12 relative mt-20 border-t border-orange-200">
      <div className="container mx-auto px-4 lg:px-6 flex flex-col gap-10 items-center">
        {/* Card strip */}
        <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* About card */}
          <div className="rounded-xl bg-white border shadow-sm p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-full p-3 shadow">
                <img
                  src="/logo.jpg"
                  alt="TCIOE Logo"
                  className="w-8 h-8 object-contain"
                />
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold text-gray-900">
                  TCIOE Services
                </div>
                <div className="text-lg font-bold text-gray-900">
                  Status Page
                </div>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Real‑time status monitoring for Thapathali Campus services and
              websites.
            </p>
            <div className="flex items-center gap-3">
              <Link
                href="https://facebook.com/ioe.thapathali.official"
                aria-label="Facebook"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-full bg-primary-blue/10 hover:bg-primary-blue/20 transition-colors"
              >
                <Facebook className="h-5 w-5 text-primary-blue" />
              </Link>
              <Link
                href="https://instagram.com/ioe_thapathali"
                aria-label="Instagram"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-full bg-primary-blue/10 hover:bg-primary-blue/20 transition-colors"
              >
                <Instagram className="h-5 w-5 text-primary-blue" />
              </Link>
              <Link
                href="https://linkedin.com/school/ioe-thapathali-campus"
                aria-label="LinkedIn"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-full bg-primary-blue/10 hover:bg-primary-blue/20 transition-colors"
              >
                <Linkedin className="h-5 w-5 text-primary-blue" />
              </Link>
            </div>
          </div>

          {/* Resources card */}
          <div className="rounded-xl bg-white border shadow-sm p-6">
            <h4 className="text-gray-900 font-semibold tracking-wide mb-2">
              TCIOE Resources
            </h4>
            <div className="h-0.5 w-10 bg-accent-orange mb-4" />
            <ul className="space-y-2">
              {resources.map((l) => (
                <li key={l.label}>
                  <Link
                    href={l.href}
                    className="text-gray-700 hover:text-accent-orange transition-colors text-sm"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="w-full max-w-5xl border-t border-orange-200" />

        {/* Bottom Row */}
      </div>

      {/* Back to Top Button */}
      {showBackToTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-8 right-8 bg-accent-orange hover:bg-orange-600 text-white p-3 rounded-full shadow-lg transition-all duration-300 z-50 hover:scale-110"
          aria-label="Back to top"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      )}
    </footer>
  );
};
