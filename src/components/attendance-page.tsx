"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuthStore } from "@/lib/auth-store";
import { api, ApiError } from "@/lib/api";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

import {
  ClipboardCheck,
  History,
  CalendarIcon,
  Download,
  Check,
  X,
  Loader2,
  FileSpreadsheet,
  FileText,
  Search,
  CheckCheck,
  XIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface School {
  id: string;
  name: string;
}

interface Student {
  id: string;
  full_name: string;
  class: string;
  grade: string;
  school: { id: string; name: string };
}

interface AttendanceRecord {
  id: string;
  student_id: string;
  date: string;
  status: "present" | "absent";
  created_by: string;
  created_at: string;
  student: {
    id: string;
    full_name: string;
    class: string;
    grade: string;
    school: { id: string; name: string };
  };
  user: { id: string; full_name: string };
}

interface AttendanceApiResponse {
  records: AttendanceRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface StudentsApiResponse {
  students: Student[];
}

interface SchoolsApiResponse {
  schools: School[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ── Shared select styles ─────────────────────────────────────────────────────
const nativeSelectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

// ── Date Picker Component ────────────────────────────────────────────────────

function DatePicker({
  date,
  onDateChange,
  placeholder = "Selecione a data",
  disabled,
}: {
  date: Date | undefined;
  onDateChange: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-start text-left font-normal sm:w-[200px]"
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, "dd/MM/yyyy", { locale: ptBR }) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            onDateChange(d);
            setOpen(false);
          }}
          locale={ptBR}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}

// ── Attendance Marking View ──────────────────────────────────────────────────

function AttendanceMarkingView() {
  const user = useAuthStore((s) => s.user);
  const canMark = user?.role === "Admin" || user?.role === "Operator";

  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>("");
  const [date, setDate] = useState<Date>(new Date());
  const [students, setStudents] = useState<Student[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, "present" | "absent">>({});
  const [existingAttendance, setExistingAttendance] = useState<Record<string, string>>({});

  const [loadingSchools, setLoadingSchools] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load schools
  useEffect(() => {
    async function loadSchools() {
      try {
        setLoadingSchools(true);
        const data = await api.get<SchoolsApiResponse>("/schools?limit=100");
        setSchools(data.schools || []);
      } catch {
        toast.error("Erro ao carregar escolas");
      } finally {
        setLoadingSchools(false);
      }
    }
    loadSchools();
  }, []);

  // Load students when school changes
  useEffect(() => {
    if (!selectedSchoolId) {
      setStudents([]);
      setAttendanceMap({});
      setExistingAttendance({});
      return;
    }

    async function loadStudents() {
      try {
        setLoadingStudents(true);
        const data = await api.get<StudentsApiResponse>(
          `/students?school_id=${selectedSchoolId}&limit=100`
        );
        const studentList = data.students || [];
        setStudents(studentList);
        setAttendanceMap({});
        setExistingAttendance({});

        // Load existing attendance for this date & school
        const dateStr = format(date, "yyyy-MM-dd");
        try {
          const attendanceData = await api.get<AttendanceApiResponse>(
            `/attendance?school_id=${selectedSchoolId}&date=${dateStr}`
          );
          const existing: Record<string, "present" | "absent"> = {};
          const existingIds: Record<string, string> = {};
          for (const rec of attendanceData.records || []) {
            existing[rec.student_id] = rec.status;
            existingIds[rec.student_id] = rec.id;
          }
          // Auto-fill students without records as "present" (most common case)
          for (const s of studentList) {
            if (!existing[s.id]) {
              existing[s.id] = "present";
            }
          }
          setAttendanceMap(existing);
          setExistingAttendance(existingIds);
        } catch {
          // No existing records – auto-fill all as "present"
          const defaultMap: Record<string, "present" | "absent"> = {};
          for (const s of studentList) {
            defaultMap[s.id] = "present";
          }
          setAttendanceMap(defaultMap);
          setExistingAttendance({});
        }
      } catch {
        toast.error("Erro ao carregar alunos");
      } finally {
        setLoadingStudents(false);
      }
    }
    loadStudents();
  }, [selectedSchoolId, date]);

  const toggleAttendance = (studentId: string) => {
    setAttendanceMap((prev) => {
      const current = prev[studentId];
      if (current === "present") {
        return { ...prev, [studentId]: "absent" };
      } else if (current === "absent") {
        // Unset – remove from map
        const next = { ...prev };
        delete next[studentId];
        return next;
      } else {
        return { ...prev, [studentId]: "present" };
      }
    });
  };

  const setAllPresent = () => {
    const map: Record<string, "present" | "absent"> = {};
    for (const s of students) {
      map[s.id] = "present";
    }
    setAttendanceMap(map);
  };

  const setAllAbsent = () => {
    const map: Record<string, "present" | "absent"> = {};
    for (const s of students) {
      map[s.id] = "absent";
    }
    setAttendanceMap(map);
  };

  const handleSave = async () => {
    if (!selectedSchoolId) {
      toast.error("Selecione uma escola");
      return;
    }

    const unmarked = students.filter((s) => !attendanceMap[s.id]);
    if (unmarked.length > 0) {
      toast.error(
        `${unmarked.length} aluno(s) sem frequência registrada. Marque todos como Presente ou Ausente.`
      );
      return;
    }

    try {
      setSaving(true);
      const dateStr = format(date, "yyyy-MM-dd");

      const records = students.map((student) => ({
        student_id: student.id,
        date: dateStr,
        status: attendanceMap[student.id],
      }));

      await api.post("/attendance", { records });
      toast.success("Frequência salva com sucesso!");

      // Refresh existing attendance data — use a high limit to avoid pagination truncation
      const attendanceData = await api.get<AttendanceApiResponse>(
        `/attendance?school_id=${selectedSchoolId}&date=${dateStr}&limit=200`
      );
      const existing: Record<string, "present" | "absent"> = {};
      const existingIds: Record<string, string> = {};
      for (const rec of attendanceData.records || []) {
        existing[rec.student_id] = rec.status;
        existingIds[rec.student_id] = rec.id;
      }
      // Auto-fill students without records as "present" (same logic as initial load)
      for (const s of students) {
        if (!existing[s.id]) {
          existing[s.id] = "present";
        }
      }
      setAttendanceMap(existing);
      setExistingAttendance(existingIds);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Erro ao salvar frequência";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const presentCount = Object.values(attendanceMap).filter(
    (s) => s === "present"
  ).length;
  const absentCount = Object.values(attendanceMap).filter(
    (s) => s === "absent"
  ).length;

  return (
    <div className="flex flex-col gap-6 flex-1 min-h-0">
      {/* Header & Filters */}
      <Card className="shrink-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Marcar Frequência
          </CardTitle>
          <CardDescription>
            Selecione a escola e a data para registrar a frequência dos alunos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            {/* School selector — native HTML select to avoid Radix click interception */}
            <div className="flex-1 space-y-1.5">
              <label className="text-sm font-medium">Escola</label>
              {loadingSchools ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <select
                  value={selectedSchoolId}
                  onChange={(e) => setSelectedSchoolId(e.target.value)}
                  className={nativeSelectClass}
                >
                  <option value="">Selecione a escola</option>
                  {schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Date picker */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Data</label>
              <DatePicker
                date={date}
                onDateChange={(d) => d && setDate(d)}
                placeholder="Selecione a data"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Student list — fills remaining space */}
      {selectedSchoolId && (
        <Card className="flex-1 min-h-0 flex flex-col">
          <CardHeader className="shrink-0">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="text-base">Lista de Alunos</CardTitle>
                <CardDescription className="mt-1">
                  {students.length > 0
                    ? `${students.length} aluno(s) encontrado(s) • ${presentCount} presente(s) • ${absentCount} ausente(s)`
                    : "Nenhum aluno encontrado"}
                </CardDescription>
              </div>
              {canMark && students.length > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={setAllPresent}
                    disabled={saving}
                  >
                    <CheckCheck className="mr-1 h-4 w-4" />
                    Todos Presentes
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={setAllAbsent}
                    disabled={saving}
                  >
                    <XIcon className="mr-1 h-4 w-4" />
                    Todos Ausentes
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 overflow-hidden">
            {loadingStudents ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-4 w-8" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-8 w-32" />
                  </div>
                ))}
              </div>
            ) : students.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                Nenhum aluno encontrado para esta escola.
              </div>
            ) : (
              <ScrollArea className="h-full">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Nome do Aluno</TableHead>
                      <TableHead className="hidden sm:table-cell">Turma</TableHead>
                      <TableHead className="hidden md:table-cell">Série</TableHead>
                      <TableHead className="text-right">Frequência</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {students.map((student, index) => {
                      const status = attendanceMap[student.id];
                      return (
                        <TableRow key={student.id}>
                          <TableCell className="text-muted-foreground text-sm">
                            {index + 1}
                          </TableCell>
                          <TableCell className="font-medium">
                            {student.full_name}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-muted-foreground">
                            {student.class || "—"}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground">
                            {student.grade || "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {canMark ? (
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  type="button"
                                  variant={status === "present" ? "default" : "outline"}
                                  size="sm"
                                  className={
                                    status === "present"
                                      ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                                      : ""
                                  }
                                  onClick={() =>
                                    setAttendanceMap((prev) => ({
                                      ...prev,
                                      [student.id]: "present",
                                    }))
                                  }
                                  disabled={saving}
                                >
                                  <Check className="h-4 w-4" />
                                  <span className="hidden sm:inline ml-1">Presente</span>
                                </Button>
                                <Button
                                  type="button"
                                  variant={status === "absent" ? "default" : "outline"}
                                  size="sm"
                                  className={
                                    status === "absent"
                                      ? "bg-red-600 hover:bg-red-700 text-white"
                                      : ""
                                  }
                                  onClick={() =>
                                    setAttendanceMap((prev) => ({
                                      ...prev,
                                      [student.id]: "absent",
                                    }))
                                  }
                                  disabled={saving}
                                >
                                  <X className="h-4 w-4" />
                                  <span className="hidden sm:inline ml-1">Ausente</span>
                                </Button>
                              </div>
                            ) : (
                              <Badge
                                variant={
                                  status === "present" ? "default" : "destructive"
                                }
                                className={
                                  status === "present"
                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                                    : status === "absent"
                                    ? ""
                                    : "bg-muted text-muted-foreground"
                                }
                              >
                                {status === "present"
                                  ? "Presente"
                                  : status === "absent"
                                  ? "Ausente"
                                  : "Não registrado"}
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>

          {/* Save button — always visible at the bottom */}
          {canMark && students.length > 0 && (
            <div className="shrink-0 border-t bg-card px-6 py-4 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {Object.keys(attendanceMap).length} de {students.length} aluno(s) registrado(s)
              </div>
              <Button
                type="button"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <ClipboardCheck className="mr-2 h-4 w-4" />
                    Salvar Frequência
                  </>
                )}
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ── Attendance History View ──────────────────────────────────────────────────

function AttendanceHistoryView() {
  const user = useAuthStore((s) => s.user);
  const canExport = user?.role === "Admin" || user?.role === "Operator";

  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSchools, setLoadingSchools] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Pagination state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  // Load schools
  useEffect(() => {
    async function loadSchools() {
      try {
        setLoadingSchools(true);
        const data = await api.get<SchoolsApiResponse>("/schools?limit=100");
        setSchools(data.schools || []);
      } catch {
        toast.error("Erro ao carregar escolas");
      } finally {
        setLoadingSchools(false);
      }
    }
    loadSchools();
  }, []);

  // Load attendance records
  const fetchRecords = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("limit", limit.toString());
      if (selectedSchoolId && selectedSchoolId !== "all") {
        params.set("school_id", selectedSchoolId);
      }
      if (dateFrom) {
        params.set("date_from", format(dateFrom, "yyyy-MM-dd"));
      }
      if (dateTo) {
        params.set("date_to", format(dateTo, "yyyy-MM-dd"));
      }
      if (statusFilter && statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      const qs = params.toString();
      const data = await api.get<AttendanceApiResponse>(
        `/attendance${qs ? `?${qs}` : ""}`
      );
      setRecords(data.records || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotal(data.pagination?.total || 0);
    } catch {
      toast.error("Erro ao carregar histórico de frequência");
    } finally {
      setLoading(false);
    }
  }, [selectedSchoolId, dateFrom, dateTo, statusFilter, page]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // Export handler
  const handleExport = async (exportFormat: "excel" | "pdf") => {
    try {
      setExporting(true);
      const params = new URLSearchParams();
      params.set("format", exportFormat);
      if (selectedSchoolId && selectedSchoolId !== "all") {
        params.set("school_id", selectedSchoolId);
      }
      if (dateFrom) {
        params.set("date_from", format(dateFrom, "yyyy-MM-dd"));
      }
      if (dateTo) {
        params.set("date_to", format(dateTo, "yyyy-MM-dd"));
      }

      const token = useAuthStore.getState().token;
      const response = await fetch(
        `/api/attendance/export?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) {
        throw new Error("Erro ao exportar");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `frequencia.${exportFormat === "excel" ? "xlsx" : "pdf"}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exportação em ${exportFormat === "excel" ? "Excel" : "PDF"} concluída!`);
    } catch {
      toast.error("Erro ao exportar frequência");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Filtros
          </CardTitle>
          <CardDescription>
            Filtre os registros de frequência por escola, período e status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* School filter — native HTML select */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Escola</label>
              {loadingSchools ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <select
                  value={selectedSchoolId}
                  onChange={(e) => { setSelectedSchoolId(e.target.value); setPage(1); }}
                  className={nativeSelectClass}
                >
                  <option value="all">Todas as escolas</option>
                  {schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Date from */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Data Início</label>
              <DatePicker
                date={dateFrom}
                onDateChange={(d) => { setDateFrom(d); setPage(1); }}
                placeholder="A partir de..."
              />
            </div>

            {/* Date to */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Data Fim</label>
              <DatePicker
                date={dateTo}
                onDateChange={(d) => { setDateTo(d); setPage(1); }}
                placeholder="Até..."
              />
            </div>

            {/* Status filter — native HTML select */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                className={nativeSelectClass}
              >
                <option value="all">Todos</option>
                <option value="present">Presente</option>
                <option value="absent">Ausente</option>
              </select>
            </div>
          </div>

          {/* Export buttons */}
          {canExport && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
              <span className="text-sm text-muted-foreground mr-2">Exportar:</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleExport("excel")}
                disabled={exporting}
              >
                {exporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                )}
                Exportar Excel
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleExport("pdf")}
                disabled={exporting}
              >
                {exporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="mr-2 h-4 w-4" />
                )}
                Exportar PDF
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* History table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-5 w-5" />
            Histórico de Frequência
          </CardTitle>
          <CardDescription>
            {total > 0
              ? `${total} registro(s) encontrado(s)`
              : "Nenhum registro encontrado"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-4 w-28" />
                </div>
              ))}
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <ClipboardCheck className="h-10 w-10 mb-2 opacity-30" />
              <p className="text-sm">Nenhum registro de frequência encontrado.</p>
              <p className="text-xs mt-1">Ajuste os filtros para buscar registros.</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Aluno</TableHead>
                    <TableHead className="hidden sm:table-cell">Escola</TableHead>
                    <TableHead className="hidden md:table-cell">Turma</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden lg:table-cell">Registrado por</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="text-sm">
                        {record.date
                          ? format(new Date(record.date), "dd/MM/yyyy", {
                              locale: ptBR,
                            })
                          : "—"}
                      </TableCell>
                      <TableCell className="font-medium">
                        {record.student?.full_name || "—"}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground">
                        {record.student?.school?.name || "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        {record.student?.class || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            record.status === "present" ? "default" : "destructive"
                          }
                          className={
                            record.status === "present"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                              : ""
                          }
                        >
                          {record.status === "present" ? "Presente" : "Ausente"}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                        {record.user?.full_name || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Página {page} de {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
            >
              Próxima
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Attendance Page ─────────────────────────────────────────────────────

export function AttendancePage() {
  return (
    <div className="flex flex-col flex-1 min-h-0 gap-6">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Frequência</h1>
        <p className="text-muted-foreground mt-1">
          Gerencie a frequência dos alunos e consulte o histórico de registros.
        </p>
      </div>

      <Tabs defaultValue="mark" className="flex-1 min-h-0 flex flex-col gap-4">
        <TabsList className="shrink-0 self-start">
          <TabsTrigger value="mark" className="gap-1.5">
            <ClipboardCheck className="h-4 w-4" />
            Marcar Frequência
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <History className="h-4 w-4" />
            Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mark" className="flex-1 min-h-0">
          <AttendanceMarkingView />
        </TabsContent>

        <TabsContent value="history" className="flex-1 min-h-0">
          <AttendanceHistoryView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
