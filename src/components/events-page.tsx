"use client";

import { useEffect, useState, useCallback } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { api, ApiError } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CalendarDays,
  Plus,
  Pencil,
  Trash2,
  Search,
  Loader2,
  MapPin,
  ArrowLeft,
  Users,
  CheckCircle2,
  XCircle,
  UserPlus,
  UserMinus,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

interface EventData {
  id: string;
  title: string;
  description: string | null;
  date: string;
  location: string | null;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  creator?: { id: string; full_name: string };
  participant_count?: number;
}

interface EventParticipant {
  id: string;
  event_id: string;
  student_id: string;
  attended: boolean;
  notes: string | null;
  created_at: string;
  student: {
    id: string;
    full_name: string;
    grade: string | null;
    class: string | null;
    photo: string | null;
    school: { id: string; name: string } | null;
  };
}

interface EventDetailData extends Omit<EventData, "participant_count"> {
  participants: EventParticipant[];
}

interface StudentOption {
  id: string;
  full_name: string;
  grade: string | null;
  class: string | null;
  school: { id: string; name: string } | null;
}

interface EventFormData {
  title: string;
  description: string;
  date: string;
  location: string;
  status: string;
}

const emptyForm: EventFormData = {
  title: "",
  description: "",
  date: "",
  location: "",
  status: "upcoming",
};

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

const statusBadgeClass: Record<string, string> = {
  upcoming: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  ongoing: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  completed: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300 border-red-200 dark:border-red-800",
};

const statusLabels: Record<string, string> = {
  upcoming: "Próximo",
  ongoing: "Em Andamento",
  completed: "Concluído",
  cancelled: "Cancelado",
};

// ── Main Component ─────────────────────────────────────────────────────────

