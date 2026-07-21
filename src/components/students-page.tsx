"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { useAuthStore } from "@/lib/auth-store";
import { api, ApiError } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  ArrowLeft,
  Camera,
  Upload,
  User,
  Heart,
  Shield,
  GraduationCap,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  CalendarDays,
  FileUp,
  AlertTriangle,
  ClipboardCheck,
  ArrowRightLeft,
  Download,
  FileDown,
  Printer,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface School {
  id: string;
  name: string;
}

interface Student {
  id: string;
  full_name: string;
  cpf: string | null;
  rg: string | null;
  date_of_birth: string | null;
  blood_type: string | null;
  special_needs: string | null;
  medications: string | null;
  class: string | null;
  grade: string | null;
  phone: string | null;
  address: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  guardian_email: string | null;
  emergency_contact: string | null;
  school_id: string;
  status: string;
  photo: string | null;
  created_at: string;
  school: School;
}

interface AttendanceRecord {
  id: string;
  date: string;
  status: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface StudentDocument {
  id: string;
  document_type: string;
  status: string;
  notes: string | null;
  delivered_at: string | null;
  verified_by: string | null;
  created_at: string;
  verifier: { id: string; full_name: string } | null;
}

interface StudentTransferRecord {
  id: string;
  from_school_id: string;
  to_school_id: string;
  reason: string | null;
  transferred_by: string;
  transferred_at: string;
  from_school: { id: string; name: string };
  to_school: { id: string; name: string };
  transferred_by_user: { id: string; full_name: string };
}

interface StudentFormData {
  full_name: string;
  cpf: string;
  rg: string;
  date_of_birth: string;
  blood_type: string;
  special_needs: string;
  medications: string;
  class: string;
  grade: string;
  phone: string;
  address: string;
  guardian_name: string;
  guardian_phone: string;
  guardian_email: string;
  emergency_contact: string;
  school_id: string;
  status: string;
  photo: string;
}

const emptyForm: StudentFormData = {
  full_name: "",
  cpf: "",
  rg: "",
  date_of_birth: "",
  blood_type: "",
  special_needs: "",
  medications: "",
  class: "",
  grade: "",
  phone: "",
  address: "",
  guardian_name: "",
  guardian_phone: "",
  guardian_email: "",
  emergency_contact: "",
  school_id: "",
  status: "active",
  photo: "",
};

const gradeOptions = [
  "1º Ano",
  "2º Ano",
  "3º Ano",
  "4º Ano",
  "5º Ano",
  "6º Ano",
  "7º Ano",
  "8º Ano",
  "9º Ano",
];

const classOptions = ["A", "B", "C", "D", "E", "F"];

const bloodTypeOptions = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const documentTypeLabels: Record<string, string> = {
  birth_certificate: "Certidão de Nascimento",
  residence_proof: "Comprovante de Residência",
  vaccination_card: "Cartão de Vacinação",
  photo_3x4: "Foto 3x4",
  rg_copy: "Cópia do RG",
  cpf_copy: "Cópia do CPF",
  medical_report: "Laudo Médico",
  enrollment_form: "Ficha de Matrícula",
  income_proof: "Comprovante de Renda",
  other: "Outro",
};

const documentTypeOptions = Object.entries(documentTypeLabels).map(([value, label]) => ({ value, label }));

// ─── Custom Modal ────────────────────────────────────────────────────────────

function Modal({ open, onClose, children, maxWidth = "max-w-2xl" }: {
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
    return () => { document.body.style.overflow = ""; };
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
        className={`relative z-10 w-full ${maxWidth} mx-4 bg-background rounded-lg border shadow-lg animate-in fade-in-0 zoom-in-95 duration-200`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Native Select Styling ───────────────────────────────────────────────────

const nativeSelectClass = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCPF(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9)
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7)
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("pt-BR");
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

// ─── Photo Upload Component ──────────────────────────────────────────────────

function PhotoUpload({
  photo,
  onPhotoChange,
}: {
  photo: string;
  onPhotoChange: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/jpg"].includes(file.type)) {
      toast.error("Tipo de arquivo não permitido. Use JPG ou PNG.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Tamanho máximo: 5MB.");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = useAuthStore.getState().token;
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro no upload");
      }
      const data = await res.json();
      onPhotoChange(data.url);
      toast.success("Foto enviada com sucesso!");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao enviar foto"
      );
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    e.target.value = "";
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <Avatar className="h-24 w-24">
        <AvatarImage src={photo || undefined} alt="Foto do aluno" />
        <AvatarFallback className="bg-muted text-muted-foreground text-2xl">
          <User className="h-10 w-10" />
        </AvatarFallback>
      </Avatar>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-4 w-4 mr-1" />
          {uploading ? "Enviando..." : "Galeria"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => cameraInputRef.current?.click()}
        >
          <Camera className="h-4 w-4 mr-1" />
          Câmera
        </Button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}

// ─── Student Form Dialog ─────────────────────────────────────────────────────

function StudentFormDialog({
  open,
  onOpenChange,
  student,
  schools,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: Student | null;
  schools: School[];
  onSuccess: () => void;
}) {
  const [form, setForm] = useState<StudentFormData>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof StudentFormData, string>>>({});
  const [saving, setSaving] = useState(false);
  const isEditing = !!student;

  useEffect(() => {
    if (student) {
      setForm({
        full_name: student.full_name || "",
        cpf: student.cpf || "",
        rg: student.rg || "",
        date_of_birth: student.date_of_birth
          ? new Date(student.date_of_birth).toISOString().split("T")[0]
          : "",
        blood_type: student.blood_type || "",
        special_needs: student.special_needs || "",
        medications: student.medications || "",
        class: student.class || "",
        grade: student.grade || "",
        phone: student.phone || "",
        address: student.address || "",
        guardian_name: student.guardian_name || "",
        guardian_phone: student.guardian_phone || "",
        guardian_email: student.guardian_email || "",
        emergency_contact: student.emergency_contact || "",
        school_id: student.school_id || "",
        status: student.status || "active",
        photo: student.photo || "",
      });
    } else {
      setForm(emptyForm);
    }
    setErrors({});
  }, [student, open]);

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof StudentFormData, string>> = {};
    if (!form.full_name.trim()) newErrors.full_name = "Nome é obrigatório";
    if (!form.school_id) newErrors.school_id = "Escola é obrigatória";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = {
        ...form,
        cpf: form.cpf.replace(/\D/g, "") || null,
        phone: form.phone.replace(/\D/g, "") || null,
        guardian_phone: form.guardian_phone.replace(/\D/g, "") || null,
      };

      if (isEditing) {
        await api.put(`/students/${student!.id}`, payload);
        toast.success("Aluno atualizado com sucesso!");
      } else {
        await api.post("/students", payload);
        toast.success("Aluno criado com sucesso!");
      }
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error("Erro ao salvar aluno");
      }
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof StudentFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleClose = () => {
    if (!saving) onOpenChange(false);
  };

  return (
    <Modal open={open} onClose={handleClose} maxWidth="max-w-2xl">
      <div className="px-6 pt-6 pb-2">
        <h2 className="text-lg font-semibold">
          {isEditing ? "Editar Aluno" : "Novo Aluno"}
        </h2>
      </div>
      <Tabs defaultValue="personal" className="w-full">
        <div className="px-6">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="personal">Dados Pessoais</TabsTrigger>
            <TabsTrigger value="school">Escolar</TabsTrigger>
            <TabsTrigger value="guardian">Responsável</TabsTrigger>
          </TabsList>
        </div>
        <ScrollArea className="h-[55vh]">
          {/* Personal Tab */}
          <TabsContent value="personal" className="px-6 pb-4 mt-4 space-y-4">
            <div className="flex justify-center py-2">
              <PhotoUpload
                photo={form.photo}
                onPhotoChange={(url) => updateField("photo", url)}
              />
            </div>
            <Separator />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label htmlFor="full_name">
                  Nome Completo <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="full_name"
                  value={form.full_name}
                  onChange={(e) => updateField("full_name", e.target.value)}
                  placeholder="Nome completo do aluno"
                  className={errors.full_name ? "border-destructive" : ""}
                />
                {errors.full_name && (
                  <p className="text-sm text-destructive mt-1">
                    {errors.full_name}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="cpf">CPF</Label>
                <Input
                  id="cpf"
                  value={form.cpf}
                  onChange={(e) =>
                    updateField("cpf", formatCPF(e.target.value))
                  }
                  placeholder="000.000.000-00"
                />
              </div>

              <div>
                <Label htmlFor="rg">RG</Label>
                <Input
                  id="rg"
                  value={form.rg}
                  onChange={(e) => updateField("rg", e.target.value)}
                  placeholder="RG do aluno"
                />
              </div>

              <div>
                <Label htmlFor="date_of_birth">Data de Nascimento</Label>
                <Input
                  id="date_of_birth"
                  type="date"
                  value={form.date_of_birth}
                  onChange={(e) =>
                    updateField("date_of_birth", e.target.value)
                  }
                />
              </div>

              <div>
                <Label htmlFor="blood_type">Tipo Sanguíneo</Label>
                <select
                  id="blood_type"
                  value={form.blood_type}
                  onChange={(e) => updateField("blood_type", e.target.value)}
                  className={nativeSelectClass}
                >
                  <option value="">Selecionar</option>
                  {bloodTypeOptions.map((bt) => (
                    <option key={bt} value={bt}>
                      {bt}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) =>
                    updateField("phone", formatPhone(e.target.value))
                  }
                  placeholder="(00) 00000-0000"
                />
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="address">Endereço</Label>
                <Textarea
                  id="address"
                  value={form.address}
                  onChange={(e) => updateField("address", e.target.value)}
                  placeholder="Endereço completo"
                  rows={2}
                />
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="special_needs">Necessidades Especiais</Label>
                <Textarea
                  id="special_needs"
                  value={form.special_needs}
                  onChange={(e) =>
                    updateField("special_needs", e.target.value)
                  }
                  placeholder="Descreva se houver necessidades especiais"
                  rows={2}
                />
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="medications">Medicações</Label>
                <Textarea
                  id="medications"
                  value={form.medications}
                  onChange={(e) =>
                    updateField("medications", e.target.value)
                  }
                  placeholder="Medicações em uso"
                  rows={2}
                />
              </div>
            </div>
          </TabsContent>

          {/* School Tab */}
          <TabsContent value="school" className="px-6 pb-4 mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label htmlFor="school_id">
                  Escola <span className="text-destructive">*</span>
                </Label>
                <select
                  id="school_id"
                  value={form.school_id}
                  onChange={(e) => updateField("school_id", e.target.value)}
                  className={`${nativeSelectClass} ${errors.school_id ? "border-destructive" : ""}`}
                >
                  <option value="">Selecionar escola</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {errors.school_id && (
                  <p className="text-sm text-destructive mt-1">
                    {errors.school_id}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="grade">Série</Label>
                <select
                  id="grade"
                  value={form.grade}
                  onChange={(e) => updateField("grade", e.target.value)}
                  className={nativeSelectClass}
                >
                  <option value="">Selecionar série</option>
                  {gradeOptions.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="class">Turma</Label>
                <select
                  id="class_field"
                  value={form.class}
                  onChange={(e) => updateField("class", e.target.value)}
                  className={nativeSelectClass}
                >
                  <option value="">Selecionar turma</option>
                  {classOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  value={form.status}
                  onChange={(e) => updateField("status", e.target.value)}
                  className={nativeSelectClass}
                >
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </select>
              </div>
            </div>
          </TabsContent>

          {/* Guardian Tab */}
          <TabsContent value="guardian" className="px-6 pb-4 mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label htmlFor="guardian_name">Nome do Responsável</Label>
                <Input
                  id="guardian_name"
                  value={form.guardian_name}
                  onChange={(e) =>
                    updateField("guardian_name", e.target.value)
                  }
                  placeholder="Nome completo do responsável"
                />
              </div>

              <div>
                <Label htmlFor="guardian_phone">
                  Telefone do Responsável
                </Label>
                <Input
                  id="guardian_phone"
                  value={form.guardian_phone}
                  onChange={(e) =>
                    updateField(
                      "guardian_phone",
                      formatPhone(e.target.value)
                    )
                  }
                  placeholder="(00) 00000-0000"
                />
              </div>

              <div>
                <Label htmlFor="guardian_email">
                  E-mail do Responsável
                </Label>
                <Input
                  id="guardian_email"
                  type="email"
                  value={form.guardian_email}
                  onChange={(e) =>
                    updateField("guardian_email", e.target.value)
                  }
                  placeholder="email@exemplo.com"
                />
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="emergency_contact">
                  Contato de Emergência
                </Label>
                <Input
                  id="emergency_contact"
                  value={form.emergency_contact}
                  onChange={(e) =>
                    updateField("emergency_contact", e.target.value)
                  }
                  placeholder="Nome e telefone para emergências"
                />
              </div>
            </div>
          </TabsContent>
        </ScrollArea>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={saving} className="bg-[#2480dc] hover:bg-[#1f6db8] active:bg-[#1a5fa3] text-white">
            {saving
              ? "Salvando..."
              : isEditing
                ? "Salvar Alterações"
                : "Criar Aluno"}
          </Button>
        </div>
      </Tabs>
    </Modal>
  );
}

// ─── Student Profile View ────────────────────────────────────────────────────

function StudentProfile({
  student,
  attendanceRecords,
  onBack,
  onEdit,
  onDelete,
  loadingAttendance,
  schools,
  onStudentUpdated,
}: {
  student: Student;
  attendanceRecords: AttendanceRecord[];
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  loadingAttendance: boolean;
  schools: School[];
  onStudentUpdated: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const isAdmin = user?.role === "Admin";
  const canEdit = user?.role === "Admin";

  // Document state
  const [documents, setDocuments] = useState<StudentDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [newDocType, setNewDocType] = useState("");
  const [updatingDocId, setUpdatingDocId] = useState<string | null>(null);

  // Transfer dialog state
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferToSchool, setTransferToSchool] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [transferLoading, setTransferLoading] = useState(false);

  // Authorization dialog state
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [authForm, setAuthForm] = useState({
    event_title: "",
    event_date: "",
    event_location: "",
    departure_time: "",
    return_time: "",
    responsible_name: "",
    observations: "",
  });
  const [authLoading, setAuthLoading] = useState(false);
  const [authEvents, setAuthEvents] = useState<Array<{
    id: string;
    source: string;
    title: string;
    date: string;
    location: string | null;
    departure_time: string | null;
    return_time: string | null;
    responsible_name: string | null;
    observations: string | null;
    school_name: string | null;
    type: string;
    category?: string;
    status?: string;
  }>>([]);
  const [authSelectedEventId, setAuthSelectedEventId] = useState("");
  const [authTemplates, setAuthTemplates] = useState<Array<{
    id: string;
    name: string;
    display_name: string;
  }>>([]);
  const [authSelectedTemplateId, setAuthSelectedTemplateId] = useState("");
  const [authEventsLoading, setAuthEventsLoading] = useState(false);

  // Fetch events and templates when dialog opens
  useEffect(() => {
    if (authDialogOpen) {
      // Fetch available events
      setAuthEventsLoading(true);
      fetch("/api/students/authorization-events?upcoming=true", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          setAuthEvents(data.events || []);
        })
        .catch(() => {
          toast.error("Erro ao carregar eventos");
        })
        .finally(() => setAuthEventsLoading(false));

      // Fetch document templates
      fetch("/api/document-templates?is_active=true", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          setAuthTemplates(data.templates || []);
        })
        .catch(() => {
          // Templates are optional, don't show error
        });
    }
  }, [authDialogOpen, token]);

  // Print loading
  const [printLoading, setPrintLoading] = useState(false);

  // Fetch documents
  const fetchDocuments = useCallback(async () => {
    try {
      setLoadingDocs(true);
      const data = await api.get<{ documents: StudentDocument[] }>(
        `/students/${student.id}/documents`
      );
      setDocuments(data.documents || []);
    } catch {
      toast.error("Erro ao carregar documentos do aluno");
    } finally {
      setLoadingDocs(false);
    }
  }, [student.id]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Document action handlers
  const handleMarkDelivered = async (doc: StudentDocument) => {
    try {
      setUpdatingDocId(doc.id);
      await api.put(`/students/${student.id}/documents`, {
        document_type: doc.document_type,
        status: "delivered",
      });
      toast.success("Documento marcado como entregue");
      fetchDocuments();
    } catch {
      toast.error("Erro ao atualizar documento");
    } finally {
      setUpdatingDocId(null);
    }
  };

  const handleMarkVerified = async (doc: StudentDocument) => {
    try {
      setUpdatingDocId(doc.id);
      await api.put(`/students/${student.id}/documents`, {
        document_type: doc.document_type,
        status: "verified",
      });
      toast.success("Documento verificado com sucesso");
      fetchDocuments();
    } catch {
      toast.error("Erro ao verificar documento");
    } finally {
      setUpdatingDocId(null);
    }
  };

  const handleAddDocument = async () => {
    if (!newDocType) return;
    try {
      await api.post(`/students/${student.id}/documents`, {
        document_type: newDocType,
        status: "pending",
      });
      toast.success("Documento adicionado");
      setNewDocType("");
      fetchDocuments();
    } catch {
      toast.error("Erro ao adicionar documento");
    }
  };

  // Print profile PDF
  const handlePrintProfile = async () => {
    try {
      setPrintLoading(true);
      const response = await fetch(`/api/students/${student.id}/profile-pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ficha-${student.full_name.replace(/\s+/g, "-").toLowerCase()}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Erro ao gerar ficha do aluno");
    } finally {
      setPrintLoading(false);
    }
  };

  // Transfer handler
  const handleTransfer = async () => {
    if (!transferToSchool) {
      toast.error("Selecione a escola de destino");
      return;
    }
    try {
      setTransferLoading(true);
      await api.post(`/students/${student.id}/transfer`, {
        to_school_id: transferToSchool,
        reason: transferReason || undefined,
      });
      toast.success("Aluno transferido com sucesso!");
      setTransferDialogOpen(false);
      setTransferToSchool("");
      setTransferReason("");
      onStudentUpdated();
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error("Erro ao transferir aluno");
      }
    } finally {
      setTransferLoading(false);
    }
  };

  // Auth event selection handler
  const handleAuthEventSelect = (eventId: string) => {
    setAuthSelectedEventId(eventId);
    if (!eventId) return;

    const selectedEvent = authEvents.find((e) => e.id === eventId);
    if (selectedEvent) {
      // Format date as YYYY-MM-DD for the input
      const eventDate = new Date(selectedEvent.date);
      const dateStr = eventDate.toISOString().split("T")[0];

      setAuthForm({
        ...authForm,
        event_title: selectedEvent.title,
        event_date: dateStr,
        event_location: selectedEvent.location || "",
        departure_time: selectedEvent.departure_time || "",
        return_time: selectedEvent.return_time || "",
        responsible_name: selectedEvent.responsible_name || "",
        observations: selectedEvent.observations || "",
      });
    }
  };

  // Authorization PDF handler
  const handleGenerateAuthPdf = async () => {
    if (!authForm.event_title || !authForm.event_date) {
      toast.error("Preencha o título e a data do evento");
      return;
    }
    try {
      setAuthLoading(true);

      const body: Record<string, unknown> = {
        student_ids: [student.id],
        event_title: authForm.event_title,
        event_date: authForm.event_date,
        event_location: authForm.event_location || undefined,
        departure_time: authForm.departure_time || undefined,
        return_time: authForm.return_time || undefined,
        responsible_name: authForm.responsible_name || undefined,
        observations: authForm.observations || undefined,
      };

      // Add template if selected
      if (authSelectedTemplateId) {
        body.template_id = authSelectedTemplateId;
      }

      // Add calendar event reference if selected
      if (authSelectedEventId) {
        const selectedEvent = authEvents.find((e) => e.id === authSelectedEventId);
        if (selectedEvent) {
          body.calendar_event_id = authSelectedEventId;
          body.calendar_event_source = selectedEvent.source;
        }
      }

      const response = await fetch("/api/students/authorization-pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `autorizacao-${student.full_name.replace(/\s+/g, "-").toLowerCase()}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("Autorização gerada com sucesso!");
    } catch {
      toast.error("Erro ao gerar autorização");
    } finally {
      setAuthLoading(false);
    }
  };

  const totalRecords = attendanceRecords.length;
  const presentCount = attendanceRecords.filter(
    (r) => r.status === "present"
  ).length;
  const absentCount = totalRecords - presentCount;
  const attendanceRate =
    totalRecords > 0
      ? Math.round((presentCount / totalRecords) * 100)
      : 0;

  // Document summary
  const deliveredCount = documents.filter(
    (d) => d.status === "delivered" || d.status === "verified"
  ).length;
  const totalDocs = documents.length;

  const statusBadge = (status: string) => {
    switch (status) {
      case "verified":
        return (
          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">
            Verificado
          </Badge>
        );
      case "delivered":
        return (
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200 dark:border-blue-800">
            Entregue
          </Badge>
        );
      default:
        return (
          <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800">
            Pendente
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <Button type="button" variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar
        </Button>
        <div className="flex-1" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handlePrintProfile}
          disabled={printLoading}
        >
          {printLoading ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Printer className="h-4 w-4 mr-1" />
          )}
          Imprimir Ficha
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setAuthDialogOpen(true)}
        >
          <ClipboardCheck className="h-4 w-4 mr-1" />
          Autorização
        </Button>
        {isAdmin && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTransferDialogOpen(true)}
          >
            <ArrowRightLeft className="h-4 w-4 mr-1" />
            Transferir
          </Button>
        )}
        {canEdit && (
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="h-4 w-4 mr-1" />
            Editar
          </Button>
        )}
        {isAdmin && (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Excluir
          </Button>
        )}
      </div>

      {/* Profile Header Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <Avatar className="h-28 w-28">
              <AvatarImage
                src={student.photo || undefined}
                alt={student.full_name}
              />
              <AvatarFallback className="bg-muted text-muted-foreground text-3xl">
                {getInitials(student.full_name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 text-center sm:text-left">
              <h2 className="text-2xl font-bold">{student.full_name}</h2>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2">
                <Badge
                  variant={
                    student.status === "active" ? "default" : "destructive"
                  }
                  className={
                    student.status === "active"
                      ? "bg-emerald-500 hover:bg-emerald-600"
                      : ""
                  }
                >
                  {student.status === "active" ? "Ativo" : "Inativo"}
                </Badge>
                {student.grade && (
                  <Badge variant="outline">{student.grade}</Badge>
                )}
                {student.class && (
                  <Badge variant="outline">Turma {student.class}</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                <GraduationCap className="h-4 w-4 inline mr-1" />
                {student.school?.name || "Escola não informada"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Personal Data */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              Dados Pessoais
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="CPF" value={student.cpf} />
            <InfoRow label="RG" value={student.rg} />
            <InfoRow
              label="Data de Nascimento"
              value={formatDate(student.date_of_birth)}
            />
            <InfoRow label="Tipo Sanguíneo" value={student.blood_type} />
            <InfoRow label="Telefone" value={student.phone} />
            <InfoRow label="Endereço" value={student.address} />
          </CardContent>
        </Card>

        {/* Health Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Heart className="h-4 w-4" />
              Saúde
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow
              label="Necessidades Especiais"
              value={student.special_needs}
            />
            <InfoRow label="Medicações" value={student.medications} />
            <InfoRow
              label="Contato de Emergência"
              value={student.emergency_contact}
            />
          </CardContent>
        </Card>

        {/* School Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <GraduationCap className="h-4 w-4" />
              Informações Escolares
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="Escola" value={student.school?.name} />
            <InfoRow label="Série" value={student.grade} />
            <InfoRow label="Turma" value={student.class} />
            <InfoRow
              label="Status"
              value={student.status === "active" ? "Ativo" : "Inativo"}
            />
            <InfoRow
              label="Cadastrado em"
              value={formatDate(student.created_at)}
            />
          </CardContent>
        </Card>

        {/* Guardian Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Responsável
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="Nome" value={student.guardian_name} />
            <InfoRow label="Telefone" value={student.guardian_phone} />
            <InfoRow label="E-mail" value={student.guardian_email} />
          </CardContent>
        </Card>
      </div>

      {/* Attendance Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Resumo de Frequência
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingAttendance ? (
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : totalRecords === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">
              Nenhum registro de frequência encontrado
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {presentCount}
                  </p>
                  <p className="text-xs text-muted-foreground">Presenças</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-red-50 dark:bg-red-950/30">
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                    {absentCount}
                  </p>
                  <p className="text-xs text-muted-foreground">Faltas</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {attendanceRate}%
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Frequência
                  </p>
                </div>
              </div>
              {/* Recent attendance list */}
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 font-medium text-muted-foreground">
                        Data
                      </th>
                      <th className="text-left py-2 font-medium text-muted-foreground">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceRecords.slice(0, 20).map((record) => (
                      <tr key={record.id} className="border-b last:border-0">
                        <td className="py-2">
                          {formatDate(record.date)}
                        </td>
                        <td className="py-2">
                          {record.status === "present" ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Presente
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                              <XCircle className="h-3.5 w-3.5" />
                              Ausente
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Documentação */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" />
            Documentação
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingDocs ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : documents.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">
              Nenhum documento registrado
            </p>
          ) : (
            <>
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">
                        Documento
                      </th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">
                        Status
                      </th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground hidden sm:table-cell">
                        Observações
                      </th>
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => (
                      <tr key={doc.id} className="border-b last:border-0">
                        <td className="py-2 px-3">
                          {documentTypeLabels[doc.document_type] || doc.document_type}
                        </td>
                        <td className="py-2 px-3">
                          {statusBadge(doc.status)}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground hidden sm:table-cell">
                          {doc.notes || "—"}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {doc.status === "pending" && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => handleMarkDelivered(doc)}
                                disabled={updatingDocId === doc.id}
                              >
                                {updatingDocId === doc.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Download className="h-3 w-3 mr-1" />
                                )}
                                Entregar
                              </Button>
                            )}
                            {doc.status === "delivered" && isAdmin && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => handleMarkVerified(doc)}
                                disabled={updatingDocId === doc.id}
                              >
                                {updatingDocId === doc.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                )}
                                Verificar
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  {deliveredCount} de {totalDocs} documentos entregues
                </p>
              </div>
            </>
          )}

          {/* Add new document */}
          <div className="flex items-center gap-2 mt-4 pt-4 border-t">
            <select
              className={nativeSelectClass}
              value={newDocType}
              onChange={(e) => setNewDocType(e.target.value)}
            >
              <option value="">Selecione um documento...</option>
              {documentTypeOptions
                .filter(
                  (opt) => !documents.some((d) => d.document_type === opt.value)
                )
                .map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
            </select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddDocument}
              disabled={!newDocType}
            >
              <Plus className="h-4 w-4 mr-1" />
              Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Transfer Dialog */}
      <Modal
        open={transferDialogOpen}
        onClose={() => {
          setTransferDialogOpen(false);
          setTransferToSchool("");
          setTransferReason("");
        }}
        maxWidth="max-w-md"
      >
        <div className="px-6 pt-6 pb-2">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Transferir Aluno
          </h2>
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label>Escola Atual</Label>
              <Input
                value={student.school?.name || "—"}
                readOnly
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label>Escola de Destino</Label>
              <select
                className={nativeSelectClass}
                value={transferToSchool}
                onChange={(e) => setTransferToSchool(e.target.value)}
              >
                <option value="">Selecione a escola...</option>
                {schools
                  .filter((s) => s.id !== student.school_id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Motivo (opcional)</Label>
              <Textarea
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="Motivo da transferência..."
                rows={3}
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setTransferDialogOpen(false);
              setTransferToSchool("");
              setTransferReason("");
            }}
            disabled={transferLoading}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleTransfer}
            disabled={transferLoading || !transferToSchool}
          >
            {transferLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Transferindo...
              </>
            ) : (
              "Confirmar Transferência"
            )}
          </Button>
        </div>
      </Modal>

      {/* Authorization PDF Dialog */}
      <Modal
        open={authDialogOpen}
        onClose={() => {
          setAuthDialogOpen(false);
          setAuthSelectedEventId("");
          setAuthSelectedTemplateId("");
        }}
        maxWidth="max-w-lg"
      >
        <div className="px-6 pt-6 pb-2">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Autorização de Saída para Passeio
          </h2>
          <div className="mt-4 space-y-4">
            {/* Student info */}
            <div className="space-y-2">
              <Label>Aluno</Label>
              <Input
                value={student.full_name}
                readOnly
                className="bg-muted"
              />
            </div>

            {/* Event selector */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" />
                Selecionar Evento Existente
              </Label>
              <select
                value={authSelectedEventId}
                onChange={(e) => handleAuthEventSelect(e.target.value)}
                disabled={authEventsLoading}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">
                  {authEventsLoading ? "Carregando eventos..." : "— Digitar manualmente —"}
                </option>
                {authEvents.map((ev) => (
                  <option key={`${ev.source}-${ev.id}`} value={ev.id}>
                    {ev.title} — {new Date(ev.date).toLocaleDateString("pt-BR")}
                    {ev.location ? ` — ${ev.location}` : ""}
                    {ev.school_name ? ` (${ev.school_name})` : ""}
                  </option>
                ))}
              </select>
              {authEvents.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {authEvents.length} evento(s) encontrado(s). Selecione para preencher automaticamente.
                </p>
              )}
            </div>

            {/* Template selector */}
            {authTemplates.length > 0 && (
              <div className="space-y-2">
                <Label>Modelo de Documento</Label>
                <select
                  value={authSelectedTemplateId}
                  onChange={(e) => setAuthSelectedTemplateId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">Modelo padrão</option>
                  {authTemplates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.display_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Divider */}
            <div className="border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                Dados da Atividade
              </p>
            </div>

            {/* Event details form */}
            <div className="space-y-2">
              <Label>Título do Evento *</Label>
              <Input
                value={authForm.event_title}
                onChange={(e) =>
                  setAuthForm({ ...authForm, event_title: e.target.value })
                }
                placeholder="Ex: Passeio ao museu"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data do Evento *</Label>
                <Input
                  type="date"
                  value={authForm.event_date}
                  onChange={(e) =>
                    setAuthForm({ ...authForm, event_date: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Local</Label>
                <Input
                  value={authForm.event_location}
                  onChange={(e) =>
                    setAuthForm({ ...authForm, event_location: e.target.value })
                  }
                  placeholder="Local do evento"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Horário de Saída</Label>
                <Input
                  type="time"
                  value={authForm.departure_time}
                  onChange={(e) =>
                    setAuthForm({ ...authForm, departure_time: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Horário de Retorno</Label>
                <Input
                  type="time"
                  value={authForm.return_time}
                  onChange={(e) =>
                    setAuthForm({ ...authForm, return_time: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Nome do Responsável</Label>
              <Input
                value={authForm.responsible_name}
                onChange={(e) =>
                  setAuthForm({ ...authForm, responsible_name: e.target.value })
                }
                placeholder="Nome do responsável pelo passeio"
              />
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                value={authForm.observations}
                onChange={(e) =>
                  setAuthForm({ ...authForm, observations: e.target.value })
                }
                placeholder="Observações adicionais..."
                rows={3}
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setAuthDialogOpen(false);
              setAuthSelectedEventId("");
              setAuthSelectedTemplateId("");
            }}
            disabled={authLoading}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleGenerateAuthPdf}
            disabled={authLoading}
          >
            {authLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <FileDown className="mr-2 h-4 w-4" />
                Gerar PDF
              </>
            )}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex justify-between items-start gap-2">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-right">
        {value || "—"}
      </span>
    </div>
  );
}

// ─── Student Events Dialog ──────────────────────────────────────────────────

interface StudentEventData {
  id: string;
  title: string;
  date: string;
  location: string | null;
  status: string;
  student_attended: boolean;
  student_notes: string | null;
}

const eventStatusLabels: Record<string, string> = {
  upcoming: "Próximo",
  ongoing: "Em Andamento",
  completed: "Concluído",
  cancelled: "Cancelado",
};

const eventStatusBadgeClass: Record<string, string> = {
  upcoming: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  ongoing: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  completed: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300 border-red-200 dark:border-red-800",
};

function StudentEventsDialog({
  open,
  onOpenChange,
  student,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: Student | null;
}) {
  const [events, setEvents] = useState<StudentEventData[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && student) {
      fetchStudentEvents(student.id);
    }
  }, [open, student]);

  const fetchStudentEvents = async (studentId: string) => {
    try {
      setLoading(true);
      const data = await api.get<{ events: StudentEventData[] }>(
        `/events?student_id=${studentId}&limit=100`
      );
      setEvents(data.events);
    } catch {
      toast.error("Erro ao carregar eventos do aluno");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={() => onOpenChange(false)} maxWidth="max-w-lg">
      <div className="px-6 pt-6 pb-2">
        <h2 className="text-lg font-semibold">Eventos do Aluno</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Eventos em que <strong>{student?.full_name}</strong> participa
        </p>
      </div>
      <div className="px-6 py-2">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <CalendarDays className="h-10 w-10 mb-3 text-muted-foreground/40" />
            <p className="text-sm">Nenhum evento encontrado para este aluno</p>
          </div>
        ) : (
          <ScrollArea className="max-h-96">
            <div className="space-y-3 pr-2">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start gap-3 rounded-lg border p-3"
                >
                  <div className="mt-0.5">
                    {event.student_attended ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{event.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {formatDate(event.date)}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 ${eventStatusBadgeClass[event.status] || ""}`}
                      >
                        {eventStatusLabels[event.status] || event.status}
                      </Badge>
                    </div>
                    {event.student_notes && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Obs: {event.student_notes}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
      <div className="flex justify-end px-6 py-4 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
        >
          Fechar
        </Button>
      </div>
    </Modal>
  );
}

// ─── Bulk Import Students Dialog ─────────────────────────────────────────────

interface ImportResult {
  total: number;
  created: number;
  skipped: number;
  errors: { row: number; name: string; reason: string }[];
}

function buildCsvTemplate(): string {
  const headers = [
    "nome",
    "cpf",
    "rg",
    "data_nascimento",
    "tipo_sanguineo",
    "turma",
    "serie",
    "telefone",
    "responsavel",
    "responsavel_telefone",
    "escola",
  ];
  const example = [
    "João da Silva",
    "12345678901",
    "MG-12.345.678",
    "15/03/2010",
    "O+",
    "A",
    "5º Ano",
    "(31) 98888-7777",
    "Maria da Silva",
    "(31) 98888-7777",
    "Escola Modelo",
  ];
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return [headers, example].map((r) => r.map(esc).join(",")).join("\n");
}

function ImportStudentsDialog({
  open,
  onClose,
  schools,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  schools: School[];
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [schoolId, setSchoolId] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state whenever the dialog is opened
  useEffect(() => {
    if (open) {
      setFile(null);
      setSchoolId(schools[0]?.id ?? "");
      setResult(null);
      setImporting(false);
      setDragOver(false);
    }
  }, [open, schools]);

  const handleDownloadTemplate = () => {
    const csv = buildCsvTemplate();
    // Prepend BOM so Excel reads UTF-8 correctly
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo-importacao-alunos.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFileSelected = (f: File | null) => {
    if (!f) return;
    const name = f.name.toLowerCase();
    const ok =
      name.endsWith(".csv") ||
      name.endsWith(".xlsx") ||
      name.endsWith(".xls");
    if (!ok) {
      toast.error("Formato não suportado. Envie um arquivo .csv ou .xlsx.");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast.error("O arquivo excede o tamanho máximo de 5 MB.");
      return;
    }
    setFile(f);
    setResult(null);
  };

  const handleImport = async () => {
    if (!file) {
      toast.error("Selecione um arquivo para importar.");
      return;
    }
    if (!schoolId) {
      toast.error("Selecione uma escola padrão (ou inclua a coluna 'escola' no arquivo).");
      return;
    }
    setImporting(true);
    try {
      const data = await api.upload<{ result: ImportResult }>(
        "/students/import",
        file,
        { school_id: schoolId }
      );
      setResult(data.result);
      if (data.result.created > 0) {
        toast.success(`${data.result.created} aluno(s) importado(s) com sucesso!`);
        onImported();
      } else {
        toast.info("Nenhum aluno novo foi importado.");
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Erro ao importar alunos.";
      toast.error(msg);
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    if (importing) return;
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} maxWidth="max-w-2xl">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Importar alunos</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Planilha CSV ou Excel · até 1.000 linhas
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleClose}
          disabled={importing}
        >
          <XCircle className="h-4 w-4" />
        </Button>
      </div>

      <div className="px-5 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
        {result ? (
          // ── Results view ──
          <div className="space-y-4">
            {/* Summary line */}
            <div className="flex items-center gap-3">
              {result.created > 0 && result.errors.length - result.skipped === 0 ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-500 dark:text-amber-400 shrink-0" />
              )}
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-2xl font-semibold tabular-nums">
                  {result.created}
                </span>
                <span className="text-sm text-muted-foreground">
                  de {result.total} alunos importados
                </span>
                {result.skipped > 0 && (
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    · {result.skipped} ignorado(s)
                  </span>
                )}
                {result.errors.length - result.skipped > 0 && (
                  <span className="text-xs text-red-600 dark:text-red-400">
                    · {result.errors.length - result.skipped} com erro
                  </span>
                )}
              </div>
            </div>

            {result.errors.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Linhas não importadas
                </p>
                <div className="rounded-md border max-h-72 overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background">
                      <TableRow>
                        <TableHead className="w-14 text-xs">Linha</TableHead>
                        <TableHead className="text-xs">Aluno</TableHead>
                        <TableHead className="text-xs">Motivo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.errors.map((e, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {e.row || "—"}
                          </TableCell>
                          <TableCell className="text-sm">{e.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {e.reason}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setResult(null);
                  setFile(null);
                }}
              >
                Importar outro
              </Button>
              <Button type="button" onClick={handleClose}>
                Concluir
              </Button>
            </div>
          </div>
        ) : (
          // ── Upload form ──
          <>
            {/* School */}
            <div className="space-y-1.5">
              <Label htmlFor="import-school" className="text-sm">
                Escola
              </Label>
              <select
                id="import-school"
                value={schoolId}
                onChange={(e) => setSchoolId(e.target.value)}
                className={nativeSelectClass}
              >
                <option value="">— Selecione —</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Aplicada a alunos sem a coluna “escola” no arquivo.
              </p>
            </div>

            {/* File dropzone */}
            <div className="space-y-1.5">
              <Label className="text-sm">Arquivo</Label>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFileSelected(f);
                }}
                onClick={() => inputRef.current?.click()}
                className={`group cursor-pointer rounded-md border border-dashed px-4 py-5 transition-colors ${
                  dragOver
                    ? "border-primary bg-primary/5"
                    : file
                    ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20"
                    : "border-input hover:border-foreground/30 hover:bg-muted/40"
                }`}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelected(f);
                    e.target.value = "";
                  }}
                />
                {file ? (
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / 1024).toFixed(1)} KB · clique para substituir
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Upload className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm">
                        <span className="font-medium text-foreground">Clique para selecionar</span>
                        <span className="text-muted-foreground"> ou arraste o arquivo</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        .csv ou .xlsx · máx 5 MB
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Colunas: nome <span className="text-red-500">*</span> · cpf · rg · data_nascimento · turma · serie · escola …
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownloadTemplate();
                  }}
                  className="text-xs font-medium text-primary hover:underline shrink-0 ml-2"
                >
                  Baixar modelo
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={importing}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleImport}
                disabled={!file || importing || !schoolId}
              >
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importando…
                  </>
                ) : (
                  <>Importar</>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// ─── Students List ───────────────────────────────────────────────────────────

function StudentsList({
  onNavigate,
}: {
  onNavigate: (view: "list" | "profile", studentId?: string) => void;
}) {
  const user = useAuthStore((s) => s.user);
  const canCreate = user?.role === "Admin";

  const [students, setStudents] = useState<Student[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState("all");
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [eventsDialogOpen, setEventsDialogOpen] = useState(false);
  const [eventsStudent, setEventsStudent] = useState<Student | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const fetchStudents = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("page", String(pagination.page));
      params.set("limit", String(pagination.limit));
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter && statusFilter !== "all")
        params.set("status", statusFilter);
      if (schoolFilter && schoolFilter !== "all")
        params.set("school_id", schoolFilter);
      if (gradeFilter && gradeFilter !== "all")
        params.set("grade", gradeFilter);
      if (classFilter && classFilter !== "all")
        params.set("class", classFilter);

      const data = await api.get<{
        students: Student[];
        pagination: Pagination;
      }>(`/students?${params.toString()}`);
      setStudents(data.students);
      setPagination(data.pagination);
    } catch {
      toast.error("Erro ao carregar alunos");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, debouncedSearch, statusFilter, schoolFilter, gradeFilter, classFilter]);

  const fetchSchools = useCallback(async () => {
    try {
      const data = await api.get<{ schools: (School & { student_count?: number })[] }>("/schools");
      setSchools(data.schools);
    } catch {
      // Silent fail for schools dropdown
    }
  }, []);

  useEffect(() => {
    fetchSchools();
  }, [fetchSchools]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const handlePageChange = (newPage: number) => {
    setPagination((prev) => ({ ...prev, page: newPage }));
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleFilterChange = (
    setter: (v: string) => void,
    value: string
  ) => {
    setter(value);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleOpenCreate = () => {
    setEditingStudent(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (student: Student, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingStudent(student);
    setDialogOpen(true);
  };

  const handleOpenEvents = (student: Student, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEventsStudent(student);
    setEventsDialogOpen(true);
  };

  const handleRowClick = (student: Student) => {
    onNavigate("profile", student.id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Alunos</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie os alunos cadastrados no sistema
          </p>
        </div>
        {canCreate && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setImportDialogOpen(true)}
            >
              <FileUp className="h-4 w-4 mr-2" />
              Importar
            </Button>
            <Button type="button" onClick={handleOpenCreate} className="bg-[#2480dc] hover:bg-[#1f6db8] active:bg-[#1a5fa3] text-white">
              <Plus className="h-4 w-4 mr-2" />
              Novo Aluno
            </Button>
          </div>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative sm:col-span-2 lg:col-span-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, CPF ou RG..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => handleFilterChange(setStatusFilter, e.target.value)}
              className={nativeSelectClass}
            >
              <option value="all">Todos os Status</option>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>

            <select
              value={schoolFilter}
              onChange={(e) => handleFilterChange(setSchoolFilter, e.target.value)}
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
              value={gradeFilter}
              onChange={(e) => handleFilterChange(setGradeFilter, e.target.value)}
              className={nativeSelectClass}
            >
              <option value="all">Todas as Séries</option>
              {gradeOptions.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>

            <select
              value={classFilter}
              onChange={(e) => handleFilterChange(setClassFilter, e.target.value)}
              className={nativeSelectClass}
            >
              <option value="all">Todas as Turmas</option>
              {classOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Desktop Table */}
      <div className="hidden md:block">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Foto</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead>Escola</TableHead>
                  <TableHead>Série/Turma</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Skeleton className="h-9 w-9 rounded-full" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-40" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-28" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-32" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-14" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-8 w-8" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : students.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center py-8 text-muted-foreground"
                    >
                      Nenhum aluno encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  students.map((student) => (
                    <TableRow
                      key={student.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleRowClick(student)}
                    >
                      <TableCell>
                        <Avatar className="h-9 w-9">
                          <AvatarImage
                            src={student.photo || undefined}
                            alt={student.full_name}
                          />
                          <AvatarFallback className="text-xs">
                            {getInitials(student.full_name)}
                          </AvatarFallback>
                        </Avatar>
                      </TableCell>
                      <TableCell className="font-medium">
                        {student.full_name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {student.cpf || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {student.school?.name || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {student.grade || "—"}
                        {student.class ? ` / Turma ${student.class}` : ""}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            student.status === "active"
                              ? "default"
                              : "destructive"
                          }
                          className={
                            student.status === "active"
                              ? "bg-emerald-500 hover:bg-emerald-600"
                              : ""
                          }
                        >
                          {student.status === "active" ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => handleOpenEvents(student, e)}
                            title="Ver Eventos"
                          >
                            <CalendarDays className="h-4 w-4" />
                          </Button>
                          {user?.role === "Admin" && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) =>
                                handleOpenEdit(student, e)
                              }
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : students.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              Nenhum aluno encontrado
            </CardContent>
          </Card>
        ) : (
          students.map((student) => (
            <Card
              key={student.id}
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => handleRowClick(student)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarImage
                      src={student.photo || undefined}
                      alt={student.full_name}
                    />
                    <AvatarFallback>
                      {getInitials(student.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {student.full_name}
                    </p>
                    <p className="text-sm text-muted-foreground truncate">
                      {student.school?.name || "—"} •{" "}
                      {student.grade || "—"}
                      {student.class
                        ? ` / Turma ${student.class}`
                        : ""}
                    </p>
                  </div>
                  <Badge
                    variant={
                      student.status === "active"
                        ? "default"
                        : "destructive"
                    }
                    className={
                      student.status === "active"
                        ? "bg-emerald-500 hover:bg-emerald-600"
                        : ""
                    }
                  >
                    {student.status === "active" ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
                <div className="flex justify-end mt-2 gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(e) => handleOpenEvents(student, e)}
                  >
                    <CalendarDays className="h-3.5 w-3.5 mr-1" />
                    Eventos
                  </Button>
                  {user?.role === "Admin" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleOpenEdit(student, e)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      Editar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Pagination */}
      {!loading && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Mostrando {(pagination.page - 1) * pagination.limit + 1} a{" "}
            {Math.min(pagination.page * pagination.limit, pagination.total)}{" "}
            de {pagination.total} alunos
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => handlePageChange(pagination.page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium">
              {pagination.page} / {pagination.totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => handlePageChange(pagination.page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Student Form Dialog */}
      <StudentFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        student={editingStudent}
        schools={schools}
        onSuccess={fetchStudents}
      />

      {/* Student Events Dialog */}
      <StudentEventsDialog
        open={eventsDialogOpen}
        onOpenChange={setEventsDialogOpen}
        student={eventsStudent}
      />

      {/* Bulk Import Dialog */}
      <ImportStudentsDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        schools={schools}
        onImported={fetchStudents}
      />
    </div>
  );
}

// ─── Main StudentsPage Component ─────────────────────────────────────────────

export function StudentsPage() {
  const [view, setView] = useState<"list" | "profile">("list");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    null
  );
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<
    AttendanceRecord[]
  >([]);
  const [loadingStudent, setLoadingStudent] = useState(false);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [schools, setSchools] = useState<School[]>([]);

  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "Admin";
  const canEdit = user?.role === "Admin";

  const handleNavigate = async (
    newView: "list" | "profile",
    studentId?: string
  ) => {
    if (newView === "profile" && studentId) {
      setSelectedStudentId(studentId);
      setView("profile");
      await fetchStudentDetails(studentId);
      await fetchAttendanceHistory(studentId);
    } else {
      setView("list");
      setSelectedStudentId(null);
      setSelectedStudent(null);
      setAttendanceRecords([]);
    }
  };

  const fetchStudentDetails = async (id: string) => {
    setLoadingStudent(true);
    try {
      const data = await api.get<{ student: Student }>(`/students/${id}`);
      setSelectedStudent(data.student);
    } catch {
      toast.error("Erro ao carregar dados do aluno");
      setView("list");
    } finally {
      setLoadingStudent(false);
    }
  };

  const fetchAttendanceHistory = async (id: string) => {
    setLoadingAttendance(true);
    try {
      const data = await api.get<{ records: AttendanceRecord[] }>(
        `/attendance?student_id=${id}`
      );
      setAttendanceRecords(data.records || []);
    } catch {
      setAttendanceRecords([]);
    } finally {
      setLoadingAttendance(false);
    }
  };

  const fetchSchools = useCallback(async () => {
    try {
      const data = await api.get<{ schools: (School & { student_count?: number })[] }>("/schools");
      setSchools(data.schools);
    } catch {
      // Silent
    }
  }, []);

  useEffect(() => {
    if (editDialogOpen || view === "profile") fetchSchools();
  }, [editDialogOpen, view, fetchSchools]);

  const handleDelete = async () => {
    if (!selectedStudentId) return;
    try {
      setDeleteLoading(true);
      await api.delete(`/students/${selectedStudentId}`);
      toast.success("Aluno excluído com sucesso!");
      setDeleteDialogOpen(false);
      setView("list");
      setSelectedStudentId(null);
      setSelectedStudent(null);
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error("Erro ao excluir aluno");
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleEditSuccess = async () => {
    if (selectedStudentId) {
      await fetchStudentDetails(selectedStudentId);
    }
    setEditDialogOpen(false);
  };

  // Loading state for profile view
  if (view === "profile" && loadingStudent) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-24" />
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <Skeleton className="h-28 w-28 rounded-full" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-40" />
              </div>
            </div>
          </CardContent>
        </Card>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (view === "profile" && selectedStudent) {
    return (
      <>
        <StudentProfile
          student={selectedStudent}
          attendanceRecords={attendanceRecords}
          onBack={() => handleNavigate("list")}
          onEdit={() => setEditDialogOpen(true)}
          onDelete={() => setDeleteDialogOpen(true)}
          loadingAttendance={loadingAttendance}
          schools={schools}
          onStudentUpdated={() => {
            if (selectedStudentId) fetchStudentDetails(selectedStudentId);
          }}
        />

        {/* Edit Dialog */}
        <StudentFormDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          student={selectedStudent}
          schools={schools}
          onSuccess={handleEditSuccess}
        />

        {/* Delete Confirmation */}
        <Modal
          open={deleteDialogOpen}
          onClose={() => setDeleteDialogOpen(false)}
          maxWidth="max-w-md"
        >
          <div className="px-6 pt-6 pb-2">
            <h2 className="text-lg font-semibold">Confirmar Exclusão</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Tem certeza que deseja excluir o aluno{" "}
              <strong>{selectedStudent.full_name}</strong>? Esta ação não pode
              ser desfeita.
            </p>
          </div>
          <div className="flex justify-end gap-3 px-6 py-4 border-t">
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
      </>
    );
  }

  return <StudentsList onNavigate={handleNavigate} />;
}
