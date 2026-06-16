"use client";

import { useState, useEffect } from "react";
import { useAuthStore } from "@/lib/auth-store";
import { SupportPage } from "@/components/support-page";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { MessageSquare, X, Headset } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Floating Support Button (FAB) for non-admin users.
 *
 * - Admin: hidden (Admin uses the "Suporte" item in the sidebar).
 * - Operator / Viewer: shows a floating circular button in the bottom-right
 *   corner. Clicking it opens a right-side Sheet (drawer) containing the
 *   full SupportPage, so users can create/view tickets without leaving the
 *   current page.
 *
 * Also shows a small unread indicator (red dot) when there are tickets with
 * status "open" or "in_progress".
 */
export function FloatingSupportButton() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "Admin";

  // On admin, render nothing — Admin keeps using the sidebar item.
  if (isAdmin) return null;

  return <FloatingSupportButtonInner />;
}

function FloatingSupportButtonInner() {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const token = useAuthStore((s) => s.token);

  // Poll for tickets that need attention (open/in_progress and not by me).
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    async function checkTickets() {
      try {
        const res = await fetch("/api/support/tickets?limit=50", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        // Count tickets that are still open/in_progress and created by me.
        const count = (data.tickets || []).filter(
          (t: any) => t.status === "open" || t.status === "in_progress"
        ).length;
        if (!cancelled) setUnreadCount(count);
      } catch {
        // Silently ignore — this is just a notification badge.
      }
    }

    checkTickets();
    const interval = setInterval(checkTickets, 60_000); // refresh every minute
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token]);

  return (
    <>
      {/* Floating Action Button (FAB) */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.3, type: "spring", stiffness: 260, damping: 20 }}
        className="fixed bottom-6 right-6 z-40"
      >
        <Button
          onClick={() => setOpen(true)}
          size="icon"
          className="group relative h-14 w-14 rounded-full bg-gradient-to-br from-primary to-primary/80 shadow-xl shadow-primary/30 transition-all hover:scale-105 hover:shadow-2xl hover:shadow-primary/40"
          aria-label="Abrir suporte"
        >
          {/* Pulsing ring */}
          <span className="absolute inset-0 rounded-full bg-primary/40 animate-ping opacity-75" />
          {/* Icon */}
          <Headset className="relative h-6 w-6 text-white" />
          {/* Notification badge */}
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white shadow-md ring-2 ring-background">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>

        {/* Tooltip on hover */}
        <span className="pointer-events-none absolute right-full mr-3 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-popover px-3 py-1.5 text-xs font-medium text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100">
          Precisa de ajuda? Abra um chamado
        </span>
      </motion.div>

      {/* Slide-in panel with the SupportPage */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl p-0 flex flex-col"
        >
          <SheetHeader className="flex flex-row items-center justify-between border-b px-4 py-3">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Headset className="h-4 w-4 text-primary" />
              Central de Suporte
            </SheetTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Fechar</span>
            </Button>
          </SheetHeader>
          {/* SupportPage fills the rest of the panel */}
          <div className="flex-1 overflow-hidden">
            <SupportPage embedded />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
