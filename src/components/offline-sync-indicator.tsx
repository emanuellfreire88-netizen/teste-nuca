'use client';

import { useState } from 'react';
import { useOfflineSyncContext } from '@/lib/offline-sync-provider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Cloud,
  CloudOff,
  AlertCircle,
  Check,
  Clock,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatLastSync(iso: string | null): string {
  if (!iso) return 'Nunca';
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------------------------------------------------------------------------
// Conflict Resolution Dialog
// ---------------------------------------------------------------------------

function ConflictResolutionDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { conflicts, resolveConflicts } = useOfflineSyncContext();
  const [resolutions, setResolutions] = useState<Record<number, 'local' | 'server'>>({});
  const [resolving, setResolving] = useState(false);

  const handleResolve = async () => {
    setResolving(true);
    try {
      const resolutionData = conflicts.map((c, i) => {
        const choice = resolutions[i] || 'server';
        return choice === 'local' ? c.local : c.server;
      });
      await resolveConflicts(resolutionData);
      toast.success('Conflitos resolvidos com sucesso!');
      setResolutions({});
      onOpenChange(false);
    } catch {
      toast.error('Erro ao resolver conflitos');
    } finally {
      setResolving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Resolver Conflitos de Sincronização</DialogTitle>
          <DialogDescription>
            Existem {conflicts.length} conflito(s) entre dados locais e do servidor. Escolha qual versão manter.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-96">
          <div className="space-y-4 pr-2">
            {conflicts.map((conflict, idx) => (
              <div
                key={idx}
                className="rounded-lg border p-4 space-y-3"
              >
                <p className="text-sm font-medium capitalize">
                  Conflito #{idx + 1} — {conflict.type === 'attendance' ? 'Frequência' : 'Participação'}
                </p>

                <div className="grid grid-cols-2 gap-3">
                  {/* Local version */}
                  <button
                    type="button"
                    onClick={() => setResolutions((r) => ({ ...r, [idx]: 'local' }))}
                    className={`rounded-md border p-3 text-left text-xs transition-colors cursor-pointer ${
                      resolutions[idx] === 'local'
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'hover:border-muted-foreground/30'
                    }`}
                  >
                    <p className="font-semibold mb-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Local
                    </p>
                    <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-words">
                      {JSON.stringify(conflict.local, null, 2)}
                    </pre>
                  </button>

                  {/* Server version */}
                  <button
                    type="button"
                    onClick={() => setResolutions((r) => ({ ...r, [idx]: 'server' }))}
                    className={`rounded-md border p-3 text-left text-xs transition-colors cursor-pointer ${
                      resolutions[idx] === 'server'
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'hover:border-muted-foreground/30'
                    }`}
                  >
                    <p className="font-semibold mb-1 flex items-center gap-1">
                      <Cloud className="h-3 w-3" /> Servidor
                    </p>
                    <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-words">
                      {JSON.stringify(conflict.server, null, 2)}
                    </pre>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={resolving}
          >
            Cancelar
          </Button>
          <Button onClick={handleResolve} disabled={resolving}>
            {resolving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Resolver Todos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function OfflineSyncIndicator() {
  const {
    isOnline,
    syncStatus,
    lastSyncAt,
    pendingCount,
    conflicts,
    syncNow,
    preSync,
  } = useOfflineSyncContext();

  const [conflictOpen, setConflictOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [preSyncing, setPreSyncing] = useState(false);

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      await syncNow();
      toast.success('Sincronização concluída!');
    } catch {
      toast.error('Erro ao sincronizar');
    } finally {
      setSyncing(false);
    }
  };

  const handlePreSync = async () => {
    setPreSyncing(true);
    try {
      await preSync();
      toast.success('Pré-sincronização concluída! Dados disponíveis offline.');
    } catch {
      toast.error('Erro na pré-sincronização');
    } finally {
      setPreSyncing(false);
    }
  };

  // Determine visual state
  const statusConfig = {
    synced: {
      dotClass: 'bg-green-500',
      label: 'Sincronizado',
      icon: Check,
      iconClass: 'text-green-500',
      badgeVariant: 'secondary' as const,
    },
    waiting: {
      dotClass: 'bg-yellow-500 animate-pulse',
      label: 'Modo Offline',
      icon: WifiOff,
      iconClass: 'text-yellow-500',
      badgeVariant: 'outline' as const,
    },
    syncing: {
      dotClass: 'bg-blue-500',
      label: 'Sincronizando...',
      icon: Loader2,
      iconClass: 'text-blue-500',
      badgeVariant: 'secondary' as const,
    },
    error: {
      dotClass: 'bg-red-500',
      label: 'Erro de Sincronização',
      icon: AlertCircle,
      iconClass: 'text-red-500',
      badgeVariant: 'destructive' as const,
    },
  };

  const config = statusConfig[syncStatus];
  const StatusIcon = config.icon;

  // Offline banner (shown when offline with pending ops)
  const showOfflineBanner = !isOnline && pendingCount > 0;

  return (
    <>
      {/* Offline Banner */}
      {showOfflineBanner && (
        <div className="flex items-center gap-2 rounded-md bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 px-2.5 py-1 text-xs text-yellow-800 dark:text-yellow-200">
          <WifiOff className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden sm:inline font-medium">Modo Offline</span>
          <Badge variant="outline" className="h-5 text-[10px] px-1.5 border-yellow-400 dark:border-yellow-600 text-yellow-700 dark:text-yellow-300">
            {pendingCount} pendente{pendingCount !== 1 ? 's' : ''}
          </Badge>
        </div>
      )}

      {/* Main Indicator Pill */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-accent cursor-pointer"
            aria-label="Status de sincronização"
          >
            {/* Status dot */}
            <span className={`relative flex h-2 w-2 shrink-0`}>
              {syncStatus === 'syncing' ? (
                <Loader2 className="h-2 w-2 animate-spin text-blue-500" />
              ) : (
                <span
                  className={`inline-block h-2 w-2 rounded-full ${config.dotClass}`}
                />
              )}
            </span>

            {/* Label (hidden on mobile) */}
            <span className="hidden sm:inline text-muted-foreground">
              {config.label}
            </span>

            {/* Conflict badge */}
            {conflicts.length > 0 && (
              <Badge variant="destructive" className="h-4 min-w-[16px] text-[10px] px-1">
                {conflicts.length}
              </Badge>
            )}

            {/* Pending count badge when online */}
            {isOnline && pendingCount > 0 && syncStatus !== 'syncing' && (
              <Badge variant="secondary" className="h-4 min-w-[16px] text-[10px] px-1">
                {pendingCount}
              </Badge>
            )}
          </button>
        </PopoverTrigger>

        <PopoverContent align="end" className="w-80 p-0">
          <div className="p-4 space-y-4">
            {/* Status header */}
            <div className="flex items-center gap-2">
              <StatusIcon
                className={`h-5 w-5 ${config.iconClass} ${
                  syncStatus === 'syncing' ? 'animate-spin' : ''
                }`}
              />
              <div>
                <p className="text-sm font-medium">{config.label}</p>
                <p className="text-xs text-muted-foreground">
                  {isOnline ? (
                    <span className="flex items-center gap-1">
                      <Wifi className="h-3 w-3" /> Online
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <WifiOff className="h-3 w-3" /> Offline
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Last sync time */}
            <div className="text-xs text-muted-foreground">
              <Clock className="h-3 w-3 inline mr-1" />
              Última sincronização: {formatLastSync(lastSyncAt)}
            </div>

            {/* Pending operations */}
            {pendingCount > 0 && (
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <RefreshCw className="h-3 w-3" />
                {pendingCount} operação{pendingCount !== 1 ? 'ões' : ''} pendente{pendingCount !== 1 ? 's' : ''}
              </div>
            )}

            {/* Conflicts warning */}
            {conflicts.length > 0 && (
              <button
                type="button"
                onClick={() => setConflictOpen(true)}
                className="w-full flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className="font-medium">
                  {conflicts.length} conflito{conflicts.length !== 1 ? 's' : ''} pendente{conflicts.length !== 1 ? 's' : ''}
                </span>
                <span className="ml-auto text-[10px]">Clique para resolver</span>
              </button>
            )}

            {/* Action buttons */}
            <div className="flex flex-col gap-2">
              <Button
                size="sm"
                className="w-full"
                onClick={handleSyncNow}
                disabled={!isOnline || syncing || syncStatus === 'syncing'}
              >
                {syncing || syncStatus === 'syncing' ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                Sincronizar Agora
              </Button>

              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={handlePreSync}
                disabled={!isOnline || preSyncing}
              >
                {preSyncing ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Cloud className="h-4 w-4 mr-1" />
                )}
                Pré-Sincronizar Dados
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Conflict Resolution Dialog */}
      <ConflictResolutionDialog
        open={conflictOpen}
        onOpenChange={setConflictOpen}
      />
    </>
  );
}
