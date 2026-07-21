"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth, isSameDay, isToday, parseISO, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  Plus,
  ChevronLeft,
  ChevronRight,
  CalendarIcon,
  Loader2,
  Pencil,
  Trash2,
  Filter,
  Clock,
  MapPin,
  User,
  FileText,
  X,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  date: string; // ISO date
  end_date?: string;
  type: "event" | "reminder" | "holiday" | "meeting" | "announcement";
  color?: string;
  school_id?: string;
  location?: string;
  departure_time?: string;
  return_time?: string;
  responsible_name?: string;
  observations?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  school?: { id: string; name: string };
  creator?: { id: string; full_name: string };
}

interface School {
  id: string;
  name: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const EVENT_TYPE_COLORS: Record<CalendarEvent["type"], string> = {
  event: "#3B82F6",
  reminder: "#F59E0B",
  holiday: "#16A34A",
  meeting: "#8B5CF6",
  announcement: "#EA580C",
};

const EVENT_TYPE_LABELS: Record<CalendarEvent["type"], string> = {
  event: "Evento",
  reminder: "Lembrete",
  holiday: "Feriado",
  meeting: "Reunião",
  announcement: "Aviso",
};

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// ── Helpers ──────────────────────────────────────────────────────────────────

function getTypeColor(event: CalendarEvent): string {
  return event.color || EVENT_TYPE_COLORS[event.type];
}

function getMonthMatrix(date: Date): Date[][] {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const rows: Date[][] = [];
  let day = calStart;
  let row: Date[] = [];

  while (day <= calEnd) {
    row.push(day);
    if (row.length === 7) {
      rows.push(row);
      row = [];
    }
    day = addDays(day, 1);
  }
  if (row.length > 0) {
    rows.push(row);
  }
  return rows;
}

// ── Component ────────────────────────────────────────────────────────────────

export function CalendarPage() {
  const { user } = useAuthStore();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  // Filters
  const [typeFilters, setTypeFilters] = useState<Set<CalendarEvent["type"]>>(
    new Set(["event", "reminder", "holiday", "meeting", "announcement"])
  );
  const [schoolFilter, setSchoolFilter] = useState<string>("all");

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDate, setFormDate] = useState<Date | undefined>(undefined);
  const [formEndDate, setFormEndDate] = useState<Date | undefined>(undefined);
  const [formType, setFormType] = useState<CalendarEvent["type"]>("event");
  const [formSchoolId, setFormSchoolId] = useState<string>("");
  const [formColor, setFormColor] = useState<string>("");
  const [formLocation, setFormLocation] = useState("");
  const [formDepartureTime, setFormDepartureTime] = useState("");
  const [formReturnTime, setFormReturnTime] = useState("");
  const [formResponsibleName, setFormResponsibleName] = useState("");
  const [formObservations, setFormObservations] = useState("");
  const [formSaving, setFormSaving] = useState(false);

  // Date picker open states
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [endDatePickerOpen, setEndDatePickerOpen] = useState(false);

  // ── Fetch Events ─────────────────────────────────────────────────────────
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const monthStr = format(currentMonth, "yyyy-MM");
      const data = await api.get<{ events: CalendarEvent[] }>(
        `/calendar?month=${monthStr}`
      );
      setEvents(data.events || []);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Erro ao carregar eventos";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [currentMonth]);

