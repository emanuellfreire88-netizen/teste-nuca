"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  GraduationCap, School, CalendarDays, FileText, CheckSquare, AlertTriangle, Search, Loader2,
} from "lucide-react";

interface SearchResult {
  type: string;
  id: string;
  title: string;
  subtitle?: string;
  url: string;
}

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType }> = {
  student: { label: "Alunos", icon: GraduationCap },
  school: { label: "Escolas", icon: School },
  event: { label: "Eventos", icon: CalendarDays },
  document: { label: "Documentos", icon: FileText },
  task: { label: "Tarefas", icon: CheckSquare },
  dropout_alert: { label: "Alertas de Evasão", icon: AlertTriangle },
};

export function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = (url: string) => {
    const event = new CustomEvent("navigate", { detail: url });
    window.dispatchEvent(event);
    onOpenChange(false);
  };

  const performSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<{ results: SearchResult[]; total: number }>(`/search?q=${encodeURIComponent(q)}`);
      setResults(data.results || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro na busca");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => performSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query, performSearch]);

  // Group results by type
  const grouped = results.reduce((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type].push(r);
    return acc;
  }, {} as Record<string, SearchResult[]>);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Busca Global</DialogTitle>
        </DialogHeader>
        <Command shouldFilter={false} className="rounded-lg">
          <div className="flex items-center border-b px-3">
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin opacity-50" />
            ) : (
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            )}
            <CommandInput
              placeholder="Buscar alunos, eventos, documentos, tarefas..."
              value={query}
              onValueChange={setQuery}
            />
          </div>
          <CommandList className="max-h-[400px] overflow-y-auto">
            {error && (
              <div className="py-6 text-center text-sm text-destructive">{error}</div>
            )}
            {!loading && query.trim().length < 2 && !error && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Digite pelo menos 2 caracteres para buscar
              </div>
            )}
            {loading && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Buscando...
              </div>
            )}
            {!loading && query.trim().length >= 2 && results.length === 0 && !error && (
              <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
            )}
            {Object.entries(grouped).map(([type, items]) => {
              const config = TYPE_CONFIG[type] || { label: type, icon: FileText };
              const Icon = config.icon;
              return (
                <CommandGroup key={type} heading={config.label}>
                  {items.map((item) => (
                    <CommandItem
                      key={`${type}-${item.id}`}
                      value={`${type}-${item.id}`}
                      onSelect={() => navigate(item.url)}
                      className="flex items-center gap-2"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.title}</p>
                        {item.subtitle && (
                          <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
