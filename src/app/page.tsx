"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { useAuthStore } from "@/lib/auth-store";
import { api } from "@/lib/api";
import { LoginPage } from "@/components/login-page";
import { AppLayout, type PageKey } from "@/components/app-layout";

// Dynamic imports to reduce initial compilation memory usage
const DashboardPage = dynamic(() => import("@/components/dashboard-page").then(m => ({ default: m.DashboardPage })), { ssr: false });
const SchoolsPage = dynamic(() => import("@/components/schools-page").then(m => ({ default: m.SchoolsPage })), { ssr: false });
const StudentsPage = dynamic(() => import("@/components/students-page").then(m => ({ default: m.StudentsPage })), { ssr: false });
const AttendancePage = dynamic(() => import("@/components/attendance-page").then(m => ({ default: m.AttendancePage })), { ssr: false });
const UsersPage = dynamic(() => import("@/components/users-page").then(m => ({ default: m.UsersPage })), { ssr: false });
const LogsPage = dynamic(() => import("@/components/logs-page").then(m => ({ default: m.LogsPage })), { ssr: false });
const ReportsPage = dynamic(() => import("@/components/reports-page").then(m => ({ default: m.ReportsPage })), { ssr: false });
const EventsPage = dynamic(() => import("@/components/events-page").then(m => ({ default: m.EventsPage })), { ssr: false });
const SupportPage = dynamic(() => import("@/components/support-page").then(m => ({ default: m.SupportPage })), { ssr: false });

// Hydration-safe check: returns false on server, then true on client
const emptySubscribe = () => () => {};
function useHydrated() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

export default function Home() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const updateUser = useAuthStore((s) => s.updateUser);
  const hydrated = useHydrated();
  const [currentPage, setCurrentPage] = useState<PageKey>("dashboard");

  // Refresh the current user profile once on mount so that fields like
  // role, status and school_ids are always up to date (e.g. if an admin
  // changed the operator's school access in another session).
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<{ user: { id: string; full_name: string; email: string; role: "Admin" | "Operator" | "Viewer"; status: string; profile_photo: string | null; must_change_password: boolean; school_ids?: string[] } }>("/auth/me");
        if (!cancelled && data.user) {
          updateUser(data.user);
        }
      } catch {
        // Silent: 401 is handled by the api client (triggers logout).
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, updateUser]);

  if (!hydrated) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // Not authenticated -> show login
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Authenticated -> show app layout with current page
  const renderPage = () => {
    switch (currentPage) {
      case "dashboard":
        return <DashboardPage />;
      case "schools":
        return <SchoolsPage />;
      case "students":
        return <StudentsPage />;
      case "attendance":
        return <AttendancePage />;
      case "events":
        return <EventsPage />;
      case "users":
        return <UsersPage />;
      case "reports":
        return <ReportsPage />;
      case "logs":
        return <LogsPage />;
      case "support":
        return <SupportPage />;
      default:
        return <DashboardPage />;
    }
  };

  return (
    <AppLayout currentPage={currentPage} onNavigate={setCurrentPage}>
      {renderPage()}
    </AppLayout>
  );
}