  // ── Fetch Schools ────────────────────────────────────────────────────────
  const fetchSchools = useCallback(async () => {
    try {
      const data = await api.get<{ schools: School[] }>("/schools?limit=100");
      setSchools(data.schools || []);
    } catch {
      // Silent — schools filter is optional
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    fetchSchools();
  }, [fetchSchools]);

  // ── Filtered Events ──────────────────────────────────────────────────────
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (!typeFilters.has(e.type)) return false;
      if (schoolFilter !== "all" && e.school_id !== schoolFilter) return false;
      return true;
    });
  }, [events, typeFilters, schoolFilter]);

  // ── Events grouped by date ───────────────────────────────────────────────
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of filteredEvents) {
      const dateKey = event.date.slice(0, 10);
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(event);
    }
    return map;
  }, [filteredEvents]);

  // ── Selected day events ──────────────────────────────────────────────────
  const selectedDayEvents = useMemo(() => {
    if (!selectedDate) return [];
    const key = format(selectedDate, "yyyy-MM-dd");
    return eventsByDate.get(key) || [];
  }, [selectedDate, eventsByDate]);

  // ── Month Matrix ─────────────────────────────────────────────────────────
  const monthMatrix = useMemo(() => getMonthMatrix(currentMonth), [currentMonth]);

  // ── Open Create Dialog ───────────────────────────────────────────────────
  const openCreateDialog = (date?: Date) => {
    setEditingEvent(null);
    setFormTitle("");
    setFormDescription("");
    setFormDate(date || new Date());
    setFormEndDate(undefined);
    setFormType("event");
    setFormSchoolId("");
    setFormColor("");
    setFormLocation("");
    setFormDepartureTime("");
    setFormReturnTime("");
    setFormResponsibleName("");
    setFormObservations("");
    setEventDialogOpen(true);
  };

  // ── Open Edit Dialog ─────────────────────────────────────────────────────
  const openEditDialog = (event: CalendarEvent) => {
    setEditingEvent(event);
    setFormTitle(event.title);
    setFormDescription(event.description || "");
    setFormDate(event.date ? parseISO(event.date) : undefined);
    setFormEndDate(event.end_date ? parseISO(event.end_date) : undefined);
    setFormType(event.type);
    setFormSchoolId(event.school_id || "");
    setFormColor(event.color || "");
    setFormLocation(event.location || "");
    setFormDepartureTime(event.departure_time || "");
    setFormReturnTime(event.return_time || "");
    setFormResponsibleName(event.responsible_name || "");
    setFormObservations(event.observations || "");
    setEventDialogOpen(true);
  };

  // ── Save Event ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!formTitle.trim()) {
      toast.error("Título é obrigatório");
      return;
    }
    if (!formDate) {
      toast.error("Data é obrigatória");
      return;
    }

    setFormSaving(true);
    try {
      const payload: Record<string, unknown> = {
        title: formTitle.trim(),
        description: formDescription.trim() || undefined,
        date: format(formDate, "yyyy-MM-dd"),
        end_date: formEndDate ? format(formEndDate, "yyyy-MM-dd") : undefined,
        type: formType,
        school_id: formSchoolId && formSchoolId !== 'none' ? formSchoolId : undefined,
        color: formColor || undefined,
        location: (formType === "event" || formType === "meeting") ? (formLocation.trim() || undefined) : undefined,
        departure_time: (formType === "event" || formType === "meeting") ? (formDepartureTime.trim() || undefined) : undefined,
        return_time: (formType === "event" || formType === "meeting") ? (formReturnTime.trim() || undefined) : undefined,
        responsible_name: (formType === "event" || formType === "meeting") ? (formResponsibleName.trim() || undefined) : undefined,
        observations: (formType === "event" || formType === "meeting") ? (formObservations.trim() || undefined) : undefined,
      };

      if (editingEvent) {
        await api.put(`/calendar`, { id: editingEvent.id, ...payload });
        toast.success("Evento atualizado com sucesso!");
      } else {
        await api.post(`/calendar`, payload);
        toast.success("Evento criado com sucesso!");
      }

      setEventDialogOpen(false);
      fetchEvents();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Erro ao salvar evento";
      toast.error(msg);
    } finally {
      setFormSaving(false);
    }
  };

  // ── Delete Event ─────────────────────────────────────────────────────────
  const handleDelete = async (eventId: string) => {
    try {
      await api.delete(`/calendar`, { id: eventId });
      toast.success("Evento excluído com sucesso!");
      fetchEvents();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Erro ao excluir evento";
      toast.error(msg);
    }
  };

  // ── Day Click ────────────────────────────────────────────────────────────
  const handleDayClick = (day: Date) => {
    setSelectedDate(day);
    setDetailSheetOpen(true);
  };

  // ── Can Edit/Delete ──────────────────────────────────────────────────────
  const canModify = (event: CalendarEvent) => {
    if (!user) return false;
    return user.role === "Admin" || event.created_by === user.id;
  };

  // ── Auto-color based on type ─────────────────────────────────────────────
  const currentTypeColor = formColor || EVENT_TYPE_COLORS[formType];

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* ── Top Bar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-sm sm:text-lg font-semibold text-center capitalize truncate">
            {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
          </h2>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentMonth(new Date())}
            className="text-xs"
          >
            Hoje
          </Button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Type Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                <Filter className="h-3.5 w-3.5" />
                Tipo
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(
                Object.entries(EVENT_TYPE_LABELS) as [CalendarEvent["type"], string][]
              ).map(([type, label]) => (
                <DropdownMenuCheckboxItem
                  key={type}
                  checked={typeFilters.has(type)}
                  onCheckedChange={(checked) => {
                    setTypeFilters((prev) => {
                      const next = new Set(prev);
                      if (checked) next.add(type);
                      else next.delete(type);
                      return next;
                    });
                  }}
                >
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full mr-2 shrink-0"
                    style={{ backgroundColor: EVENT_TYPE_COLORS[type] }}
                  />
                  {label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* School Filter */}
          {schools.length > 0 && (
            <Select value={schoolFilter} onValueChange={setSchoolFilter}>
              <SelectTrigger className="w-full sm:w-[160px] h-8 text-xs">
                <SelectValue placeholder="Escola" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as escolas</SelectItem>
                {schools.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* New Event Button */}
          <Button size="sm" onClick={() => openCreateDialog()} className="gap-1">
            <Plus className="h-4 w-4" />
            Novo Evento
          </Button>
        </div>
      </div>

      {/* ── Main Content ─────────────────────────────────────────────────── */}
      <div className="flex gap-6 flex-1 min-h-0">
        {/* ── Left Sidebar: Mini Calendar ───────────────────────────────── */}
        <div className="hidden lg:flex flex-col gap-4 w-[300px] shrink-0">
          <Card>
            <CardContent className="p-3">
              <Calendar
                mode="single"
                selected={selectedDate || undefined}
                onSelect={(date) => {
                  if (date) {
                    setSelectedDate(date);
                    setCurrentMonth(date);
                  }
                }}
                month={currentMonth}
                onMonthChange={setCurrentMonth}
                locale={ptBR}
              />
            </CardContent>
          </Card>

          {/* Legend */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium">Legenda</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="flex flex-col gap-2">
                {(
                  Object.entries(EVENT_TYPE_LABELS) as [CalendarEvent["type"], string][]
                ).map(([type, label]) => (
                  <div key={type} className="flex items-center gap-2 text-sm">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: EVENT_TYPE_COLORS[type] }}
                    />
                    {label}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium">Resumo do Mês</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                <span>{filteredEvents.length} evento(s) no mês</span>
                {selectedDate && (
                  <span>
                    {selectedDayEvents.length} evento(s) em{" "}
                    {format(selectedDate, "dd/MM", { locale: ptBR })}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Calendar Grid ─────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {/* Desktop Grid View */}
          <Card className="hidden md:block h-full">
            <CardContent className="p-0 h-full flex flex-col">
              {/* Weekday Header */}
              <div className="grid grid-cols-7 border-b">
                {WEEKDAY_LABELS.map((label) => (
                  <div
                    key={label}
                    className="py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                  >
                    {label}
                  </div>
                ))}
              </div>

              {/* Day Cells */}
              <div className="flex-1 grid auto-rows-fr" style={{ gridTemplateRows: `repeat(${monthMatrix.length}, 1fr)` }}>
                {loading ? (
                  <div className="col-span-7 flex items-center justify-center py-20">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  monthMatrix.map((week, weekIdx) => (
                    <div key={weekIdx} className="grid grid-cols-7 border-b last:border-b-0">
                      {week.map((day, dayIdx) => {
                        const dateKey = format(day, "yyyy-MM-dd");
                        const dayEvents = eventsByDate.get(dateKey) || [];
                        const inMonth = isSameMonth(day, currentMonth);
                        const today = isToday(day);
                        const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
                        const maxVisible = 3;
                        const overflow = dayEvents.length - maxVisible;

                        return (
                          <div
                            key={dayIdx}
                            onClick={() => handleDayClick(day)}
                            className={`group relative border-r last:border-r-0 p-1.5 min-h-[90px] cursor-pointer transition-colors hover:bg-accent/50 ${
                              !inMonth ? "bg-muted/30" : ""
                            } ${isSelected ? "bg-accent/30" : ""}`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span
                                className={`text-xs font-medium inline-flex items-center justify-center w-6 h-6 rounded-full ${
                                  today
                                    ? "bg-primary text-primary-foreground"
                                    : !inMonth
                                      ? "text-muted-foreground/50"
                                      : "text-foreground"
                                }`}
                              >
                                {format(day, "d")}
                              </span>
                            </div>

                            <div className="flex flex-col gap-0.5 overflow-hidden">
                              {dayEvents.slice(0, maxVisible).map((event) => {
                                const color = getTypeColor(event);
                                return (
                                  <div
                                    key={event.id}
                                    className="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] leading-tight truncate"
                                    style={{
                                      backgroundColor: `${color}15`,
                                      color: color,
                                    }}
                                    title={event.title}
                                  >
                                    <span
                                      className="w-1.5 h-1.5 rounded-full shrink-0"
                                      style={{ backgroundColor: color }}
                                    />
                                    <span className="truncate">{event.title}</span>
                                  </div>
                                );
                              })}
                              {overflow > 0 && (
                                <span className="text-[10px] text-muted-foreground pl-1 font-medium">
                                  +{overflow} mais
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Mobile List View */}
          <div className="md:hidden flex flex-col gap-3">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredEvents.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <CalendarIcon className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                  <p>Nenhum evento encontrado neste mês.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => openCreateDialog()}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Criar Evento
                  </Button>
                </CardContent>
              </Card>
            ) : (
              Object.entries(eventsByDate)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([dateKey, dayEvents]) => {
                  const date = parseISO(dateKey);
                  return (
                    <Card key={dateKey}>
                      <CardHeader className="pb-2 pt-3 px-4">
                        <CardTitle className="text-sm font-semibold capitalize">
                          {format(date, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-3">
                        <div className="flex flex-col gap-2">
                          {dayEvents.map((event) => {
                            const color = getTypeColor(event);
                            return (
                              <div
                                key={event.id}
                                className="flex items-start gap-2 p-2 rounded-md"
                                style={{ backgroundColor: `${color}10` }}
                              >
                                <span
                                  className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                                  style={{ backgroundColor: color }}
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">
                                    {event.title}
                                  </p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <Badge
                                      variant="secondary"
                                      className="text-[10px] px-1.5 py-0"
                                      style={{
                                        backgroundColor: `${color}20`,
                                        color: color,
                                        borderColor: "transparent",
                                      }}
                                    >
                                      {EVENT_TYPE_LABELS[event.type]}
                                    </Badge>
                                    {event.school && (
                                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                        <MapPin className="h-2.5 w-2.5" />
                                        {event.school.name}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {canModify(event) && (
                                  <div className="flex gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openEditDialog(event);
                                      }}
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-destructive hover:text-destructive"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete(event.id);
                                      }}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
            )}
          </div>
        </div>
      </div>

      {/* ── Event Detail Sheet ─────────────────────────────────────────────── */}
      <Sheet open={detailSheetOpen} onOpenChange={setDetailSheetOpen}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="capitalize">
              {selectedDate
                ? format(selectedDate, "EEEE, dd 'de' MMMM yyyy", { locale: ptBR })
                : "Detalhes do Dia"}
            </SheetTitle>
          </SheetHeader>

          <ScrollArea className="flex-1 -mx-6 px-6">
            {selectedDayEvents.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <CalendarIcon className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                <p className="text-sm">Nenhum evento neste dia.</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    setDetailSheetOpen(false);
                    openCreateDialog(selectedDate || undefined);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Criar Evento
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3 py-4">
                {selectedDayEvents.map((event) => {
                  const color = getTypeColor(event);
                  return (
                    <Card key={event.id} className="overflow-hidden">
                      <div
                        className="h-1.5"
                        style={{ backgroundColor: color }}
                      />
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-sm truncate">
                              {event.title}
                            </h4>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge
                                className="text-[10px] px-1.5 py-0"
                                style={{
                                  backgroundColor: `${color}20`,
                                  color: color,
                                  borderColor: "transparent",
                                }}
                              >
                                {EVENT_TYPE_LABELS[event.type]}
                              </Badge>
                            </div>
                          </div>
                          {canModify(event) && (
                            <div className="flex gap-1 shrink-0">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => {
                                  setDetailSheetOpen(false);
                                  openEditDialog(event);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => {
                                  handleDelete(event.id);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>

                        {event.description && (
                          <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap">
                            {event.description}
                          </p>
                        )}

                        <Separator className="my-2.5" />

                        <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <CalendarIcon className="h-3 w-3" />
                            <span>
                              {format(parseISO(event.date), "dd/MM/yyyy", {
                                locale: ptBR,
                              })}
                              {event.end_date &&
                                ` — ${format(parseISO(event.end_date), "dd/MM/yyyy", { locale: ptBR })}`}
                            </span>
                          </div>
                          {event.school && (
                            <div className="flex items-center gap-1.5">
                              <MapPin className="h-3 w-3" />
                              <span>{event.school.name}</span>
                            </div>
                          )}
                          {event.location && (
                            <div className="flex items-center gap-1.5">
                              <MapPin className="h-3 w-3" />
                              <span>{event.location}</span>
                            </div>
                          )}
                          {(event.departure_time || event.return_time) && (
                            <div className="flex items-center gap-1.5">
                              <Clock className="h-3 w-3" />
                              <span>
                                {event.departure_time && `Saída: ${event.departure_time}`}
                                {event.departure_time && event.return_time && " — "}
                                {event.return_time && `Retorno: ${event.return_time}`}
                              </span>
                            </div>
                          )}
                          {event.responsible_name && (
                            <div className="flex items-center gap-1.5">
                              <User className="h-3 w-3" />
                              <span>Responsável: {event.responsible_name}</span>
                            </div>
                          )}
                          {event.observations && (
                            <div className="flex items-start gap-1.5">
                              <FileText className="h-3 w-3 mt-0.5 shrink-0" />
                              <span className="whitespace-pre-wrap">{event.observations}</span>
                            </div>
                          )}
                          {event.creator && (
                            <div className="flex items-center gap-1.5">
                              <Clock className="h-3 w-3" />
                              <span>Criado por {event.creator.full_name}</span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* ── Create/Edit Event Dialog ───────────────────────────────────────── */}
      <Dialog open={eventDialogOpen} onOpenChange={setEventDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingEvent ? "Editar Evento" : "Novo Evento"}
            </DialogTitle>
            <DialogDescription>
              {editingEvent
                ? "Atualize as informações do evento."
                : "Preencha as informações para criar um novo evento."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            {/* Title */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-title">Título *</Label>
              <Input
                id="event-title"
                placeholder="Nome do evento"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
              />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-description">Descrição</Label>
              <Textarea
                id="event-description"
                placeholder="Detalhes do evento (opcional)"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={3}
              />
            </div>

            {/* Date + End Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Data *</Label>
                <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="justify-start text-left font-normal h-9"
                    >
                      <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                      {formDate
                        ? format(formDate, "dd/MM/yyyy")
                        : "Selecionar data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={formDate}
                      onSelect={(date) => {
                        setFormDate(date || undefined);
                        setDatePickerOpen(false);
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Data de Término</Label>
                <Popover
                  open={endDatePickerOpen}
                  onOpenChange={setEndDatePickerOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="justify-start text-left font-normal h-9"
                    >
                      <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                      {formEndDate
                        ? format(formEndDate, "dd/MM/yyyy")
                        : "Opcional"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={formEndDate}
                      onSelect={(date) => {
                        setFormEndDate(date || undefined);
                        setEndDatePickerOpen(false);
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Type + School */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Tipo</Label>
                <Select
                  value={formType}
                  onValueChange={(val) => {
                    setFormType(val as CalendarEvent["type"]);
                    setFormColor(""); // reset custom color when type changes
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      Object.entries(EVENT_TYPE_LABELS) as [
                        CalendarEvent["type"],
                        string,
                      ][]
                    ).map(([type, label]) => (
                      <SelectItem key={type} value={type}>
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{
                              backgroundColor: EVENT_TYPE_COLORS[type],
                            }}
                          />
                          {label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Escola</Label>
                <Select
                  value={formSchoolId || "__none__"}
                  onValueChange={(val) => setFormSchoolId(val === "__none__" ? "" : val)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Nenhuma" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhuma</SelectItem>
                    {schools.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Color Preview */}
            <div className="flex flex-col gap-1.5">
              <Label>Cor</Label>
              <div className="flex items-center gap-3">
                <span
                  className="w-8 h-8 rounded-md border"
                  style={{ backgroundColor: currentTypeColor }}
                />
                <span className="text-xs text-muted-foreground">
                  Cor automática baseada no tipo. Altere o tipo para mudar.
                </span>
              </div>
            </div>

            {/* Trip/Activity Fields — only for event & meeting types */}
            {(formType === "event" || formType === "meeting") && (
              <>
                <Separator />

                {/* Location */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="event-location">Local / Destino</Label>
                  <Input
                    id="event-location"
                    placeholder="Destino da atividade ou passeio"
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                  />
                </div>

                {/* Departure + Return Time */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="event-departure-time">Horário de Saída</Label>
                    <Input
                      id="event-departure-time"
                      type="time"
                      value={formDepartureTime}
                      onChange={(e) => setFormDepartureTime(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="event-return-time">Horário de Retorno</Label>
                    <Input
                      id="event-return-time"
                      type="time"
                      value={formReturnTime}
                      onChange={(e) => setFormReturnTime(e.target.value)}
                    />
                  </div>
                </div>

                {/* Responsible */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="event-responsible">Responsável</Label>
                  <Input
                    id="event-responsible"
                    placeholder="Nome do responsável pelo passeio"
                    value={formResponsibleName}
                    onChange={(e) => setFormResponsibleName(e.target.value)}
                  />
                </div>

                {/* Observations */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="event-observations">Observações</Label>
                  <Textarea
                    id="event-observations"
                    placeholder="Notas adicionais (opcional)"
                    value={formObservations}
                    onChange={(e) => setFormObservations(e.target.value)}
                    rows={3}
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setEventDialogOpen(false)}
              disabled={formSaving}
            >
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={formSaving}>
              {formSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {formSaving
                ? "Salvando..."
                : editingEvent
                  ? "Atualizar"
                  : "Criar Evento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
