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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";
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
  Trophy,
  Medal,
  Award,
  BarChart3,
  Download,
  Printer,
  FileText,
  Filter,
  Image as ImageIcon,
  School,
  Star,
  Bell,
  BadgeCheck,
  TrendingUp,
  Eye,
  QrCode,
  Link2,
  Copy,
} from "lucide-react";

// ── Custom Modal ────────────────────────────────────────────────────────────

function Modal({
  open,
  onClose,
  children,
  maxWidth = "max-w-2xl",
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className={`relative z-10 w-full ${maxWidth} mx-4 bg-background rounded-lg border shadow-lg animate-in fade-in-0 zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// ── Native select styling ───────────────────────────────────────────────────

const nativeSelectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

// ── Types ──────────────────────────────────────────────────────────────────

interface EventData {
  id: string;
  title: string;
  description: string | null;
  date: string;
  location: string | null;
  status: string;
  photo_url: string | null;
  school_id: string | null;
  category: string;
  public_certificates: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  creator?: { id: string; full_name: string };
  school?: { id: string; name: string; school_photo?: string } | null;
  participant_count?: number;
}

interface EventParticipant {
  id: string;
  event_id: string;
  student_id: string;
  attended: boolean;
  notes: string | null;
  added_by: string | null;
  added_at: string;
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
  photo: string | null;
  school: { id: string; name: string } | null;
}

interface EventFormData {
  title: string;
  description: string;
  date: string;
  location: string;
  status: string;
  category: string;
  school_id: string;
  photo_url: string;
  public_certificates: boolean;
}

interface DashboardData {
  overall_ranking: Array<{
    student_id: string;
    full_name: string;
    photo: string | null;
    school_name: string;
    total_events: number;
  }>;
  school_ranking: Array<{
    school_id: string;
    school_name: string;
    total_participations: number;
  }>;
  category_ranking: Array<{
    category: string;
    total_events: number;
    total_participations: number;
  }>;
  period_stats: {
    total_events: number;
    total_participations: number;
    evolution: Array<{
      period: string;
      events: number;
      participations: number;
    }>;
  };
  most_popular_events: Array<{
    id: string;
    title: string;
    category: string;
    participant_count: number;
  }>;
  never_participated: number;
  badge_alerts: Array<{
    student_id: string;
    full_name: string;
    total_events: number;
    badge_type: string;
    new: boolean;
  }>;
  total_absences: number;
  total_absent_students: number;
  absent_ranking: Array<{
    student_id: string;
    full_name: string;
    photo: string | null;
    school_name: string | null;
    total_absences: number;
  }>;
}

interface BadgeData {
  id: string;
  student_id: string;
  badge_type: string;
  earned_at: string;
  student: {
    id: string;
    full_name: string;
    photo: string | null;
    school: { id: string; name: string } | null;
  };
}

interface SchoolOption {
  id: string;
  name: string;
}

const emptyForm: EventFormData = {
  title: "",
  description: "",
  date: "",
  location: "",
  status: "upcoming",
  category: "other",
  school_id: "",
  photo_url: "",
  public_certificates: false,
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

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const statusBadgeClass: Record<string, string> = {
  upcoming:
    "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  ongoing:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  completed:
    "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700",
  cancelled:
    "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300 border-red-200 dark:border-red-800",
};

const statusLabels: Record<string, string> = {
  upcoming: "Próximo",
  ongoing: "Em Andamento",
  completed: "Concluído",
  cancelled: "Cancelado",
};

const categoryLabels: Record<string, string> = {
  sports: "Esportivo",
  cultural: "Cultural",
  party: "Festa",
  academic: "Acadêmico",
  other: "Outro",
};

const categoryBadgeClass: Record<string, string> = {
  sports: "bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300 border-orange-200 dark:border-orange-800",
  cultural: "bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300 border-purple-200 dark:border-purple-800",
  party: "bg-pink-100 text-pink-800 dark:bg-pink-950/50 dark:text-pink-300 border-pink-200 dark:border-pink-800",
  academic: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  other: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700",
};

const badgeTypeLabels: Record<string, string> = {
  "5_events": "Participante Bronze",
  "10_events": "Participante Prata",
  "20_events": "Participante Ouro",
  monthly_winner: "Destaque do Mês",
};

const badgeTypeColors: Record<string, string> = {
  "5_events": "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border-amber-300 dark:border-amber-800",
  "10_events": "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700",
  "20_events": "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-300 border-yellow-400 dark:border-yellow-800",
  monthly_winner: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800",
};

const badgeTypeIcons: Record<string, React.ReactNode> = {
  "5_events": <Medal className="h-5 w-5 text-amber-600 dark:text-amber-400" />,
  "10_events": <Medal className="h-5 w-5 text-slate-500 dark:text-slate-400" />,
  "20_events": <Trophy className="h-5 w-5 text-yellow-500 dark:text-yellow-400" />,
  monthly_winner: <Award className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />,
};

const CATEGORY_COLORS: Record<string, string> = {
  sports: "#f97316",
  cultural: "#a855f7",
  party: "#ec4899",
  academic: "#3b82f6",
  other: "#6b7280",
};

const CHART_COLORS = [
  "#16a34a",
  "#f97316",
  "#a855f7",
  "#ec4899",
  "#3b82f6",
  "#eab308",
  "#06b6d4",
  "#ef4444",
];

// ── Main Component ─────────────────────────────────────────────────────────

export function EventsPage() {
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = currentUser?.role === "Admin";

  // View state
  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("eventos");

  // List state
  const [events, setEvents] = useState<EventData[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Schools for filters
  const [schools, setSchools] = useState<SchoolOption[]>([]);

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
  const [availableStudents, setAvailableStudents] = useState<StudentOption[]>(
    []
  );
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [addStudentsLoading, setAddStudentsLoading] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentSchoolFilter, setStudentSchoolFilter] = useState("all");

  // Dashboard state (Tab 2)
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(
    null
  );
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardPeriod, setDashboardPeriod] = useState("month");

  // Badges state (Tab 3)
  const [badges, setBadges] = useState<BadgeData[]>([]);
  const [badgesLoading, setBadgesLoading] = useState(false);

  // Reports state (Tab 4)
  const [reportEventId, setReportEventId] = useState("");
  const [reportStudentId, setReportStudentId] = useState("");
  const [reportSchoolId, setReportSchoolId] = useState("");
  const [reportStudentSearch, setReportStudentSearch] = useState("");
  const [reportStudents, setReportStudents] = useState<StudentOption[]>([]);
  const [exportLoading, setExportLoading] = useState(false);

  // Certificate state
  const [certStudentSearch, setCertStudentSearch] = useState("");
  const [certStudents, setCertStudents] = useState<StudentOption[]>([]);
  const [certSelectedStudent, setCertSelectedStudent] = useState("");
  const [certSelectedEvent, setCertSelectedEvent] = useState("");
  const [certStudentEvents, setCertStudentEvents] = useState<EventData[]>([]);
  const [certLoading, setCertLoading] = useState(false);

  // Student search tab state (Tab 5 — "Buscar Alunos")
  const [studentTabSearch, setStudentTabSearch] = useState("");
  const [studentTabResults, setStudentTabResults] = useState<StudentOption[]>([]);
  const [studentTabLoading, setStudentTabLoading] = useState(false);
  const [studentTabSearched, setStudentTabSearched] = useState(false);
  const [studentTabSelectedId, setStudentTabSelectedId] = useState<string | null>(null);
  const [studentTabEvents, setStudentTabEvents] = useState<EventData[]>([]);
  const [studentTabEventsLoading, setStudentTabEventsLoading] = useState(false);

  // Group-by-school toggle for the event detail participants list
  const [groupBySchool, setGroupBySchool] = useState(false);

  const debouncedSearch = useDebounce(searchQuery, 300);
  const debouncedStudentSearch = useDebounce(studentSearch, 300);
  const debouncedReportStudentSearch = useDebounce(reportStudentSearch, 300);
  const debouncedCertStudentSearch = useDebounce(certStudentSearch, 300);
  const debouncedStudentTabSearch = useDebounce(studentTabSearch, 300);

  // ── Data Fetching ──────────────────────────────────────────────────────

  const fetchEvents = useCallback(async () => {
    try {
      setEventsLoading(true);
      const params = new URLSearchParams();
      params.set("limit", "100");
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter && statusFilter !== "all")
        params.set("status", statusFilter);
      if (schoolFilter && schoolFilter !== "all")
        params.set("school_id", schoolFilter);
      if (categoryFilter && categoryFilter !== "all")
        params.set("category", categoryFilter);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const data = await api.get<{
        events: EventData[];
        pagination: { total: number };
      }>(`/events?${params.toString()}`);
      setEvents(data.events);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        toast.error("Erro ao carregar eventos");
      }
    } finally {
      setEventsLoading(false);
    }
  }, [debouncedSearch, statusFilter, schoolFilter, categoryFilter, dateFrom, dateTo]);

  const fetchSchools = useCallback(async () => {
    try {
      const data = await api.get<{ schools: SchoolOption[] }>(
        "/schools?limit=100"
      );
      setSchools(data.schools);
    } catch {
      // silent
    }
  }, []);

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

  const fetchDashboard = useCallback(async () => {
    try {
      setDashboardLoading(true);
      const params = new URLSearchParams();
      params.set("period", dashboardPeriod);
      if (schoolFilter && schoolFilter !== "all")
        params.set("school_id", schoolFilter);
      if (categoryFilter && categoryFilter !== "all")
        params.set("category", categoryFilter);
      const data = await api.get<DashboardData>(
        `/events/dashboard?${params.toString()}`
      );
      setDashboardData(data);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        toast.error("Erro ao carregar dashboard");
      }
    } finally {
      setDashboardLoading(false);
    }
  }, [dashboardPeriod, schoolFilter, categoryFilter]);

  const fetchBadges = useCallback(async () => {
    try {
      setBadgesLoading(true);
      const data = await api.get<{ badges: BadgeData[] }>("/events/badges");
      setBadges(data.badges);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        toast.error("Erro ao carregar badges");
      }
    } finally {
      setBadgesLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchSchools();
  }, [fetchSchools]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    if (view === "detail" && selectedEventId) {
      fetchEventDetail(selectedEventId);
    }
  }, [view, selectedEventId, fetchEventDetail]);

  // Fetch dashboard when tab changes to participacao
  useEffect(() => {
    if (activeTab === "participacao" && !dashboardData) {
      fetchDashboard();
    }
  }, [activeTab, dashboardData, fetchDashboard]);

  // Fetch badges when tab changes to destaques
  useEffect(() => {
    if (activeTab === "destaques" && badges.length === 0) {
      fetchBadges();
    }
  }, [activeTab, badges.length, fetchBadges]);

  // Report student search
  useEffect(() => {
    if (debouncedReportStudentSearch.length >= 2) {
      api
        .get<{ students: StudentOption[] }>(
          `/students?limit=20&search=${encodeURIComponent(debouncedReportStudentSearch)}`
        )
        .then((d) => setReportStudents(d.students))
        .catch(() => {});
    } else {
      setReportStudents([]);
    }
  }, [debouncedReportStudentSearch]);

  // Certificate student search
  useEffect(() => {
    if (debouncedCertStudentSearch.length >= 2) {
      api
        .get<{ students: StudentOption[] }>(
          `/students?limit=20&search=${encodeURIComponent(debouncedCertStudentSearch)}`
        )
        .then((d) => setCertStudents(d.students))
        .catch(() => {});
    } else {
      setCertStudents([]);
    }
  }, [debouncedCertStudentSearch]);

  // When cert student selected, fetch their events
  useEffect(() => {
    if (certSelectedStudent) {
      api
        .get<{ events: EventData[] }>(
          `/events?limit=100&student_id=${certSelectedStudent}`
        )
        .then((d) => setCertStudentEvents(d.events))
        .catch(() => setCertStudentEvents([]));
    } else {
      setCertStudentEvents([]);
    }
  }, [certSelectedStudent]);

  // ── Student search tab (Buscar Alunos) ──
  // Debounced search: fetch students matching the typed name
  useEffect(() => {
    if (debouncedStudentTabSearch.length >= 2) {
      setStudentTabLoading(true);
      setStudentTabSearched(true);
      api
        .get<{ students: StudentOption[] }>(
          `/students?limit=50&search=${encodeURIComponent(debouncedStudentTabSearch)}`
        )
        .then((d) => setStudentTabResults(d.students))
        .catch(() => {
          toast.error("Erro ao buscar alunos");
          setStudentTabResults([]);
        })
        .finally(() => setStudentTabLoading(false));
    } else {
      setStudentTabResults([]);
      setStudentTabSearched(false);
    }
  }, [debouncedStudentTabSearch]);

  // When a student is selected in the search tab, fetch the events they participated in
  useEffect(() => {
    if (studentTabSelectedId) {
      setStudentTabEventsLoading(true);
      api
        .get<{ events: EventData[] }>(
          `/events?limit=100&student_id=${studentTabSelectedId}`
        )
        .then((d) => setStudentTabEvents(d.events))
        .catch(() => setStudentTabEvents([]))
        .finally(() => setStudentTabEventsLoading(false));
    } else {
      setStudentTabEvents([]);
    }
  }, [studentTabSelectedId]);

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
      category: event.category || "other",
      school_id: event.school_id || "",
      photo_url: event.photo_url || "",
      public_certificates: event.public_certificates ?? false,
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
        category: formData.category || "other",
        school_id: formData.school_id || null,
        photo_url: formData.photo_url.trim() || null,
        public_certificates: formData.public_certificates,
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
    setStudentSchoolFilter("all");
    try {
      const data = await api.get<{ students: StudentOption[] }>(
        "/students?limit=500"
      );
      const existingIds = new Set(
        eventDetail.participants.map((p) => p.student_id)
      );
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
      toast.success(
        `${selectedStudentIds.length} aluno(s) adicionado(s) ao evento`
      );
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

  const handleToggleAttended = async (
    studentId: string,
    attended: boolean
  ) => {
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

  const filteredAvailableStudents = availableStudents
    .filter((s) =>
      s.full_name
        .toLowerCase()
        .includes(debouncedStudentSearch.toLowerCase())
    )
    .filter(
      (s) =>
        studentSchoolFilter === "all" ||
        s.school?.id === studentSchoolFilter
    );

  const toggleSelectAll = () => {
    const allFilteredIds = filteredAvailableStudents.map((s) => s.id);
    const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedStudentIds.includes(id));
    if (allSelected) {
      // Deselect only the filtered ones
      setSelectedStudentIds((prev) => prev.filter((id) => !allFilteredIds.includes(id)));
    } else {
      // Select all filtered ones (merge with already selected)
      setSelectedStudentIds((prev) => {
        const existing = new Set(prev);
        allFilteredIds.forEach((id) => existing.add(id));
        return Array.from(existing);
      });
    }
  };

  const allFilteredSelected = filteredAvailableStudents.length > 0 && filteredAvailableStudents.every((s) => selectedStudentIds.includes(s.id));
  const someFilteredSelected = filteredAvailableStudents.some((s) => selectedStudentIds.includes(s.id)) && !allFilteredSelected;

  // ── Certificate handler ─────────────────────────────────────────────

  const handleDownloadCertificate = async (
    eventId: string,
    studentId: string,
    studentName: string
  ) => {
    try {
      setCertLoading(true);
      await api.download(
        `/events/certificates?event_id=${eventId}&student_id=${studentId}`,
        `certificado-${studentName.replace(/\s+/g, "-").toLowerCase()}.pdf`
      );
      toast.success("Certificado gerado com sucesso!");
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message || "Erro ao gerar certificado");
      } else {
        toast.error("Erro ao gerar certificado");
      }
    } finally {
      setCertLoading(false);
    }
  };

  // ── Export handlers ─────────────────────────────────────────────────

  const handleExport = async (
    type: string,
    format: string,
    extraParams: Record<string, string> = {}
  ) => {
    try {
      setExportLoading(true);
      const params = new URLSearchParams({
        type,
        format,
        ...extraParams,
      });
      const filename = `${type}-${new Date().toISOString().slice(0, 10)}.${format === "pdf" ? "pdf" : "xlsx"}`;
      await api.download(`/events/export?${params.toString()}`, filename);
      toast.success("Relatório exportado com sucesso!");
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message || "Erro ao exportar relatório");
      } else {
        toast.error("Erro ao exportar relatório");
      }
    } finally {
      setExportLoading(false);
    }
  };

  const handleAwardBadges = async () => {
    try {
      const data = await api.post<{
        message: string;
        awarded: BadgeData[];
        total_checked: number;
      }>("/events/badges");
      toast.success(data.message || "Badges verificados com sucesso!");
      fetchBadges();
      if (dashboardData) fetchDashboard();
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error("Erro ao verificar badges");
      }
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {view === "detail" && selectedEventId ? (
        <EventDetailView
          event={eventDetail}
          loading={detailLoading}
          onBack={handleBackToList}
          onEdit={isAdmin ? handleOpenEdit : undefined}
          onDelete={
            isAdmin
              ? (ev) => {
                  setDeletingEvent(ev as EventData);
                  setDeleteDialogOpen(true);
                }
              : undefined
          }
          onAddStudents={isAdmin ? handleOpenAddStudents : undefined}
          onRemoveStudent={isAdmin ? handleRemoveStudent : undefined}
          onToggleAttended={isAdmin ? handleToggleAttended : undefined}
          onUpdateNotes={isAdmin ? handleUpdateNotes : undefined}
          onDownloadCertificate={handleDownloadCertificate}
          certLoading={certLoading}
          schools={schools}
        />
      ) : (
        <>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Eventos</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie eventos, acompanhe participações e reconheça destaques
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Copy the public certificate link so students can search their
              name and download their certificates without logging in. */}
          <Button
            variant="outline"
            onClick={() => {
              const url = `${window.location.origin}/?certificados`;
              navigator.clipboard
                .writeText(url)
                .then(() => {
                  toast.success("Link de certificados copiado! Compartilhe com os alunos.");
                })
                .catch(() => {
                  toast.error("Erro ao copiar link");
                });
            }}
            className="shrink-0"
          >
            <Link2 className="mr-2 h-4 w-4" />
            Link de Certificados
          </Button>
          {isAdmin && (
            <Button onClick={handleOpenCreate} className="shrink-0">
              <Plus className="mr-2 h-4 w-4" />
              Novo Evento
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-6"
      >
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="eventos" className="gap-1.5">
            <CalendarDays className="h-4 w-4 hidden sm:inline" />
            Eventos
          </TabsTrigger>
          <TabsTrigger value="participacao" className="gap-1.5">
            <BarChart3 className="h-4 w-4 hidden sm:inline" />
            Participação
          </TabsTrigger>
          <TabsTrigger value="destaques" className="gap-1.5">
            <Star className="h-4 w-4 hidden sm:inline" />
            Destaques
          </TabsTrigger>
          <TabsTrigger value="relatorios" className="gap-1.5">
            <FileText className="h-4 w-4 hidden sm:inline" />
            Relatórios
          </TabsTrigger>
          <TabsTrigger value="buscar-alunos" className="gap-1.5">
            <Search className="h-4 w-4 hidden sm:inline" />
            Buscar Alunos
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Eventos ──────────────────────────────────────────── */}
        <TabsContent value="eventos" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className="relative sm:col-span-2 lg:col-span-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar evento..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <select
                  value={schoolFilter}
                  onChange={(e) => setSchoolFilter(e.target.value)}
                  className={nativeSelectClass}
                >
                  <option value="all">Todas as Escolas</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className={nativeSelectClass}
                >
                  <option value="all">Todas as Categorias</option>
                  <option value="sports">Esportivo</option>
                  <option value="cultural">Cultural</option>
                  <option value="party">Festa</option>
                  <option value="academic">Acadêmico</option>
                  <option value="other">Outro</option>
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className={nativeSelectClass}
                >
                  <option value="all">Todos os Status</option>
                  <option value="upcoming">Próximo</option>
                  <option value="ongoing">Em Andamento</option>
                  <option value="completed">Concluído</option>
                  <option value="cancelled">Cancelado</option>
                </select>
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="flex-1"
                    placeholder="De"
                  />
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="flex-1"
                    placeholder="Ate"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

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
                  {searchQuery ||
                  statusFilter !== "all" ||
                  schoolFilter !== "all" ||
                  categoryFilter !== "all"
                    ? "Nenhum evento encontrado com esses filtros"
                    : "Nenhum evento cadastrado"}
                </p>
                {isAdmin &&
                  !searchQuery &&
                  statusFilter === "all" &&
                  schoolFilter === "all" &&
                  categoryFilter === "all" && (
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
                    {event.photo_url && (
                      <div className="w-full h-32 rounded-t-lg overflow-hidden">
                        <img
                          src={event.photo_url}
                          alt={event.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base line-clamp-1">
                          {event.title}
                        </CardTitle>
                        <Badge
                          variant="outline"
                          className={
                            statusBadgeClass[event.status] || ""
                          }
                        >
                          {statusLabels[event.status] || event.status}
                        </Badge>
                      </div>
                      {event.category && (
                        <Badge
                          variant="outline"
                          className={
                            categoryBadgeClass[event.category] || ""
                          }
                        >
                          {categoryLabels[event.category] || event.category}
                        </Badge>
                      )}
                      {event.public_certificates && (
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
                          <Award className="h-3 w-3 mr-1" />
                          Certificado público
                        </Badge>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                        <span>{formatDateTime(event.date)}</span>
                      </div>
                      {event.location && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="line-clamp-1">
                            {event.location}
                          </span>
                        </div>
                      )}
                      {event.school && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <School className="h-3.5 w-3.5 shrink-0" />
                          <span className="line-clamp-1">
                            {event.school.name}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Users className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          {event.participant_count ?? 0} participante(s)
                        </span>
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
                          <TableHead className="w-12"></TableHead>
                          <TableHead>Título</TableHead>
                          <TableHead>Categoria</TableHead>
                          <TableHead>Data</TableHead>
                          <TableHead>Local</TableHead>
                          <TableHead>Escola</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-center">
                            Participantes
                          </TableHead>
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
                            <TableCell>
                              {event.photo_url ? (
                                <div className="h-10 w-10 rounded overflow-hidden">
                                  <img
                                    src={event.photo_url}
                                    alt={event.title}
                                    className="h-full w-full object-cover"
                                  />
                                </div>
                              ) : (
                                <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="font-medium">
                              {event.title}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={
                                  categoryBadgeClass[event.category] || ""
                                }
                              >
                                {categoryLabels[event.category] ||
                                  event.category}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatDateTime(event.date)}
                            </TableCell>
                            <TableCell className="text-muted-foreground max-w-[150px] truncate">
                              {event.location || "—"}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {event.school?.name || "—"}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={
                                  statusBadgeClass[event.status] || ""
                                }
                              >
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
        </TabsContent>

        {/* ── Tab 2: Participacao ──────────────────────────────────────── */}
        <TabsContent value="participacao" className="space-y-4">
          {/* Period filter */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Período:</span>
            </div>
            <select
              value={dashboardPeriod}
              onChange={(e) => {
                setDashboardPeriod(e.target.value);
                setDashboardData(null);
              }}
              className={nativeSelectClass + " w-[180px]"}
            >
              <option value="week">Esta Semana</option>
              <option value="month">Este Mês</option>
              <option value="year">Este Ano</option>
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDashboardData(null);
                fetchDashboard();
              }}
              disabled={dashboardLoading}
            >
              {dashboardLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <TrendingUp className="mr-2 h-4 w-4" />
              )}
              Atualizar
            </Button>
          </div>

          {dashboardLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <Skeleton className="h-4 w-24 mb-2" />
                    <Skeleton className="h-8 w-16" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : dashboardData ? (
            <>
              {/* Stats Cards */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-emerald-100 p-2">
                        <CalendarDays className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Total de Eventos
                        </p>
                        <p className="text-2xl font-bold">
                          {dashboardData.period_stats.total_events}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-emerald-100 p-2">
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Total de Presenças
                        </p>
                        <p className="text-2xl font-bold">
                          {dashboardData.period_stats.total_participations}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-purple-100 p-2">
                        <Users className="h-5 w-5 text-purple-600" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Alunos Presentes
                        </p>
                        <p className="text-2xl font-bold">
                          {dashboardData.overall_ranking.length}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-red-100 p-2">
                        <XCircle className="h-5 w-5 text-red-600" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Faltas Registradas
                        </p>
                        <p className="text-2xl font-bold">
                          {dashboardData.total_absences}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Charts row */}
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Monthly Evolution */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      Evolução Mensal
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {dashboardData.period_stats.evolution.length > 0 ? (
                      <ResponsiveContainer width="100%" height={280}>
                        <LineChart
                          data={dashboardData.period_stats.evolution}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="period" fontSize={12} />
                          <YAxis fontSize={12} />
                          <Tooltip />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="events"
                            stroke="#16a34a"
                            name="Eventos"
                            strokeWidth={2}
                          />
                          <Line
                            type="monotone"
                            dataKey="participations"
                            stroke="#3b82f6"
                            name="Presenças"
                            strokeWidth={2}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-[280px] text-muted-foreground">
                        <BarChart3 className="h-8 w-8 mb-2" />
                        <p className="text-sm">Sem dados no período</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* School Ranking Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <School className="h-5 w-5" />
                      Ranking por Escola (Presenças)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {dashboardData.school_ranking.length > 0 ? (
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart
                          data={dashboardData.school_ranking.slice(0, 8)}
                          layout="vertical"
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" fontSize={12} />
                          <YAxis
                            type="category"
                            dataKey="school_name"
                            fontSize={11}
                            width={100}
                          />
                          <Tooltip />
                          <Bar
                            dataKey="total_participations"
                            name="Presenças"
                            radius={[0, 4, 4, 0]}
                          >
                            {dashboardData.school_ranking
                              .slice(0, 8)
                              .map((_, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={
                                    CHART_COLORS[index % CHART_COLORS.length]
                                  }
                                />
                              ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-[280px] text-muted-foreground">
                        <School className="h-8 w-8 mb-2" />
                        <p className="text-sm">Sem dados</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Overall Ranking + Category */}
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Overall Ranking */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Trophy className="h-5 w-5" />
                      Ranking de Alunos - Presenças (Top 10)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {dashboardData.overall_ranking.length > 0 ? (
                      <div className="max-h-96 overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-12">#</TableHead>
                              <TableHead>Aluno</TableHead>
                              <TableHead>Escola</TableHead>
                              <TableHead className="text-center">
                                Eventos
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {dashboardData.overall_ranking
                              .slice(0, 10)
                              .map((student, index) => (
                                <TableRow key={student.student_id}>
                                  <TableCell className="font-medium">
                                    {index === 0
                                      ? "🥇"
                                      : index === 1
                                        ? "🥈"
                                        : index === 2
                                          ? "🥉"
                                          : index + 1}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      <Avatar className="h-7 w-7">
                                        <AvatarImage
                                          src={student.photo || undefined}
                                        />
                                        <AvatarFallback className="text-xs">
                                          {getInitials(student.full_name)}
                                        </AvatarFallback>
                                      </Avatar>
                                      <span className="text-sm font-medium">
                                        {student.full_name}
                                      </span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground">
                                    {student.school_name || "—"}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <Badge variant="secondary">
                                      {student.total_events}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                        <Trophy className="h-8 w-8 mb-2" />
                        <p className="text-sm">Sem dados de ranking</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Category Ranking */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Medal className="h-5 w-5" />
                      Ranking por Categoria (Presenças)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {dashboardData.category_ranking.length > 0 ? (
                      <div className="space-y-4">
                        {dashboardData.category_ranking.map((cat) => (
                          <div key={cat.category} className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant="outline"
                                  className={
                                    categoryBadgeClass[cat.category] || ""
                                  }
                                >
                                  {categoryLabels[cat.category] ||
                                    cat.category}
                                </Badge>
                                <span className="text-sm text-muted-foreground">
                                  {cat.total_events} evento(s)
                                </span>
                              </div>
                              <span className="text-sm font-medium">
                                {cat.total_participations} presença(s)
                              </span>
                            </div>
                            <Progress
                              value={
                                (cat.total_participations /
                                  Math.max(
                                    ...dashboardData.category_ranking.map(
                                      (c) => c.total_participations
                                    ),
                                    1
                                  )) *
                                100
                              }
                              className="h-2"
                            />
                          </div>
                        ))}
                        <div className="mt-6">
                          <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                              <Pie
                                data={dashboardData.category_ranking.map(
                                  (c) => ({
                                    name:
                                      categoryLabels[c.category] ||
                                      c.category,
                                    value: c.total_participations,
                                  })
                                )}
                                dataKey="value"
                                cx="50%"
                                cy="50%"
                                outerRadius={70}
                                label={({ name, percent }: { name: string; percent: number }) =>
                                  `${name} ${(percent * 100).toFixed(0)}%`
                                }
                                labelLine={false}
                                fontSize={10}
                              >
                                {dashboardData.category_ranking.map(
                                  (cat, index) => (
                                    <Cell
                                      key={`cell-${index}`}
                                      fill={
                                        CATEGORY_COLORS[cat.category] ||
                                        CHART_COLORS[
                                          index % CHART_COLORS.length
                                        ]
                                      }
                                    />
                                  )
                                )}
                              </Pie>
                              <Tooltip />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                        <Medal className="h-8 w-8 mb-2" />
                        <p className="text-sm">Sem dados de categoria</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Most Popular Events */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Star className="h-5 w-5" />
                    Eventos Mais Populares
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {dashboardData.most_popular_events.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                      {dashboardData.most_popular_events.map((event, index) => (
                        <div
                          key={event.id}
                          className="flex items-center gap-3 rounded-lg border p-3"
                        >
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${
                              index === 0
                                ? "bg-yellow-500"
                                : index === 1
                                  ? "bg-gray-400"
                                  : index === 2
                                    ? "bg-amber-700"
                                    : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {index + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">
                              {event.title}
                            </p>
                            <div className="flex items-center gap-1.5">
                              <Badge
                                variant="outline"
                                className={`text-xs ${categoryBadgeClass[event.category] || ""}`}
                              >
                                {categoryLabels[event.category] ||
                                  event.category}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {event.participant_count} partic.
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <Star className="h-8 w-8 mb-2" />
                      <p className="text-sm">Sem eventos populares</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ── Alunos que Faltaram (Absent Students) ── */}
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <XCircle className="h-5 w-5 text-red-500" />
                      Alunos que Faltaram
                    </CardTitle>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className="bg-red-50 text-red-700 border-red-200"
                      >
                        {dashboardData.total_absent_students} aluno(s) com falta
                      </Badge>
                      <Badge
                        variant="outline"
                        className="bg-amber-50 text-amber-700 border-amber-200"
                      >
                        {dashboardData.never_participated} nunca participaram
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {dashboardData.absent_ranking.length > 0 ? (
                    <div className="max-h-96 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">#</TableHead>
                            <TableHead>Aluno</TableHead>
                            <TableHead>Escola</TableHead>
                            <TableHead className="text-center">
                              Faltas
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dashboardData.absent_ranking.map((student, index) => (
                            <TableRow key={student.student_id}>
                              <TableCell className="font-medium text-muted-foreground">
                                {index + 1}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Avatar className="h-7 w-7">
                                    <AvatarImage
                                      src={student.photo || undefined}
                                    />
                                    <AvatarFallback className="text-xs">
                                      {getInitials(student.full_name)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="text-sm font-medium">
                                    {student.full_name}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {student.school_name || "—"}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge
                                  variant="secondary"
                                  className="bg-red-100 text-red-800"
                                >
                                  {student.total_absences}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <CheckCircle2 className="h-8 w-8 mb-2 text-emerald-500" />
                      <p className="text-sm">
                        Nenhuma falta registrada. Todos presentes!
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <BarChart3 className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground text-sm">
                  Clique em &quot;Atualizar&quot; para carregar os dados
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Tab 3: Destaques ─────────────────────────────────────────── */}
        <TabsContent value="destaques" className="space-y-4">
          {badgesLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <Skeleton className="h-6 w-40 mb-4" />
                    <Skeleton className="h-16 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <>
              {/* Badge Alerts */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Bell className="h-5 w-5" />
                      Alertas de Badges
                    </CardTitle>
                    {isAdmin && (
                      <Button
                        size="sm"
                        onClick={handleAwardBadges}
                        variant="outline"
                      >
                        <BadgeCheck className="mr-1 h-4 w-4" />
                        Verificar Badges
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {dashboardData?.badge_alerts &&
                  dashboardData.badge_alerts.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {dashboardData.badge_alerts.map((alert) => (
                        <div
                          key={`${alert.student_id}-${alert.badge_type}`}
                          className="relative rounded-lg border-2 border-dashed border-emerald-300 bg-gradient-to-br from-emerald-50 to-yellow-50 p-4 dark:from-emerald-950/30 dark:to-yellow-950/30"
                        >
                          {alert.new && (
                            <div className="absolute -top-2 -right-2 rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-bold text-white">
                              NOVO
                            </div>
                          )}
                          <div className="flex items-center gap-3">
                            {badgeTypeIcons[alert.badge_type] || (
                              <Award className="h-5 w-5 text-emerald-600" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold truncate">
                                {alert.full_name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {alert.total_events} eventos •{" "}
                                {badgeTypeLabels[alert.badge_type] ||
                                  alert.badge_type}
                              </p>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-3 w-full"
                            onClick={() => {
                              toast.info(
                                "Selecione um evento do aluno para gerar o certificado na seção abaixo"
                              );
                            }}
                          >
                            <Award className="mr-1 h-3 w-3" />
                            Ver Certificado
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <Bell className="h-8 w-8 mb-2" />
                      <p className="text-sm">Nenhum alerta de badge</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Student Badges */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Award className="h-5 w-5" />
                    Badges Conquistados
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {badges.length > 0 ? (
                    <div className="max-h-96 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Aluno</TableHead>
                            <TableHead>Escola</TableHead>
                            <TableHead>Badge</TableHead>
                            <TableHead>Data</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {badges.map((badge) => (
                            <TableRow key={badge.id}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Avatar className="h-7 w-7">
                                    <AvatarImage
                                      src={
                                        badge.student.photo || undefined
                                      }
                                    />
                                    <AvatarFallback className="text-xs">
                                      {getInitials(
                                        badge.student.full_name
                                      )}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="text-sm font-medium">
                                    {badge.student.full_name}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {badge.student.school?.name || "—"}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={
                                    badgeTypeColors[badge.badge_type] ||
                                    ""
                                  }
                                >
                                  <span className="mr-1">
                                    {badge.badge_type === "5_events"
                                      ? "🥉"
                                      : badge.badge_type ===
                                          "10_events"
                                        ? "🥈"
                                        : badge.badge_type ===
                                            "20_events"
                                          ? "🥇"
                                          : "⭐"}
                                  </span>
                                  {badgeTypeLabels[badge.badge_type] ||
                                    badge.badge_type}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {formatDate(badge.earned_at)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <Award className="h-8 w-8 mb-2" />
                      <p className="text-sm">
                        Nenhum badge conquistado ainda
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Certificate Generation */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <QrCode className="h-5 w-5" />
                    Gerar Certificado
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {/* Search student */}
                    <div className="space-y-2">
                      <Label>Buscar Aluno</Label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Nome do aluno..."
                          value={certStudentSearch}
                          onChange={(e) =>
                            setCertStudentSearch(e.target.value)
                          }
                          className="pl-9"
                        />
                      </div>
                      {certStudents.length > 0 && (
                        <div className="border rounded-lg max-h-40 overflow-y-auto">
                          {certStudents.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex items-center gap-2"
                              onClick={() => {
                                setCertSelectedStudent(s.id);
                                setCertStudentSearch(s.full_name);
                                setCertStudents([]);
                                setCertSelectedEvent("");
                              }}
                            >
                              <Avatar className="h-6 w-6">
                                <AvatarImage src={s.photo || undefined} />
                                <AvatarFallback className="text-xs">
                                  {getInitials(s.full_name)}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium">{s.full_name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {s.school?.name || "—"}
                                </p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Select event */}
                    <div className="space-y-2">
                      <Label>Selecionar Evento</Label>
                      <select
                        value={certSelectedEvent}
                        onChange={(e) =>
                          setCertSelectedEvent(e.target.value)
                        }
                        className={nativeSelectClass}
                        disabled={!certSelectedStudent}
                      >
                        <option value="">
                          {certSelectedStudent
                            ? "Selecione um evento"
                            : "Selecione um aluno primeiro"}
                        </option>
                        {certStudentEvents.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.title} — {formatDate(e.date)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <Button
                    onClick={() => {
                      if (certSelectedStudent && certSelectedEvent) {
                        const student = certStudents.find(
                          (s) => s.id === certSelectedStudent
                        );
                        handleDownloadCertificate(
                          certSelectedEvent,
                          certSelectedStudent,
                          student?.full_name || "aluno"
                        );
                      }
                    }}
                    disabled={
                      !certSelectedStudent ||
                      !certSelectedEvent ||
                      certLoading
                    }
                    className="w-full sm:w-auto"
                  >
                    {certLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    Gerar Certificado
                  </Button>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ── Tab 4: Relatorios ────────────────────────────────────────── */}
        <TabsContent value="relatorios" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* 1. Lista de Participantes por Evento */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Lista de Participantes por Evento
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Exporte a lista de participantes de um evento específico.
                </p>
                <select
                  value={reportEventId}
                  onChange={(e) => setReportEventId(e.target.value)}
                  className={nativeSelectClass}
                >
                  <option value="">Selecione um evento</option>
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title} — {formatDate(e.date)}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!reportEventId || exportLoading}
                    onClick={() =>
                      handleExport("participants", "pdf", {
                        event_id: reportEventId,
                      })
                    }
                  >
                    <Download className="mr-1 h-3 w-3" />
                    PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!reportEventId || exportLoading}
                    onClick={() =>
                      handleExport("participants", "excel", {
                        event_id: reportEventId,
                      })
                    }
                  >
                    <FileText className="mr-1 h-3 w-3" />
                    Excel
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* 2. Ranking de Participacao */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Trophy className="h-5 w-5" />
                  Ranking de Participação
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Exporte o ranking geral de participação dos alunos.
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={exportLoading}
                    onClick={() => handleExport("ranking", "pdf")}
                  >
                    <Download className="mr-1 h-3 w-3" />
                    PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={exportLoading}
                    onClick={() => handleExport("ranking", "excel")}
                  >
                    <FileText className="mr-1 h-3 w-3" />
                    Excel
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* 3. Relatorio por Aluno */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Relatório por Aluno
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Exporte o histórico de participações de um aluno.
                </p>
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar aluno..."
                      value={reportStudentSearch}
                      onChange={(e) =>
                        setReportStudentSearch(e.target.value)
                      }
                      className="pl-9"
                    />
                  </div>
                  {reportStudents.length > 0 && (
                    <div className="border rounded-lg max-h-32 overflow-y-auto">
                      {reportStudents.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
                          onClick={() => {
                            setReportStudentId(s.id);
                            setReportStudentSearch(s.full_name);
                            setReportStudents([]);
                          }}
                        >
                          {s.full_name} — {s.school?.name || "—"}
                        </button>
                      ))}
                    </div>
                  )}
                  {reportStudentId && (
                    <p className="text-xs text-muted-foreground">
                      Aluno selecionado:{" "}
                      <span className="font-medium">
                        {reportStudentSearch}
                      </span>
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!reportStudentId || exportLoading}
                    onClick={() =>
                      handleExport("student_report", "pdf", {
                        student_id: reportStudentId,
                      })
                    }
                  >
                    <Download className="mr-1 h-3 w-3" />
                    PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!reportStudentId || exportLoading}
                    onClick={() =>
                      handleExport("student_report", "excel", {
                        student_id: reportStudentId,
                      })
                    }
                  >
                    <FileText className="mr-1 h-3 w-3" />
                    Excel
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* 4. Relatorio por Escola */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <School className="h-5 w-5" />
                  Relatório por Escola
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Exporte o relatório de participações de uma escola.
                </p>
                <select
                  value={reportSchoolId}
                  onChange={(e) => setReportSchoolId(e.target.value)}
                  className={nativeSelectClass}
                >
                  <option value="">Selecione uma escola</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!reportSchoolId || exportLoading}
                    onClick={() =>
                      handleExport("school_report", "pdf", {
                        school_id: reportSchoolId,
                      })
                    }
                  >
                    <Download className="mr-1 h-3 w-3" />
                    PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!reportSchoolId || exportLoading}
                    onClick={() =>
                      handleExport("school_report", "excel", {
                        school_id: reportSchoolId,
                      })
                    }
                  >
                    <FileText className="mr-1 h-3 w-3" />
                    Excel
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* 5. Alunos que Nunca Participaram */}
            <Card className="sm:col-span-2">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <XCircle className="h-5 w-5" />
                  Alunos que Nunca Participaram
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Exporte a lista de alunos que nunca participaram de nenhum
                  evento.
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={exportLoading}
                    onClick={() =>
                      handleExport("ranking", "pdf", {
                        type_override: "never_participated",
                      })
                    }
                  >
                    <Download className="mr-1 h-3 w-3" />
                    PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={exportLoading}
                    onClick={() =>
                      handleExport("ranking", "excel", {
                        type_override: "never_participated",
                      })
                    }
                  >
                    <FileText className="mr-1 h-3 w-3" />
                    Excel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Print Options */}
          <Separator />
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Printer className="h-5 w-5" />
                Opções de Impressão
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.print()}
                >
                  <Printer className="mr-2 h-4 w-4" />
                  Imprimir Página
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={exportLoading}
                  onClick={() => handleExport("ranking", "pdf")}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Imprimir Ranking
                </Button>
              </div>
            </CardContent>
          </Card>

          {exportLoading && (
            <div className="flex items-center justify-center gap-2 py-4">
              <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
              <span className="text-sm text-muted-foreground">
                Gerando relatório...
              </span>
            </div>
          )}
        </TabsContent>

        {/* ── Tab 5: Buscar Alunos (search students across events) ────── */}
        <TabsContent value="buscar-alunos" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Search className="h-5 w-5" />
                Buscar Alunos em Eventos
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Pesquise um aluno pelo nome para ver todos os eventos em que
                ele participou.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Digite o nome do aluno (mínimo 2 caracteres)..."
                  value={studentTabSearch}
                  onChange={(e) => setStudentTabSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Search results — student list */}
              {studentTabLoading && (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
                </div>
              )}

              {!studentTabLoading && studentTabResults.length > 0 && (
                <div className="border rounded-lg max-h-72 overflow-y-auto">
                  {studentTabResults.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setStudentTabSelectedId(s.id)}
                      className={`w-full text-left px-3 py-2 hover:bg-muted border-b last:border-b-0 flex items-center gap-3 transition-colors ${
                        studentTabSelectedId === s.id ? "bg-muted" : ""
                      }`}
                    >
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarImage src={s.photo || undefined} />
                        <AvatarFallback className="text-xs">
                          {getInitials(s.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {s.full_name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {s.school?.name || "—"}
                          {s.grade ? ` • ${s.grade}` : ""}
                          {s.class ? ` / Turma ${s.class}` : ""}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {!studentTabLoading &&
                studentTabSearched &&
                studentTabResults.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <Users className="h-10 w-10 mb-3 opacity-40" />
                    <p className="text-sm">
                      Nenhum aluno encontrado com &ldquo;{studentTabSearch}&rdquo;
                    </p>
                  </div>
                )}

              {!studentTabLoading && !studentTabSearched && (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Users className="h-10 w-10 mb-3 opacity-40" />
                  <p className="text-sm">
                    Digite o nome de um aluno para ver seus eventos
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Selected student's events */}
          {studentTabSelectedId && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CalendarDays className="h-5 w-5" />
                    Eventos do Aluno
                  </CardTitle>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setStudentTabSelectedId(null);
                      setStudentTabEvents([]);
                    }}
                  >
                    Limpar seleção
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  {studentTabEvents.length} evento(s) encontrado(s)
                </p>
              </CardHeader>
              <CardContent>
                {studentTabEventsLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
                  </div>
                ) : studentTabEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <CalendarDays className="h-10 w-10 mb-3 opacity-40" />
                    <p className="text-sm">
                      Este aluno ainda não participou de nenhum evento
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {studentTabEvents.map((ev) => (
                      <div
                        key={ev.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg border hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {ev.title}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <span className="text-xs text-muted-foreground">
                              {formatDateTime(ev.date)}
                            </span>
                            {ev.school?.name && (
                              <>
                                <span className="text-xs text-muted-foreground">·</span>
                                <span className="text-xs text-muted-foreground truncate">
                                  {ev.school.name}
                                </span>
                              </>
                            )}
                            {ev.location && (
                              <>
                                <span className="text-xs text-muted-foreground">·</span>
                                <span className="text-xs text-muted-foreground truncate">
                                  {ev.location}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge
                            variant="outline"
                            className={
                              statusBadgeClass[ev.status] || ""
                            }
                          >
                            {ev.status === "upcoming"
                              ? "Próximo"
                              : ev.status === "ongoing"
                                ? "Em Andamento"
                                : ev.status === "completed"
                                  ? "Concluído"
                                  : "Cancelado"}
                          </Badge>
                          {ev.participant_count !== undefined && (
                            <Badge variant="secondary" className="text-xs">
                              {ev.participant_count} participante(s)
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
        </>
      )}

      {/* Create/Edit Modal */}
      <Modal
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="max-w-lg"
      >
        <div className="p-6">
          <h2 className="text-lg font-semibold">
            {editingEvent ? "Editar Evento" : "Novo Evento"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {editingEvent
              ? "Atualize as informações do evento abaixo."
              : "Preencha os dados para criar um novo evento."}
          </p>
        </div>
        <div className="space-y-4 px-6 pb-2">
          <div className="space-y-2">
            <Label htmlFor="event-title">
              Título <span className="text-destructive">*</span>
            </Label>
            <Input
              id="event-title"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              placeholder="Título do evento"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="event-description">Descrição</Label>
            <Textarea
              id="event-description"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="Descrição do evento"
              rows={3}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="event-date">
                Data e Hora <span className="text-destructive">*</span>
              </Label>
              <Input
                id="event-date"
                type="datetime-local"
                value={formData.date}
                onChange={(e) =>
                  setFormData({ ...formData, date: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-location">Local</Label>
              <Input
                id="event-location"
                value={formData.location}
                onChange={(e) =>
                  setFormData({ ...formData, location: e.target.value })
                }
                placeholder="Local do evento"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Categoria</Label>
              <select
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
                className={nativeSelectClass}
              >
                <option value="sports">Esportivo</option>
                <option value="cultural">Cultural</option>
                <option value="party">Festa</option>
                <option value="academic">Acadêmico</option>
                <option value="other">Outro</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <select
                value={formData.status}
                onChange={(e) =>
                  setFormData({ ...formData, status: e.target.value })
                }
                className={nativeSelectClass}
              >
                <option value="upcoming">Próximo</option>
                <option value="ongoing">Em Andamento</option>
                <option value="completed">Concluído</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Escola</Label>
            <select
              value={formData.school_id}
              onChange={(e) =>
                setFormData({ ...formData, school_id: e.target.value })
              }
              className={nativeSelectClass}
            >
              <option value="">Nenhuma escola</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="event-photo">URL da Foto</Label>
            <Input
              id="event-photo"
              value={formData.photo_url}
              onChange={(e) =>
                setFormData({ ...formData, photo_url: e.target.value })
              }
              placeholder="https://exemplo.com/foto.jpg"
            />
          </div>
          <div className="flex items-start gap-3 p-3 rounded-md border bg-muted/30">
            <Switch
              id="public-certificates"
              checked={formData.public_certificates}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, public_certificates: checked })
              }
            />
            <div className="space-y-0.5">
              <Label htmlFor="public-certificates" className="cursor-pointer">
                Publicar certificados no link público
              </Label>
              <p className="text-xs text-muted-foreground">
                Quando ativado, os certificados deste evento ficam disponíveis
                para consulta e download no link público de certificados. Disponível apenas para eventos concluídos.
              </p>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 p-6 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => setDialogOpen(false)}
            disabled={formSubmitting}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSubmitForm}
            disabled={formSubmitting}
          >
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
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <div className="p-6">
          <h2 className="text-lg font-semibold">Excluir Evento</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Tem certeza que deseja excluir o evento{" "}
            <strong>{deletingEvent?.title}</strong>? Todos os participantes
            serão removidos. Esta ação não pode ser desfeita.
          </p>
        </div>
        <div className="flex justify-end gap-2 px-6 pb-6">
          <Button
            type="button"
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
        </div>
      </Modal>

      {/* Add Students Modal */}
      <Modal
        open={addStudentsOpen}
        onClose={() => setAddStudentsOpen(false)}
        maxWidth="max-w-lg"
      >
        <div className="p-6">
          <h2 className="text-lg font-semibold">Adicionar Alunos</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Selecione os alunos que deseja adicionar ao evento.
          </p>
        </div>
        <div className="space-y-4 px-6 pb-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar aluno pelo nome..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <select
              value={studentSchoolFilter}
              onChange={(e) => setStudentSchoolFilter(e.target.value)}
              className={nativeSelectClass + " w-[180px]"}
            >
              <option value="all">Todas as Escolas</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <ScrollArea className="h-[300px] border rounded-lg">
            {filteredAvailableStudents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Users className="h-8 w-8 mb-2" />
                <p className="text-sm">Nenhum aluno disponível</p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {/* Select All Row */}
                <label
                  className="flex items-center gap-3 p-2 rounded-md hover:bg-muted cursor-pointer border-b mb-1 pb-2"
                >
                  <Checkbox
                    checked={allFilteredSelected ? true : someFilteredSelected ? "indeterminate" : false}
                    onCheckedChange={toggleSelectAll}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">
                      Selecionar todos
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {filteredAvailableStudents.length} aluno(s) na lista
                    </p>
                  </div>
                </label>
                {/* Students grouped by school */}
                {(() => {
                  // Group filtered students by school name. Students with no
                  // school are grouped under "Sem escola".
                  const groups = new Map<string, StudentOption[]>();
                  for (const s of filteredAvailableStudents) {
                    const key = s.school?.name || "Sem escola";
                    const arr = groups.get(key) || [];
                    arr.push(s);
                    groups.set(key, arr);
                  }
                  // Sort groups alphabetically, but keep "Sem escola" last
                  const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
                    if (a === "Sem escola") return 1;
                    if (b === "Sem escola") return -1;
                    return a.localeCompare(b, "pt-BR");
                  });
                  return sortedKeys.map((schoolName) => {
                    const groupStudents = groups.get(schoolName) || [];
                    const allGroupSelected =
                      groupStudents.length > 0 &&
                      groupStudents.every((s) => selectedStudentIds.includes(s.id));
                    const someGroupSelected =
                      groupStudents.some((s) => selectedStudentIds.includes(s.id)) &&
                      !allGroupSelected;
                    const toggleGroup = () => {
                      const groupIds = groupStudents.map((s) => s.id);
                      if (allGroupSelected) {
                        setSelectedStudentIds((prev) =>
                          prev.filter((id) => !groupIds.includes(id))
                        );
                      } else {
                        setSelectedStudentIds((prev) => {
                          const existing = new Set(prev);
                          groupIds.forEach((id) => existing.add(id));
                          return Array.from(existing);
                        });
                      }
                    };
                    return (
                      <div key={schoolName} className="mb-2">
                        {/* School group header */}
                        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/60 sticky top-0 z-10">
                          <Checkbox
                            checked={
                              allGroupSelected
                                ? true
                                : someGroupSelected
                                  ? "indeterminate"
                                  : false
                            }
                            onCheckedChange={toggleGroup}
                          />
                          <School className="h-3.5 w-3.5 text-muted-foreground" />
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {schoolName}
                          </p>
                          <Badge variant="outline" className="text-xs ml-auto">
                            {groupStudents.length}
                          </Badge>
                        </div>
                        {/* Students in this school */}
                        {groupStudents.map((student) => (
                          <label
                            key={student.id}
                            className="flex items-center gap-3 p-2 rounded-md hover:bg-muted cursor-pointer pl-4"
                          >
                            <Checkbox
                              checked={selectedStudentIds.includes(student.id)}
                              onCheckedChange={() =>
                                toggleStudentSelection(student.id)
                              }
                            />
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={student.photo || undefined} />
                              <AvatarFallback className="text-xs">
                                {getInitials(student.full_name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {student.full_name}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {student.grade || "—"}
                                {student.class
                                  ? ` / Turma ${student.class}`
                                  : ""}
                              </p>
                            </div>
                          </label>
                        ))}
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </ScrollArea>
          {selectedStudentIds.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {selectedStudentIds.length} aluno(s) selecionado(s)
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 p-6 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => setAddStudentsOpen(false)}
            disabled={addStudentsLoading}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleAddStudents}
            disabled={
              addStudentsLoading || selectedStudentIds.length === 0
            }
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
        </div>
      </Modal>
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
  onDownloadCertificate,
  certLoading,
  schools,
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
  onDownloadCertificate: (
    eventId: string,
    studentId: string,
    studentName: string
  ) => void;
  certLoading: boolean;
  schools: SchoolOption[];
}) {
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [notesValue, setNotesValue] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [participantFilter, setParticipantFilter] = useState<
    "all" | "present" | "absent"
  >("all");
  const [localGroupBySchool, setLocalGroupBySchool] = useState(false);

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
  const presentParticipants = participants.filter((p) => p.attended);
  const absentParticipants = participants.filter((p) => !p.attended);
  const filteredParticipants =
    participantFilter === "present"
      ? presentParticipants
      : participantFilter === "absent"
        ? absentParticipants
        : participants;

  // Group filtered participants by school (used when the "Por escola" toggle
  // is on). Students without a school go under "Sem escola".
  const groupedBySchool: Array<{ schoolName: string; participants: EventParticipant[] }> = (() => {
    const groups = new Map<string, EventParticipant[]>();
    for (const p of filteredParticipants) {
      const key = p.student.school?.name || "Sem escola";
      const arr = groups.get(key) || [];
      arr.push(p);
      groups.set(key, arr);
    }
    const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
      if (a === "Sem escola") return 1;
      if (b === "Sem escola") return -1;
      return a.localeCompare(b, "pt-BR");
    });
    return sortedKeys.map((k) => ({
      schoolName: k,
      participants: groups.get(k) || [],
    }));
  })();

  const handleSaveNotes = async (studentId: string) => {
    setNotesSaving(true);
    await onUpdateNotes?.(studentId, notesValue);
    setEditingNotes(null);
    setNotesSaving(false);
  };

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
            <h1 className="text-2xl font-bold tracking-tight">
              {event.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <Badge
                variant="outline"
                className={statusBadgeClass[event.status] || ""}
              >
                {statusLabels[event.status] || event.status}
              </Badge>
              {event.category && (
                <Badge
                  variant="outline"
                  className={categoryBadgeClass[event.category] || ""}
                >
                  {categoryLabels[event.category] || event.category}
                </Badge>
              )}
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

      {/* Event photo */}
      {event.photo_url && (
        <div className="w-full max-h-64 rounded-lg overflow-hidden">
          <img
            src={event.photo_url}
            alt={event.title}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Informações do Evento
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {event.description && (
            <div className="flex items-start gap-3">
              <span className="text-sm text-muted-foreground shrink-0">
                Descrição
              </span>
              <p className="text-sm whitespace-pre-wrap">
                {event.description}
              </p>
            </div>
          )}
          <div className="flex items-center gap-3">
            <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Data e Hora</p>
              <p className="text-sm font-medium">
                {formatDateTime(event.date)}
              </p>
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
          {event.school && (
            <div className="flex items-center gap-3">
              <School className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Escola</p>
                <p className="text-sm font-medium">{event.school.name}</p>
              </div>
            </div>
          )}
          {event.category && (
            <div className="flex items-center gap-3">
              <Medal className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Categoria</p>
                <Badge
                  variant="outline"
                  className={categoryBadgeClass[event.category] || ""}
                >
                  {categoryLabels[event.category] || event.category}
                </Badge>
              </div>
            </div>
          )}
          {event.creator && (
            <div className="flex items-center gap-3">
              <Users className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Criado por</p>
                <p className="text-sm font-medium">
                  {event.creator.full_name}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Participants */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
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
            {participants.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className="bg-emerald-50 text-emerald-700 border-emerald-200"
                >
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  {presentParticipants.length} presente(s)
                </Badge>
                <Badge
                  variant="outline"
                  className="bg-red-50 text-red-700 border-red-200"
                >
                  <XCircle className="mr-1 h-3 w-3" />
                  {absentParticipants.length} faltou/faltaram
                </Badge>
                <div className="ml-auto flex items-center gap-1 rounded-lg border p-0.5">
                  <Button
                    size="sm"
                    variant={participantFilter === "all" ? "secondary" : "ghost"}
                    className="h-7 px-2.5 text-xs"
                    onClick={() => setParticipantFilter("all")}
                  >
                    Todos
                  </Button>
                  <Button
                    size="sm"
                    variant={
                      participantFilter === "present" ? "secondary" : "ghost"
                    }
                    className="h-7 px-2.5 text-xs"
                    onClick={() => setParticipantFilter("present")}
                  >
                    Presentes
                  </Button>
                  <Button
                    size="sm"
                    variant={
                      participantFilter === "absent" ? "secondary" : "ghost"
                    }
                    className="h-7 px-2.5 text-xs"
                    onClick={() => setParticipantFilter("absent")}
                  >
                    Faltaram
                  </Button>
                </div>
                <Button
                  size="sm"
                  variant={localGroupBySchool ? "secondary" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => setLocalGroupBySchool((v) => !v)}
                  title="Agrupar participantes por escola"
                >
                  <School className="mr-1 h-3 w-3" />
                  Por escola
                </Button>
              </div>
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
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={onAddStudents}
                >
                  <UserPlus className="mr-1 h-4 w-4" />
                  Adicionar Alunos
                </Button>
              )}
            </div>
          ) : filteredParticipants.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              {participantFilter === "present" ? (
                <>
                  <CheckCircle2 className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm">
                    Nenhum aluno marcado como presente neste evento
                  </p>
                </>
              ) : (
                <>
                  <XCircle className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm">
                    Nenhuma falta registrada neste evento. Todos presentes!
                  </p>
                </>
              )}
            </div>
          ) : localGroupBySchool ? (
            /* ── Grouped by school view ──
               When the "Por escola" toggle is on, render participants
               grouped under school headers. Each group shows a simple
               responsive list of participant rows. */
            <div className="space-y-4">
              {groupedBySchool.map((group) => (
                <div
                  key={group.schoolName}
                  className="rounded-lg border overflow-hidden"
                >
                  {/* School header */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted/60 border-b">
                    <School className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-semibold">{group.schoolName}</p>
                    <Badge variant="outline" className="ml-auto text-xs">
                      {group.participants.length} aluno(s)
                    </Badge>
                    <Badge
                      variant="outline"
                      className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200"
                    >
                      {group.participants.filter((p) => p.attended).length} presente(s)
                    </Badge>
                  </div>
                  {/* Participants list */}
                  <div className="divide-y">
                    {group.participants.map((participant) => (
                      <div
                        key={participant.id}
                        className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 hover:bg-accent/30 transition-colors"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarImage
                              src={participant.student.photo || undefined}
                            />
                            <AvatarFallback className="text-xs">
                              {getInitials(participant.student.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {participant.student.full_name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {participant.student.grade || "—"}
                              {participant.student.class
                                ? ` / Turma ${participant.student.class}`
                                : ""}
                              {participant.notes ? ` • ${participant.notes}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge
                            variant={participant.attended ? "default" : "secondary"}
                            className={
                              participant.attended
                                ? "bg-emerald-100 text-emerald-800 cursor-pointer"
                                : "bg-red-100 text-red-800 cursor-pointer"
                            }
                            onClick={() =>
                              onToggleAttended?.(
                                participant.student_id,
                                !participant.attended
                              )
                            }
                          >
                            {participant.attended ? "Presente" : "Ausente"}
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() =>
                              onDownloadCertificate(
                                event.id,
                                participant.student.id,
                                participant.student.full_name
                              )
                            }
                            disabled={certLoading}
                            title="Certificado"
                          >
                            <Award className="h-3.5 w-3.5" />
                          </Button>
                          {onRemoveStudent && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-destructive hover:text-destructive"
                              onClick={() =>
                                onRemoveStudent(participant.student_id)
                              }
                              title="Remover"
                            >
                              <UserMinus className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* Mobile: Cards */}
              <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
                {filteredParticipants.map((participant) => (
                  <div
                    key={participant.id}
                    className="flex items-start gap-3 rounded-lg border p-3"
                  >
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarImage
                        src={participant.student.photo || undefined}
                      />
                      <AvatarFallback>
                        {getInitials(participant.student.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {participant.student.full_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {participant.student.school?.name || "—"} •{" "}
                        {participant.student.grade || "—"}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Badge
                          variant={
                            participant.attended ? "default" : "secondary"
                          }
                          className={
                            participant.attended
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-red-100 text-red-800"
                          }
                        >
                          {participant.attended ? "Presente" : "Ausente"}
                        </Badge>
                      </div>
                      {participant.notes && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Nota: {participant.notes}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1 mt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() =>
                            onDownloadCertificate(
                              event.id,
                              participant.student.id,
                              participant.student.full_name
                            )
                          }
                          disabled={certLoading}
                        >
                          <Award className="mr-1 h-3 w-3" />
                          Certificado
                        </Button>
                        {onToggleAttended && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() =>
                              onToggleAttended(
                                participant.student_id,
                                !participant.attended
                              )
                            }
                          >
                            {participant.attended ? (
                              <XCircle className="mr-1 h-3 w-3" />
                            ) : (
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                            )}
                            {participant.attended ? "Ausente" : "Presente"}
                          </Button>
                        )}
                        {onRemoveStudent && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-destructive hover:text-destructive"
                            onClick={() =>
                              onRemoveStudent(participant.student_id)
                            }
                          >
                            <UserMinus className="mr-1 h-3 w-3" />
                            Remover
                          </Button>
                        )}
                      </div>
                    </div>
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
                      <TableHead>Série</TableHead>
                      <TableHead className="text-center">Presença</TableHead>
                      <TableHead>Notas</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredParticipants.map((participant) => (
                      <TableRow key={participant.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-7 w-7">
                              <AvatarImage
                                src={
                                  participant.student.photo || undefined
                                }
                              />
                              <AvatarFallback className="text-xs">
                                {getInitials(
                                  participant.student.full_name
                                )}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium">
                              {participant.student.full_name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {participant.student.school?.name || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {participant.student.grade || "—"}
                          {participant.student.class
                            ? ` / ${participant.student.class}`
                            : ""}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={
                              participant.attended
                                ? "default"
                                : "secondary"
                            }
                            className={
                              participant.attended
                                ? "bg-emerald-100 text-emerald-800 cursor-pointer"
                                : "bg-red-100 text-red-800 cursor-pointer"
                            }
                            onClick={() =>
                              onToggleAttended?.(
                                participant.student_id,
                                !participant.attended
                              )
                            }
                          >
                            {participant.attended ? "Presente" : "Ausente"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {editingNotes === participant.id ? (
                            <div className="flex items-center gap-1">
                              <Input
                                value={notesValue}
                                onChange={(e) =>
                                  setNotesValue(e.target.value)
                                }
                                className="h-7 text-xs"
                                placeholder="Nota..."
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2"
                                onClick={() =>
                                  handleSaveNotes(participant.student_id)
                                }
                                disabled={notesSaving}
                              >
                                {notesSaving ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-3 w-3" />
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2"
                                onClick={() => setEditingNotes(null)}
                              >
                                <XCircle className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <span
                              className="text-xs text-muted-foreground cursor-pointer hover:underline"
                              onClick={() => {
                                setEditingNotes(participant.id);
                                setNotesValue(participant.notes || "");
                              }}
                            >
                              {participant.notes || "Adicionar nota..."}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() =>
                                onDownloadCertificate(
                                  event.id,
                                  participant.student.id,
                                  participant.student.full_name
                                )
                              }
                              disabled={certLoading}
                              title="Certificado"
                            >
                              <Award className="h-3.5 w-3.5" />
                            </Button>
                            {onRemoveStudent && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-destructive hover:text-destructive"
                                onClick={() =>
                                  onRemoveStudent(
                                    participant.student_id
                                  )
                                }
                                title="Remover"
                              >
                                <UserMinus className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
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
