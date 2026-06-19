"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { useAuthStore } from "@/lib/auth-store";
import { api, ApiError } from "@/lib/api";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
  School,
  Plus,
  Search,
  MapPin,
  Phone,
  Mail,
  Clock,
  User,
  GraduationCap,
  ArrowLeft,
  Pencil,
  Trash2,
  Upload,
  X,
  Building2,
  ImagePlus,
  Loader2,
} from "lucide-react";

// ── Custom Modal (replaces Radix Dialog) ────────────────────────────────────

function Modal({ open, onClose, children }: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
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
        className="relative z-10 w-full max-w-2xl mx-4 bg-background rounded-lg border shadow-lg animate-in fade-in-0 zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// ── Types ──────────────────────────────────────────────────────────────────

interface SchoolData {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  director_name: string | null;
  opening_hours: string | null;
  school_photo: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
  student_count?: number;
}

interface StudentData {
  id: string;
  full_name: string;
  status: string;
  grade: string | null;
  class: string | null;
  photo: string | null;
}

interface SchoolDetailData extends Omit<SchoolData, "student_count"> {
  students: StudentData[];
}

interface FormData {
  name: string;
  address: string;
  phone: string;
  email: string;
  director_name: string;
  opening_hours: string;
  school_photo: string;
  latitude: string;
  longitude: string;
}

const emptyForm: FormData = {
  name: "",
  address: "",
  phone: "",
  email: "",
  director_name: "",
  opening_hours: "",
  school_photo: "",
  latitude: "",
  longitude: "",
};

// ── Main Component ─────────────────────────────────────────────────────────

export function SchoolsPage() {
  const user = useAuthStore((s) => s.user);
  const role = user?.role || "Viewer";
  const isAdmin = role === "Admin";
  // Only admins can create/edit schools. Operators have read-only access
  // to the schools they are assigned to (filtering happens server-side).
  const canEdit = isAdmin;

  // View state
  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);

  // List state
  const [schools, setSchools] = useState<SchoolData[]>([]);
  const [schoolsLoading, setSchoolsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Detail state
  const [schoolDetail, setSchoolDetail] = useState<SchoolDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState<SchoolData | null>(null);
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingSchool, setDeletingSchool] = useState<SchoolData | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ── Data Fetching ──────────────────────────────────────────────────────

  const fetchSchools = useCallback(async () => {
    try {
      setSchoolsLoading(true);
      const data = await api.get<{ schools: SchoolData[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>("/schools?limit=100");
      setSchools(data.schools);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        toast.error("Erro ao carregar escolas");
      }
    } finally {
      setSchoolsLoading(false);
    }
  }, []);

  const fetchSchoolDetail = useCallback(async (id: string) => {
    try {
      setDetailLoading(true);
      const data = await api.get<{ school: SchoolDetailData }>(`/schools/${id}`);
      setSchoolDetail(data.school);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        toast.error("Erro ao carregar detalhes da escola");
      }
      setView("list");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchools();
  }, [fetchSchools]);

  useEffect(() => {
    if (view === "detail" && selectedSchoolId) {
      fetchSchoolDetail(selectedSchoolId);
    }
  }, [view, selectedSchoolId, fetchSchoolDetail]);

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleViewDetail = (school: SchoolData) => {
    setSelectedSchoolId(school.id);
    setView("detail");
  };

  const handleBackToList = () => {
    setView("list");
    setSelectedSchoolId(null);
    setSchoolDetail(null);
    fetchSchools();
  };

  const handleOpenCreate = () => {
    setEditingSchool(null);
    setFormData(emptyForm);
    setDialogOpen(true);
  };

  const handleOpenEdit = (school: SchoolData | SchoolDetailData) => {
    setEditingSchool(school as SchoolData);
    setFormData({
      name: school.name,
      address: school.address || "",
      phone: school.phone || "",
      email: school.email || "",
      director_name: school.director_name || "",
      opening_hours: school.opening_hours || "",
      school_photo: school.school_photo || "",
      latitude: school.latitude != null ? String(school.latitude) : "",
      longitude: school.longitude != null ? String(school.longitude) : "",
    });
    setDialogOpen(true);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/jpg"].includes(file.type)) {
      toast.error("Tipo de arquivo não permitido. Use JPG ou PNG.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Tamanho máximo: 5MB.");
      return;
    }

    try {
      setUploading(true);
      const token = useAuthStore.getState().token;
      const formDataObj = new FormData();
      formDataObj.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formDataObj,
      });

      if (!res.ok) {
        throw new Error("Upload falhou");
      }

      const data = await res.json();
      setFormData((prev) => ({ ...prev, school_photo: data.url }));
      toast.success("Foto enviada com sucesso!");
    } catch {
      toast.error("Erro ao enviar foto");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleSubmitForm = async () => {
    if (!formData.name.trim()) {
      toast.error("Nome da escola é obrigatório");
      return;
    }

    try {
      setFormSubmitting(true);

      const payload: Record<string, unknown> = {
        name: formData.name.trim(),
        address: formData.address.trim() || null,
        phone: formData.phone.trim() || null,
        email: formData.email.trim() || null,
        director_name: formData.director_name.trim() || null,
        opening_hours: formData.opening_hours.trim() || null,
        school_photo: formData.school_photo.trim() || null,
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
      };

      if (editingSchool) {
        await api.put(`/schools/${editingSchool.id}`, payload);
        toast.success("Escola atualizada com sucesso!");
      } else {
        await api.post("/schools", payload);
        toast.success("Escola criada com sucesso!");
      }

      setDialogOpen(false);
      setEditingSchool(null);
      setFormData(emptyForm);

      if (view === "detail" && selectedSchoolId) {
        fetchSchoolDetail(selectedSchoolId);
      }
      fetchSchools();
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message || "Erro ao salvar escola");
      } else {
        toast.error("Erro ao salvar escola");
      }
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingSchool) return;

    try {
      setDeleteLoading(true);
      await api.delete(`/schools/${deletingSchool.id}`);
      toast.success("Escola excluída com sucesso!");
      setDeleteDialogOpen(false);
      setDeletingSchool(null);
      handleBackToList();
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message || "Erro ao excluir escola");
      } else {
        toast.error("Erro ao excluir escola");
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── Filtering ──────────────────────────────────────────────────────────

  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const filteredSchools = schools.filter((s) =>
    s.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
  );

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {view === "detail" && selectedSchoolId ? (
        <SchoolDetailView
          school={schoolDetail}
          loading={detailLoading}
          onBack={handleBackToList}
          onEdit={canEdit ? handleOpenEdit : undefined}
          onDelete={isAdmin ? (s) => { setDeletingSchool(s as SchoolData); setDeleteDialogOpen(true); } : undefined}
        />
      ) : (
        <>
          {/* Header — clean, no oversized title */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                Escolas
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {filteredSchools.length}{" "}
                {filteredSchools.length === 1
                  ? "escola cadastrada"
                  : "escolas cadastradas"}
              </p>
            </div>
            {canEdit && (
              <Button
                type="button"
                onClick={handleOpenCreate}
                className="shrink-0 h-9"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Nova escola
              </Button>
            )}
          </div>

          {/* Search + count row */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
              <Input
                placeholder="Buscar escola..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          </div>

          {/* Loading skeleton */}
          {schoolsLoading ? (
            <Card className="border-border/70">
              <CardContent className="p-0">
                <div className="divide-y divide-border/60">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 p-4">
                      <Skeleton className="h-10 w-10 rounded-md shrink-0" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-1/3" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                      <Skeleton className="h-6 w-12 rounded-full" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : filteredSchools.length === 0 ? (
            <Card className="border-border/70">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Building2 className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-foreground">
                  {searchQuery
                    ? "Nenhuma escola encontrada"
                    : "Nenhuma escola cadastrada"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {searchQuery
                    ? "Tente outro termo de busca"
                    : "Comece cadastrando a primeira escola"}
                </p>
                {canEdit && !searchQuery && (
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4 h-9"
                    onClick={handleOpenCreate}
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    Cadastrar escola
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Mobile: Cards */}
              <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
                {filteredSchools.map((school) => (
                  <Card
                    key={school.id}
                    className="cursor-pointer hover:border-border transition-colors"
                    onClick={() => handleViewDetail(school)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-medium text-foreground line-clamp-1">
                          {school.name}
                        </h3>
                        <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground shrink-0">
                          <GraduationCap className="h-3 w-3" />
                          {school.student_count ?? 0}
                        </span>
                      </div>
                      <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                        {school.address && (
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="line-clamp-1">{school.address}</span>
                          </div>
                        )}
                        {school.phone && (
                          <div className="flex items-center gap-1.5">
                            <Phone className="h-3 w-3 shrink-0" />
                            <span>{school.phone}</span>
                          </div>
                        )}
                        {school.director_name && (
                          <div className="flex items-center gap-1.5">
                            <User className="h-3 w-3 shrink-0" />
                            <span>{school.director_name}</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Desktop: Table */}
              <div className="hidden lg:block">
                <Card className="border-border/70">
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                            Escola
                          </TableHead>
                          <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                            Endereço
                          </TableHead>
                          <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                            Contato
                          </TableHead>
                          <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                            Diretor(a)
                          </TableHead>
                          <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                            Alunos
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredSchools.map((school) => (
                          <TableRow
                            key={school.id}
                            className="cursor-pointer"
                            onClick={() => handleViewDetail(school)}
                          >
                            <TableCell className="font-medium text-foreground">
                              {school.name}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {school.address || (
                                <span className="text-muted-foreground/50">
                                  Não informado
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {school.phone || (
                                <span className="text-muted-foreground/50">
                                  —
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {school.director_name || (
                                <span className="text-muted-foreground/50">
                                  —
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="tabular-nums font-medium text-foreground">
                                {school.student_count ?? 0}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </>
          )}        </>
      )}

      {/* Create / Edit Dialog (shared by both views) */}
      <SchoolFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        editingSchool={editingSchool}
        formData={formData}
        onFormDataChange={setFormData}
        onSubmit={handleSubmitForm}
        submitting={formSubmitting}
        uploading={uploading}
        onPhotoUpload={handlePhotoUpload}
        fileInputRef={fileInputRef}
      />

      {/* Delete Confirmation (shared by both views) */}
      <Modal open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <div className="p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Confirmar exclusão</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Tem certeza que deseja excluir a escola{" "}
              <strong>{deletingSchool?.name}</strong>? Todos os alunos e registros de frequência vinculados também serão excluídos. Esta ação não pode ser desfeita.
            </p>
          </div>
          <div className="flex justify-end gap-2">
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
        </div>
      </Modal>
    </div>
  );
}

// ── School Detail View ──────────────────────────────────────────────────────

function SchoolDetailView({
  school,
  loading,
  onBack,
  onEdit,
  onDelete,
}: {
  school: SchoolDetailData | null;
  loading: boolean;
  onBack: () => void;
  onEdit?: (school: SchoolDetailData) => void;
  onDelete?: (school: SchoolDetailData) => void;
}) {
  if (loading || !school) {
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
              {Array.from({ length: 5 }).map((_, i) => (
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

  const hasCoordinates =
    school.latitude != null &&
    school.longitude != null &&
    school.latitude !== 0 &&
    school.longitude !== 0;

  const students = school.students || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button type="button" variant="outline" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Voltar</span>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {school.name}
            </h1>
            {school.address && (
              <p className="text-muted-foreground mt-0.5 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {school.address}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onEdit && (
            <Button type="button" variant="outline" onClick={() => onEdit(school)}>
              <Pencil className="mr-2 h-4 w-4" />
              Editar
            </Button>
          )}
          {onDelete && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => onDelete(school)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir
            </Button>
          )}
        </div>
      </div>

      {/* Info + Map */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* School Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informações da Escola</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Photo */}
            {school.school_photo && (
              <div className="mb-4">
                <img
                  src={school.school_photo}
                  alt={`Foto da escola ${school.name}`}
                  className="h-40 w-full rounded-lg object-cover"
                />
              </div>
            )}

            <div className="space-y-3">
              {school.director_name && (
                <div className="flex items-start gap-3">
                  <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Diretor(a)</p>
                    <p className="text-sm font-medium">{school.director_name}</p>
                  </div>
                </div>
              )}

              {school.phone && (
                <div className="flex items-start gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Telefone</p>
                    <p className="text-sm font-medium">{school.phone}</p>
                  </div>
                </div>
              )}

              {school.email && (
                <div className="flex items-start gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">E-mail</p>
                    <p className="text-sm font-medium">{school.email}</p>
                  </div>
                </div>
              )}

              {school.opening_hours && (
                <div className="flex items-start gap-3">
                  <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Horário de funcionamento</p>
                    <p className="text-sm font-medium">{school.opening_hours}</p>
                  </div>
                </div>
              )}

              {school.address && (
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Endereço</p>
                    <p className="text-sm font-medium">{school.address}</p>
                  </div>
                </div>
              )}

              {hasCoordinates && (
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Coordenadas</p>
                    <p className="text-sm font-medium">
                      {school.latitude}, {school.longitude}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Map Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Localização</CardTitle>
          </CardHeader>
          <CardContent>
            {hasCoordinates ? (
              <iframe
                title={`Mapa de ${school.name}`}
                width="100%"
                height="300"
                className="rounded-lg border"
                style={{ border: 0 }}
                loading="lazy"
                allowFullScreen
                referrerPolicy="no-referrer-when-downgrade"
                sandbox="allow-scripts allow-same-origin"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${school.longitude! - 0.01}%2C${school.latitude! - 0.01}%2C${school.longitude! + 0.01}%2C${school.latitude! + 0.01}&layer=mapnik&marker=${school.latitude}%2C${school.longitude}`}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-[300px] rounded-lg border-2 border-dashed border-muted-foreground/25">
                <MapPin className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  Coordenadas não informadas
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Edite a escola para adicionar latitude e longitude
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Students List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              Alunos da Escola
              <Badge variant="secondary" className="ml-1">
                {students.length}
              </Badge>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {students.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <GraduationCap className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                Nenhum aluno cadastrado nesta escola
              </p>
            </div>
          ) : (
            <>
              {/* Mobile: Cards */}
              <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
                {students.map((student) => (
                  <div
                    key={student.id}
                    className="flex items-center gap-3 rounded-lg border p-3"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <GraduationCap className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {student.full_name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {student.grade && (
                          <span className="text-xs text-muted-foreground">
                            {student.grade}
                          </span>
                        )}
                        {student.class && (
                          <span className="text-xs text-muted-foreground">
                            Turma {student.class}
                          </span>
                        )}
                        <Badge
                          variant={
                            student.status === "active"
                              ? "default"
                              : "secondary"
                          }
                          className="text-[10px] px-1.5 py-0"
                        >
                          {student.status === "active" ? "Ativo" : "Inativo"}
                        </Badge>
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
                      <TableHead>Nome</TableHead>
                      <TableHead>Série</TableHead>
                      <TableHead>Turma</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {students.map((student) => (
                      <TableRow key={student.id}>
                        <TableCell className="font-medium">
                          {student.full_name}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {student.grade || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {student.class || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              student.status === "active"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {student.status === "active" ? "Ativo" : "Inativo"}
                          </Badge>
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

// ── School Form Dialog (using custom Modal) ────────────────────────────────

function SchoolFormDialog({
  open,
  onClose,
  editingSchool,
  formData,
  onFormDataChange,
  onSubmit,
  submitting,
  uploading,
  onPhotoUpload,
  fileInputRef,
}: {
  open: boolean;
  onClose: () => void;
  editingSchool: SchoolData | null;
  formData: FormData;
  onFormDataChange: (data: FormData) => void;
  onSubmit: () => void;
  submitting: boolean;
  uploading: boolean;
  onPhotoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const updateField = (field: keyof FormData, value: string) => {
    onFormDataChange({ ...formData, [field]: value });
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="mb-4">
          <h2 className="text-lg font-semibold">
            {editingSchool ? "Editar Escola" : "Nova Escola"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {editingSchool
              ? "Atualize as informações da escola abaixo."
              : "Preencha os dados para cadastrar uma nova escola."}
          </p>
        </div>

        <div className="grid gap-6 py-4">
          {/* Photo Upload */}
          <div className="space-y-3">
            <Label>Foto da Escola</Label>
            <div className="flex items-center gap-4">
              {formData.school_photo ? (
                <div className="relative group">
                  <img
                    src={formData.school_photo}
                    alt="Preview"
                    className="h-20 w-20 rounded-lg object-cover border"
                  />
                  <button
                    type="button"
                    onClick={() => updateField("school_photo", "")}
                    className="absolute -top-2 -right-2 rounded-full bg-destructive text-white p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25">
                  <ImagePlus className="h-6 w-6 text-muted-foreground/50" />
                </div>
              )}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/jpg"
                  className="hidden"
                  onChange={onPhotoUpload}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  {uploading ? "Enviando..." : "Enviar foto"}
                </Button>
                <p className="text-xs text-muted-foreground mt-1">
                  JPG ou PNG, máximo 5MB
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Name */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="school-name">
                Nome da Escola <span className="text-destructive">*</span>
              </Label>
              <Input
                id="school-name"
                placeholder="Ex: Escola Municipal São Paulo"
                value={formData.name}
                onChange={(e) => updateField("name", e.target.value)}
              />
            </div>

            {/* Address */}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="school-address">Endereço</Label>
              <Input
                id="school-address"
                placeholder="Ex: Rua das Flores, 123 - Centro"
                value={formData.address}
                onChange={(e) => updateField("address", e.target.value)}
              />
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <Label htmlFor="school-phone">Telefone</Label>
              <Input
                id="school-phone"
                placeholder="Ex: (11) 1234-5678"
                value={formData.phone}
                onChange={(e) => updateField("phone", e.target.value)}
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="school-email">E-mail</Label>
              <Input
                id="school-email"
                type="email"
                placeholder="Ex: contato@escola.com"
                value={formData.email}
                onChange={(e) => updateField("email", e.target.value)}
              />
            </div>

            {/* Director */}
            <div className="space-y-2">
              <Label htmlFor="school-director">Diretor(a)</Label>
              <Input
                id="school-director"
                placeholder="Nome do(a) diretor(a)"
                value={formData.director_name}
                onChange={(e) => updateField("director_name", e.target.value)}
              />
            </div>

            {/* Opening Hours */}
            <div className="space-y-2">
              <Label htmlFor="school-hours">Horário de Funcionamento</Label>
              <Input
                id="school-hours"
                placeholder="Ex: 7h às 17h"
                value={formData.opening_hours}
                onChange={(e) => updateField("opening_hours", e.target.value)}
              />
            </div>

            {/* Latitude */}
            <div className="space-y-2">
              <Label htmlFor="school-lat">Latitude</Label>
              <Input
                id="school-lat"
                type="number"
                step="any"
                placeholder="Ex: -23.5505"
                value={formData.latitude}
                onChange={(e) => updateField("latitude", e.target.value)}
              />
            </div>

            {/* Longitude */}
            <div className="space-y-2">
              <Label htmlFor="school-lng">Longitude</Label>
              <Input
                id="school-lng"
                type="number"
                step="any"
                placeholder="Ex: -46.6333"
                value={formData.longitude}
                onChange={(e) => updateField("longitude", e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={submitting || uploading}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : editingSchool ? (
              "Salvar Alterações"
            ) : (
              "Criar Escola"
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
