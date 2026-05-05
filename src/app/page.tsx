"use client";

import { useState, useSyncExternalStore } from "react";
import { useAuthStore } from "@/lib/auth-store";
import { LoginPage } from "@/components/login-page";
import { AppLayout, type PageKey } from "@/components/app-layout";
import { DashboardPage } from "@/components/dashboard-page";
import { SchoolsPage } from "@/components/schools-page";
import { AttendancePage } from "@/components/attendance-page";
import { StudentsPage } from "@/components/students-page";
import { UsersPage } from "@/components/users-page";
import { LogsPage } from "@/components/logs-page";
import { ReportsPage } from "@/components/reports-page";

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
  const hydrated = useHydrated();
  const [currentPage, setCurrentPage] = useState<PageKey>("dashboard");

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
      case "users":
        return <UsersPage />;
      case "reports":
        return <ReportsPage />;
      case "logs":
        return <LogsPage />;
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
