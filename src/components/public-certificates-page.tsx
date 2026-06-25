"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Search, Download, Loader2, Award, AlertCircle, ChevronLeft, CalendarDays, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Certificate {
  event_id: string;
  student_id: string;
  event_title: string;
  event_date: string;
  event_location: string | null;
  event_category: string;
  school_name: string | null;
}

interface StudentResult {
  id: string;
  full_name: string;
  certificates: Certificate[];
}

interface EventOption {
  id: string;
  title: string;
  date: string;
  location: string | null;
  category: string;
  school_name: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  sports: "Esportes",
  cultural: "Cultural",
  party: "Festa",
  academic: "Acadêmico",
  other: "Outro",
};

/**
 * Public certificate lookup page. Shown when the URL contains ?certificados.
 * No login required — a student types their name and can download any
 * certificate for events they attended that are marked as "completed".
 * An optional event filter lets the student narrow results to a single event.
 */
export function PublicCertificatesPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StudentResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Event filter state
  const [events, setEvents] = useState<EventOption[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [eventSearchOpen, setEventSearchOpen] = useState(false);
  const eventDropdownRef = useRef<HTMLDivElement>(null);

  // Fetch the list of completed events (with certificates) on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setEventsLoading(true);
        const res = await fetch("/api/certificates/events");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setEvents(data.events || []);
      } catch {
        // Silent — the dropdown just stays empty
      } finally {
        if (!cancelled) setEventsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Close event dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        eventDropdownRef.current &&
        !eventDropdownRef.current.contains(e.target as Node)
      ) {
        setEventSearchOpen(false);
      }
    }
    if (eventSearchOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [eventSearchOpen]);

  const selectedEvent = events.find((e) => e.id === selectedEventId) || null;

  const performSearch = useCallback(
    async (name: string, eventId?: string) => {
      if (name.trim().length < 2) {
        setResults([]);
        setSearched(false);
        return;
      }
      try {
        setLoading(true);
        setSearched(true);
        const params = new URLSearchParams({
          name: name.trim(),
        });
        if (eventId) params.set("event_id", eventId);
        const res = await fetch(`/api/certificates/lookup?${params.toString()}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Erro ao buscar");
        }
        const data = await res.json();
        setResults(data.students || []);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro ao buscar";
        toast.error(msg);
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const handleInputChange = (value: string) => {
    setQuery(value);
    // Debounce search so we don't hit the API on every keystroke
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      performSearch(value, selectedEventId);
    }, 400);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    performSearch(query, selectedEventId);
  };

  // When the event filter changes, re-run the search if we already have a query
  const handleEventSelect = (eventId: string) => {
    setSelectedEventId(eventId);
    setEventSearchOpen(false);
    if (query.trim().length >= 2) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      performSearch(query, eventId);
    }
  };

  const clearEventFilter = () => {
    setSelectedEventId("");
    if (query.trim().length >= 2) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      performSearch(query, "");
    }
  };

  const handleDownload = async (cert: Certificate, studentName: string) => {
    const key = `${cert.student_id}-${cert.event_id}`;
    try {
      setDownloading(key);
      const res = await fetch(
        `/api/certificates/download?event_id=${cert.event_id}&student_id=${cert.student_id}`
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erro ao baixar certificado");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `certificado-${studentName.replace(/\s+/g, "-").toLowerCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Certificado baixado!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao baixar";
      toast.error(msg);
    } finally {
      setDownloading(null);
    }
  };

  const handleBackToApp = () => {
    // Remove the ?certificados query param and go back to the main app
    window.location.href = window.location.pathname;
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-emerald-50 via-background to-background">
      {/* Header */}
      <header className="shrink-0 border-b bg-white/80 backdrop-blur-sm">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <Award className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">Certificados</h1>
              <p className="text-xs text-muted-foreground leading-tight">
                NUCA Plataforma
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBackToApp}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center px-4 py-8">
        <div className="w-full max-w-3xl">
          {/* Hero */}
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
              Consulta de Certificados
            </h2>
            <p className="text-muted-foreground text-sm sm:text-base max-w-xl mx-auto">
              Digite seu nome para encontrar seus certificados de participação
              em eventos concluídos. Filtre por evento para refinar a busca.
            </p>
          </div>

          {/* Search */}
          <Card className="mb-6">
            <CardContent className="pt-6 space-y-3">
              <form onSubmit={handleSubmit} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Digite seu nome completo..."
                    value={query}
                    onChange={(e) => handleInputChange(e.target.value)}
                    className="pl-9"
                    autoFocus
                  />
                </div>
                <Button type="submit" disabled={loading || query.trim().length < 2}>
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  <span className="ml-1 hidden sm:inline">Buscar</span>
                </Button>
              </form>

              {/* Event filter dropdown */}
              <div className="relative" ref={eventDropdownRef}>
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                  <button
                    type="button"
                    onClick={() => setEventSearchOpen((v) => !v)}
                    className="flex-1 text-left text-sm px-3 py-2 rounded-md border bg-background hover:bg-accent/50 transition-colors min-h-[40px] flex items-center justify-between"
                    aria-haspopup="listbox"
                    aria-expanded={eventSearchOpen}
                  >
                    <span className={selectedEvent ? "font-medium" : "text-muted-foreground"}>
                      {selectedEvent ? (
                        <span>
                          {selectedEvent.title}
                          <span className="text-xs text-muted-foreground ml-2">
                            {format(new Date(selectedEvent.date), "dd/MM/yyyy")}
                          </span>
                        </span>
                      ) : eventsLoading ? (
                        "Carregando eventos..."
                      ) : (
                        "Todos os eventos (filtro opcional)"
                      )}
                    </span>
                    {selectedEvent && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          clearEventFilter();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.stopPropagation();
                            e.preventDefault();
                            clearEventFilter();
                          }
                        }}
                        className="p-1 rounded hover:bg-muted flex items-center"
                        aria-label="Limpar filtro de evento"
                      >
                        <X className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </button>
                </div>
                {eventSearchOpen && (
                  <div
                    role="listbox"
                    className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded-md border bg-popover shadow-md"
                  >
                    <button
                      type="button"
                      onClick={() => handleEventSelect("")}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent border-b"
                    >
                      <span className="font-medium">Todos os eventos</span>
                      <span className="text-xs text-muted-foreground block">
                        Não filtrar por evento
                      </span>
                    </button>
                    {events.length === 0 && !eventsLoading ? (
                      <div className="px-3 py-3 text-sm text-muted-foreground">
                        Nenhum evento concluído disponível
                      </div>
                    ) : (
                      events.map((ev) => (
                        <button
                          key={ev.id}
                          type="button"
                          onClick={() => handleEventSelect(ev.id)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                        >
                          <div className="font-medium truncate">{ev.title}</div>
                          <div className="text-xs text-muted-foreground flex flex-wrap gap-2 mt-0.5">
                            <span>{format(new Date(ev.date), "dd/MM/yyyy")}</span>
                            {ev.school_name && <span>· {ev.school_name}</span>}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Results */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mb-2 text-emerald-600" />
              <p className="text-sm">Buscando certificados...</p>
            </div>
          )}

          {!loading && searched && results.length === 0 && (
            <Card>
              <CardContent className="pt-6 pb-6 flex flex-col items-center justify-center text-center">
                <AlertCircle className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="font-medium mb-1">Nenhum certificado encontrado</p>
                <p className="text-sm text-muted-foreground max-w-sm">
                  {query.trim().length < 2
                    ? "Digite pelo menos 2 caracteres para buscar."
                    : selectedEvent
                      ? `Nenhum certificado encontrado para "${query}" no evento "${selectedEvent.title}". Verifique o nome ou tente outro evento.`
                      : "Verifique se o nome está correto. Certificados só ficam disponíveis após a conclusão do evento."}
                </p>
              </CardContent>
            </Card>
          )}

          {!loading && results.length > 0 && (
            <div className="space-y-4">
              {selectedEvent && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CalendarDays className="h-4 w-4" />
                  <span>
                    Filtrando por evento: <strong className="text-foreground">{selectedEvent.title}</strong>
                  </span>
                </div>
              )}
              {results.map((student) => (
                <Card key={student.id}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Award className="h-4 w-4 text-emerald-600" />
                      {student.full_name}
                    </CardTitle>
                    <CardDescription>
                      {student.certificates.length} certificado(s) disponível(is)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {student.certificates.map((cert) => {
                      const key = `${cert.student_id}-${cert.event_id}`;
                      const isDownloading = downloading === key;
                      return (
                        <div
                          key={key}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">
                              {cert.event_title}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(cert.event_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                              </span>
                              {cert.event_location && (
                                <>
                                  <span className="text-xs text-muted-foreground">·</span>
                                  <span className="text-xs text-muted-foreground truncate">
                                    {cert.event_location}
                                  </span>
                                </>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                              {cert.school_name && (
                                <Badge variant="outline" className="text-xs">
                                  {cert.school_name}
                                </Badge>
                              )}
                              <Badge variant="secondary" className="text-xs">
                                {CATEGORY_LABELS[cert.event_category] || cert.event_category}
                              </Badge>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleDownload(cert, student.full_name)}
                            disabled={isDownloading}
                            className="shrink-0"
                          >
                            {isDownloading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Download className="h-4 w-4" />
                            )}
                            <span className="ml-1">Baixar</span>
                          </Button>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {!loading && !searched && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Award className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Digite seu nome para começar</p>
              {events.length > 0 && (
                <p className="text-xs mt-2">
                  {events.length} evento(s) com certificados disponível(is)
                </p>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Footer (sticky at bottom) */}
      <footer className="shrink-0 border-t bg-white/80 backdrop-blur-sm mt-auto">
        <div className="mx-auto max-w-3xl px-4 py-3 text-center text-xs text-muted-foreground">
          NUCA Plataforma · Sistema de Gestão Escolar
        </div>
      </footer>
    </div>
  );
}
