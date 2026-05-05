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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
}

interface StudentsApiResponse {
  students: Student[];
}

interface SchoolsApiResponse {
  schools: School[];
}

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
          initialFocus
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
        const data = await api.get<SchoolsApiResponse>("/schools");
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
          setAttendanceMap(existing);
          setExistingAttendance(existingIds);
        } catch {
          // No existing records – that's OK
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

      const promises = students.map((student) =>
        api.post("/attendance", {
          student_id: student.id,
          date: dateStr,
          status: attendanceMap[student.id],
        })
      );

      await Promise.all(promises);
      toast.success("Frequência salva com sucesso!");

      // Refresh existing attendance data
      const attendanceData = await api.get<AttendanceApiResponse>(
        `/attendance?school_id=${selectedSchoolId}&date=${dateStr}`
      );
      const existing: Record<string, "present" | "absent"> = {};
      const existingIds: Record<string, string> = {};
      for (const rec of attendanceData.records || []) {
        existing[rec.student_id] = rec.status;
        existingIds[rec.student_id] = rec.id;
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
    <div className="space-y-6">
      {/* Header & Filters */}
      <Card>
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
            {/* School selector */}
            <div className="flex-1 space-y-1.5">
              <label className="text-sm font-medium">Escola</label>
              {loadingSchools ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select
                  value={selectedSchoolId}
                  onValueChange={setSelectedSchoolId}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione a escola" />
                  </SelectTrigger>
                  <SelectContent>
                    {schools.map((school) => (
                      <SelectItem key={school.id} value={school.id}>
                        {school.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

      {/* Student list */}
      {selectedSchoolId && (
        <Card>
          <CardHeader>
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
                    variant="outline"
                    size="sm"
                    onClick={setAllPresent}
                    disabled={saving}
                  >
                    <CheckCheck className="mr-1 h-4 w-4" />
                    Todos Presentes
                  </Button>
                  <Button
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
          <CardContent>
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
              <ScrollArea className="max-h-[500px]">
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

            {/* Save button */}
            {canMark && students.length > 0 && (
              <div className="mt-6 flex items-center justify-between border-t pt-4">
                <div className="text-sm text-muted-foreground">
                  {Object.keys(attendanceMap).length} de {students.length} aluno(s) registrado(s)
                </div>
                <Button onClick={handleSave} disabled={saving}>
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
          </CardContent>
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

  // Load schools
  useEffect(() => {
    async function loadSchools() {
      try {
        setLoadingSchools(true);
        const data = await api.get<SchoolsApiResponse>("/schools");
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
    } catch {
      toast.error("Erro ao carregar histórico de frequência");
    } finally {
      setLoading(false);
    }
  }, [selectedSchoolId, dateFrom, dateTo, statusFilter]);

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
            {/* School filter */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Escola</label>
              {loadingSchools ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select
                  value={selectedSchoolId}
                  onValueChange={setSelectedSchoolId}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Todas as escolas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as escolas</SelectItem>
                    {schools.map((school) => (
                      <SelectItem key={school.id} value={school.id}>
                        {school.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Date from */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Data Início</label>
              <DatePicker
                date={dateFrom}
                onDateChange={setDateFrom}
                placeholder="A partir de..."
              />
            </div>

            {/* Date to */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Data Fim</label>
              <DatePicker
                date={dateTo}
                onDateChange={setDateTo}
                placeholder="Até..."
              />
            </div>

            {/* Status filter */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="present">Presente</SelectItem>
                  <SelectItem value="absent">Ausente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Export buttons */}
          {canExport && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
              <span className="text-sm text-muted-foreground mr-2">Exportar:</span>
              <Button
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
            {records.length > 0
              ? `${records.length} registro(s) encontrado(s)`
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
                          ? format(new Date(record.date + "T00:00:00"), "dd/MM/yyyy", {
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
    </div>
  );
}

// ── Main Attendance Page ─────────────────────────────────────────────────────

export function AttendancePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Frequência</h1>
        <p className="text-muted-foreground mt-1">
          Gerencie a frequência dos alunos e consulte o histórico de registros.
        </p>
      </div>

      <Tabs defaultValue="mark" className="space-y-4">
        <TabsList>
          <TabsTrigger value="mark" className="gap-1.5">
            <ClipboardCheck className="h-4 w-4" />
            Marcar Frequência
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <History className="h-4 w-4" />
            Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mark">
          <AttendanceMarkingView />
        </TabsContent>

        <TabsContent value="history">
          <AttendanceHistoryView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
