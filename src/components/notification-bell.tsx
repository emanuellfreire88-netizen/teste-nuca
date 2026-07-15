'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Bell,
  AlertTriangle,
  Clock,
  TrendingDown,
  Wifi,
  Info,
  Check,
  CheckCheck,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Notification {
  id: string;
  type: 'dropout_alert' | 'long_absence' | 'low_attendance' | 'offline_sync' | 'info';
  title: string;
  message: string;
  read: boolean;
  related_student_id: string | null;
  created_at: string;
}

interface NotificationsResponse {
  notifications: Notification[];
  unread_count: number;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Agora';
  if (diffMin < 60) return `${diffMin} min atrás`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h atrás`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d atrás`;
}

function getNotificationIcon(type: Notification['type']) {
  switch (type) {
    case 'dropout_alert':
      return AlertTriangle;
    case 'long_absence':
      return Clock;
    case 'low_attendance':
      return TrendingDown;
    case 'offline_sync':
      return Wifi;
    case 'info':
      return Info;
  }
}

function getNotificationIconColor(type: Notification['type']) {
  switch (type) {
    case 'dropout_alert':
      return 'text-red-500';
    case 'long_absence':
      return 'text-orange-500';
    case 'low_attendance':
      return 'text-yellow-500';
    case 'offline_sync':
      return 'text-blue-500';
    case 'info':
      return 'text-muted-foreground';
  }
}

function getNotificationBgColor(type: Notification['type']) {
  switch (type) {
    case 'dropout_alert':
      return 'bg-red-50 dark:bg-red-950/30';
    case 'long_absence':
      return 'bg-orange-50 dark:bg-orange-950/30';
    case 'low_attendance':
      return 'bg-yellow-50 dark:bg-yellow-950/30';
    case 'offline_sync':
      return 'bg-blue-50 dark:bg-blue-950/30';
    case 'info':
      return 'bg-muted/50';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [open, setOpen] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<NotificationsResponse>(
        '/notifications?read=false&page=1&limit=10',
      );
      setNotifications(data.notifications);
      setUnreadCount(data.unread_count);
    } catch {
      // silently fail — notifications are not critical
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount and periodically
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60_000); // every 60s
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Fetch when popover opens
  useEffect(() => {
    if (open) {
      fetchNotifications();
    }
  }, [open, fetchNotifications]);

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await api.put('/notifications', { mark_all: true });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // silently fail
    } finally {
      setMarkingAll(false);
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await api.put('/notifications', { ids: [id] });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // silently fail
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
          <span className="sr-only">Notificações</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Notificações</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1 px-2"
              onClick={handleMarkAllRead}
              disabled={markingAll}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Marcar todas como lidas
            </Button>
          )}
        </div>

        {/* Notification list */}
        <ScrollArea className="max-h-96">
          {loading && notifications.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Bell className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-xs">Nenhuma notificação</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => {
                const Icon = getNotificationIcon(notification.type);
                const iconColor = getNotificationIconColor(notification.type);
                const bgColor = getNotificationBgColor(notification.type);

                return (
                  <div
                    key={notification.id}
                    className={`flex gap-3 px-4 py-3 transition-colors ${
                      notification.read
                        ? 'opacity-60'
                        : bgColor
                    }`}
                  >
                    {/* Icon */}
                    <div className="shrink-0 mt-0.5">
                      <Icon className={`h-4 w-4 ${iconColor}`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium leading-tight">
                          {notification.title}
                        </p>
                        {!notification.read && (
                          <button
                            type="button"
                            onClick={() => handleMarkRead(notification.id)}
                            className="shrink-0 p-0.5 rounded hover:bg-accent cursor-pointer"
                            title="Marcar como lida"
                          >
                            <Check className="h-3 w-3 text-muted-foreground" />
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {notification.message}
                      </p>
                      <p className="text-[10px] text-muted-foreground/70">
                        {timeAgo(notification.created_at)}
                      </p>
                    </div>

                    {/* Unread dot */}
                    {!notification.read && (
                      <span className="shrink-0 mt-1.5 h-2 w-2 rounded-full bg-primary" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="border-t px-4 py-2">
            <p className="text-[10px] text-center text-muted-foreground">
              {unreadCount > 0
                ? `${unreadCount} não lida${unreadCount !== 1 ? 's' : ''}`
                : 'Todas as notificações foram lidas'}
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