export function EventsPage() {
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = currentUser?.role === "Admin";

  // View state
  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // List state
  const [events, setEvents] = useState<EventData[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Detail state
  const [eventDetail, setEventDetail] = useState<EventDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventData | null>(null);
  const [formData, setFormData] = useState<EventFormData>(emptyForm);
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingEvent, setDeletingEvent] = useState<EventData | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Add students dialog
  const [addStudentsOpen, setAddStudentsOpen] = useState(false);
  const [availableStudents, setAvailableStudents] = useState<StudentOption[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [addStudentsLoading, setAddStudentsLoading] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");

  // ── Data Fetching ──────────────────────────────────────────────────────

  const fetchEvents = useCallback(async () => {
    try {
      setEventsLoading(true);
      const params = new URLSearchParams();
      params.set("limit", "100");
      if (searchQuery) params.set("search", searchQuery);
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      const data = await api.get<{ events: EventData[]; pagination: { total: number } }>(`/events?${params.toString()}`);
      setEvents(data.events);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        toast.error("Erro ao carregar eventos");
      }
    } finally {
      setEventsLoading(false);
    }
  }, [searchQuery, statusFilter]);

  const fetchEventDetail = useCallback(async (id: string) => {
    try {
      setDetailLoading(true);
      const data = await api.get<{ event: EventDetailData }>(`/events/${id}`);
      setEventDetail(data.event);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        toast.error("Erro ao carregar detalhes do evento");
      }
      setView("list");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    if (view === "detail" && selectedEventId) {
      fetchEventDetail(selectedEventId);
    }
  }, [view, selectedEventId, fetchEventDetail]);

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleViewDetail = (event: EventData) => {
    setSelectedEventId(event.id);
    setView("detail");
  };

  const handleBackToList = () => {
    setView("list");
    setSelectedEventId(null);
    setEventDetail(null);
    fetchEvents();
  };

  const handleOpenCreate = () => {
    setEditingEvent(null);
    setFormData(emptyForm);
    setDialogOpen(true);
  };

  const handleOpenEdit = (event: EventData | EventDetailData) => {
    setEditingEvent(event as EventData);
    setFormData({
      title: event.title,
      description: event.description || "",
      date: event.date ? new Date(event.date).toISOString().slice(0, 16) : "",
      location: event.location || "",
      status: event.status,
    });
    setDialogOpen(true);
  };

  const handleSubmitForm = async () => {
    if (!formData.title.trim()) {
      toast.error("Título do evento é obrigatório");
      return;
    }
    if (!formData.date) {
      toast.error("Data do evento é obrigatória");
      return;
    }

    try {
      setFormSubmitting(true);

      const payload = {
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        date: new Date(formData.date).toISOString(),
        location: formData.location.trim() || null,
        status: formData.status,
      };

      if (editingEvent) {
        await api.put(`/events/${editingEvent.id}`, payload);
        toast.success("Evento atualizado com sucesso!");
      } else {
        await api.post("/events", payload);
        toast.success("Evento criado com sucesso!");
      }

      setDialogOpen(false);
      setEditingEvent(null);
      setFormData(emptyForm);

      if (view === "detail" && selectedEventId) {
        fetchEventDetail(selectedEventId);
      }
      fetchEvents();
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message || "Erro ao salvar evento");
      } else {
        toast.error("Erro ao salvar evento");
      }
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDelete = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    if (!deletingEvent) return;

    try {
      setDeleteLoading(true);
      await api.delete(`/events/${deletingEvent.id}`);
      toast.success("Evento excluído com sucesso!");
      setDeleteDialogOpen(false);
      setDeletingEvent(null);
      handleBackToList();
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message || "Erro ao excluir evento");
      } else {
        toast.error("Erro ao excluir evento");
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── Participants handlers ────────────────────────────────────────────

  const handleOpenAddStudents = async () => {
    if (!eventDetail) return;
    setAddStudentsOpen(true);
    setSelectedStudentIds([]);
    setStudentSearch("");
    try {
      const data = await api.get<{ students: StudentOption[] }>("/students?limit=200");
      // Filter out students already in the event
      const existingIds = new Set(eventDetail.participants.map((p) => p.student_id));
      const available = data.students.filter((s) => !existingIds.has(s.id));
      setAvailableStudents(available);
    } catch {
      toast.error("Erro ao carregar lista de alunos");
    }
  };

  const handleAddStudents = async () => {
    if (!selectedEventId || selectedStudentIds.length === 0) return;

    try {
      setAddStudentsLoading(true);
      await api.post(`/events/${selectedEventId}/participants`, {
        student_ids: selectedStudentIds,
      });
      toast.success(`${selectedStudentIds.length} aluno(s) adicionado(s) ao evento`);
      setAddStudentsOpen(false);
      setSelectedStudentIds([]);
      fetchEventDetail(selectedEventId);
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error("Erro ao adicionar alunos");
      }
    } finally {
      setAddStudentsLoading(false);
    }
  };

  const handleRemoveStudent = async (studentId: string) => {
    if (!selectedEventId) return;
    try {
      await api.delete(`/events/${selectedEventId}/participants`, {
        student_id: studentId,
      });
      toast.success("Aluno removido do evento");
      fetchEventDetail(selectedEventId);
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error("Erro ao remover aluno");
      }
    }
  };

  const handleToggleAttended = async (studentId: string, attended: boolean) => {
    if (!selectedEventId) return;
    try {
      await api.put(`/events/${selectedEventId}/participants`, {
        student_id: studentId,
        attended,
      });
      fetchEventDetail(selectedEventId);
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error("Erro ao atualizar presença");
      }
    }
  };

  const handleUpdateNotes = async (studentId: string, notes: string) => {
    if (!selectedEventId) return;
    try {
      await api.put(`/events/${selectedEventId}/participants`, {
        student_id: studentId,
        notes,
      });
    } catch {
      // Silent fail for notes update
    }
  };

  const toggleStudentSelection = (studentId: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId]
    );
  };

  const debouncedStudentSearch = useDebounce(studentSearch, 300);

  const filteredAvailableStudents = availableStudents.filter((s) =>
    s.full_name.toLowerCase().includes(debouncedStudentSearch.toLowerCase())
  );

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {view === "detail" && selectedEventId ? (
        <EventDetailView
          event={eventDetail}
          loading={detailLoading}
          onBack={handleBackToList}
          onEdit={isAdmin ? handleOpenEdit : undefined}
          onDelete={isAdmin ? (ev) => { setDeletingEvent(ev as EventData); setDeleteDialogOpen(true); } : undefined}
          onAddStudents={isAdmin ? handleOpenAddStudents : undefined}
          onRemoveStudent={isAdmin ? handleRemoveStudent : undefined}
          onToggleAttended={isAdmin ? handleToggleAttended : undefined}
          onUpdateNotes={isAdmin ? handleUpdateNotes : undefined}
        />
      ) : (
        <>
          {/* Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Eventos</h1>
              <p className="text-muted-foreground mt-1">
                Gerencie os eventos da plataforma
              </p>
            </div>
            {isAdmin && (
              <Button onClick={handleOpenCreate} className="shrink-0">
                <Plus className="mr-2 h-4 w-4" />
                Novo Evento
              </Button>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar evento pelo título..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="upcoming">Próximo</SelectItem>
                <SelectItem value="ongoing">Em Andamento</SelectItem>
                <SelectItem value="completed">Concluído</SelectItem>
                <SelectItem value="cancelled">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Loading */}
          {eventsLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i}>
                  <CardHeader className="pb-3">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-2/3" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : events.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CalendarDays className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground text-sm">
                  {searchQuery || statusFilter !== "all"
                    ? "Nenhum evento encontrado com esses filtros"
                    : "Nenhum evento cadastrado"}
                </p>
                {isAdmin && !searchQuery && statusFilter === "all" && (
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={handleOpenCreate}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Criar primeiro evento
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Mobile: Cards */}
              <div className="grid gap-4 sm:grid-cols-2 lg:hidden">
                {events.map((event) => (
                  <Card
                    key={event.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => handleViewDetail(event)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base line-clamp-1">
                          {event.title}
                        </CardTitle>
                        <Badge variant="outline" className={statusBadgeClass[event.status] || ""}>
                          {statusLabels[event.status] || event.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                        <span>{formatDateTime(event.date)}</span>
                      </div>
                      {event.location && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="line-clamp-1">{event.location}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Users className="h-3.5 w-3.5 shrink-0" />
                        <span>{event.participant_count ?? 0} participante(s)</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Desktop: Table */}
              <div className="hidden lg:block">
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Título</TableHead>
                          <TableHead>Data</TableHead>
                          <TableHead>Local</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-center">Participantes</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {events.map((event) => (
                          <TableRow
                            key={event.id}
                            className="cursor-pointer"
                            onClick={() => handleViewDetail(event)}
                          >
                            <TableCell className="font-medium">
                              {event.title}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatDateTime(event.date)}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {event.location || "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={statusBadgeClass[event.status] || ""}>
                                {statusLabels[event.status] || event.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary">
                                {event.participant_count ?? 0}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {isAdmin && (
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenEdit(event);
                                    }}
                                    title="Editar"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeletingEvent(event);
                                      setDeleteDialogOpen(true);
                                    }}
                                    title="Excluir"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingEvent ? "Editar Evento" : "Novo Evento"}
            </DialogTitle>
            <DialogDescription>
              {editingEvent
                ? "Atualize as informações do evento abaixo."
                : "Preencha os dados para criar um novo evento."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="event-title">
                Título <span className="text-destructive">*</span>
              </Label>
              <Input
                id="event-title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Título do evento"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-description">Descrição</Label>
              <Textarea
                id="event-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descrição do evento"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-date">
                Data e Hora <span className="text-destructive">*</span>
              </Label>
              <Input
                id="event-date"
                type="datetime-local"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-location">Local</Label>
              <Input
                id="event-location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="Local do evento"
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={formData.status}
                onValueChange={(v) => setFormData({ ...formData, status: v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="upcoming">Próximo</SelectItem>
                  <SelectItem value="ongoing">Em Andamento</SelectItem>
                  <SelectItem value="completed">Concluído</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={formSubmitting}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={handleSubmitForm} disabled={formSubmitting}>
              {formSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : editingEvent ? (
                "Salvar Alterações"
              ) : (
                "Criar Evento"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Evento</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir o evento{" "}
              <strong>{deletingEvent?.title}</strong>? Todos os participantes serão removidos. Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleteLoading}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleDelete}
              disabled={deleteLoading}
              variant="destructive"
            >
              {deleteLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Excluindo...
                </>
              ) : (
                "Excluir"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Students Dialog */}
      <Dialog open={addStudentsOpen} onOpenChange={setAddStudentsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar Alunos</DialogTitle>
            <DialogDescription>
              Selecione os alunos que deseja adicionar ao evento.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar aluno pelo nome..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <ScrollArea className="h-[300px] border rounded-lg">
              {filteredAvailableStudents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Users className="h-8 w-8 mb-2" />
                  <p className="text-sm">Nenhum aluno disponível</p>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {filteredAvailableStudents.map((student) => (
                    <label
                      key={student.id}
                      className="flex items-center gap-3 p-2 rounded-md hover:bg-muted cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedStudentIds.includes(student.id)}
                        onChange={() => toggleStudentSelection(student.id)}
                        className="rounded border-muted-foreground"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{student.full_name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {student.school?.name || "—"} • {student.grade || "—"}
                          {student.class ? ` / Turma ${student.class}` : ""}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </ScrollArea>
            {selectedStudentIds.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {selectedStudentIds.length} aluno(s) selecionado(s)
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddStudentsOpen(false)}
              disabled={addStudentsLoading}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleAddStudents}
              disabled={addStudentsLoading || selectedStudentIds.length === 0}
            >
              {addStudentsLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adicionando...
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Adicionar ({selectedStudentIds.length})
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Event Detail View ──────────────────────────────────────────────────────

function EventDetailView({
  event,
  loading,
  onBack,
  onEdit,
  onDelete,
  onAddStudents,
  onRemoveStudent,
  onToggleAttended,
  onUpdateNotes,
}: {
  event: EventDetailData | null;
  loading: boolean;
  onBack: () => void;
  onEdit?: (event: EventDetailData) => void;
  onDelete?: (event: EventDetailData) => void;
  onAddStudents?: () => void;
  onRemoveStudent?: (studentId: string) => void;
  onToggleAttended?: (studentId: string, attended: boolean) => void;
  onUpdateNotes?: (studentId: string, notes: string) => void;
}) {
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [notesValue, setNotesValue] = useState("");

  if (loading || !event) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-9 rounded-md" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-40" />
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-48 w-full rounded-lg" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const participants = event.participants || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Voltar</span>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{event.title}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className={statusBadgeClass[event.status] || ""}>
                {statusLabels[event.status] || event.status}
              </Badge>
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" />
                {formatDateTime(event.date)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onEdit && (
            <Button variant="outline" onClick={() => onEdit(event)}>
              <Pencil className="mr-2 h-4 w-4" />
              Editar
            </Button>
          )}
          {onDelete && (
            <Button variant="destructive" onClick={() => onDelete(event)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir
            </Button>
          )}
        </div>
      </div>

      {/* Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informações do Evento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {event.description && (
            <div className="flex items-start gap-3">
              <span className="text-sm text-muted-foreground shrink-0">Descrição</span>
              <p className="text-sm whitespace-pre-wrap">{event.description}</p>
            </div>
          )}
          <div className="flex items-center gap-3">
            <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Data e Hora</p>
              <p className="text-sm font-medium">{formatDateTime(event.date)}</p>
            </div>
          </div>
          {event.location && (
            <div className="flex items-center gap-3">
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Local</p>
                <p className="text-sm font-medium">{event.location}</p>
              </div>
            </div>
          )}
          {event.creator && (
            <div className="flex items-center gap-3">
              <Users className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Criado por</p>
                <p className="text-sm font-medium">{event.creator.full_name}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Participants */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-5 w-5" />
              Participantes
              <Badge variant="secondary" className="ml-1">
                {participants.length}
              </Badge>
            </CardTitle>
            {onAddStudents && (
              <Button size="sm" onClick={onAddStudents}>
                <UserPlus className="mr-1 h-4 w-4" />
                Adicionar Alunos
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {participants.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Users className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                Nenhum participante adicionado a este evento
              </p>
              {onAddStudents && (
                <Button variant="outline" size="sm" className="mt-3" onClick={onAddStudents}>
                  <UserPlus className="mr-1 h-4 w-4" />
                  Adicionar Alunos
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Mobile: Cards */}
              <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
                {participants.map((participant) => (
                  <div
                    key={participant.id}
                    className="flex items-start gap-3 rounded-lg border p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {participant.student.full_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {participant.student.school?.name || "—"} • {participant.student.grade || "—"}
                        {participant.student.class ? ` / Turma ${participant.student.class}` : ""}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        {onToggleAttended ? (
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={participant.attended}
                              onChange={(e) => onToggleAttended(participant.student_id, e.target.checked)}
                              className="rounded"
                            />
                            <span className="text-xs">Presente</span>
                          </label>
                        ) : (
                          <span className="text-xs">
                            {participant.attended ? (
                              <span className="inline-flex items-center gap-1 text-emerald-600">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Presente
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-red-500">
                                <XCircle className="h-3.5 w-3.5" /> Ausente
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                      {editingNotes === participant.id ? (
                        <div className="mt-2 flex gap-1">
                          <Input
                            size={1}
                            value={notesValue}
                            onChange={(e) => setNotesValue(e.target.value)}
                            placeholder="Observações..."
                            className="text-xs h-7"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => {
                              onUpdateNotes?.(participant.student_id, notesValue);
                              setEditingNotes(null);
                            }}
                          >
                            OK
                          </Button>
                        </div>
                      ) : (
                        <p
                          className="text-xs text-muted-foreground mt-1 cursor-pointer hover:underline"
                          onClick={() => {
                            setEditingNotes(participant.id);
                            setNotesValue(participant.notes || "");
                          }}
                        >
                          {participant.notes || "Adicionar observações..."}
                        </p>
                      )}
                    </div>
                    {onRemoveStudent && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                        onClick={() => onRemoveStudent(participant.student_id)}
                        title="Remover"
                      >
                        <UserMinus className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop: Table */}
              <div className="hidden lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Aluno</TableHead>
                      <TableHead>Escola</TableHead>
                      <TableHead>Série/Turma</TableHead>
                      <TableHead className="text-center">Presença</TableHead>
                      <TableHead>Observações</TableHead>
                      {onRemoveStudent && <TableHead className="w-12"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {participants.map((participant) => (
                      <TableRow key={participant.id}>
                        <TableCell className="font-medium">
                          {participant.student.full_name}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {participant.student.school?.name || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {participant.student.grade || "—"}
                          {participant.student.class ? ` / Turma ${participant.student.class}` : ""}
                        </TableCell>
                        <TableCell className="text-center">
                          {onToggleAttended ? (
                            <input
                              type="checkbox"
                              checked={participant.attended}
                              onChange={(e) => onToggleAttended(participant.student_id, e.target.checked)}
                              className="rounded"
                            />
                          ) : participant.attended ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-4 w-4" />
                              Presente
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-500 dark:text-red-400">
                              <XCircle className="h-4 w-4" />
                              Ausente
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {editingNotes === participant.id ? (
                            <div className="flex gap-1">
                              <Input
                                value={notesValue}
                                onChange={(e) => setNotesValue(e.target.value)}
                                placeholder="Observações..."
                                className="text-xs h-7"
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs shrink-0"
                                onClick={() => {
                                  onUpdateNotes?.(participant.student_id, notesValue);
                                  setEditingNotes(null);
                                }}
                              >
                                OK
                              </Button>
                            </div>
                          ) : (
                            <span
                              className="text-sm text-muted-foreground cursor-pointer hover:underline"
                              onClick={() => {
                                setEditingNotes(participant.id);
                                setNotesValue(participant.notes || "");
                              }}
                            >
                              {participant.notes || "—"}
                            </span>
                          )}
                        </TableCell>
                        {onRemoveStudent && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => onRemoveStudent(participant.student_id)}
                              title="Remover"
                            >
                              <UserMinus className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
