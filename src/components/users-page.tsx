"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  Search,
  Loader2,
  ShieldAlert,
  X,
  KeyRound,
  RotateCcw,
  School as SchoolIcon,
  Upload,
  Camera,
  User,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

// ─── Types ────────────────────────────────────────────────────────────
interface User {
  id: string;
  full_name: string;
  email: string;
  role: "Admin" | "Operator" | "Viewer";
  status: "active" | "inactive";
  profile_photo: string | null;
  must_change_password: boolean;
  last_login: string | null;
  created_at: string;
  school_ids?: string[];
}

interface SchoolOption {
  id: string;
  name: string;
}

interface UsersResponse {
  users: User[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

interface UserResponse {
  user: User;
}

interface UserFormData {
  full_name: string;
  email: string;
  password: string;
  role: "Admin" | "Operator" | "Viewer";
  status: "active" | "inactive";
  profile_photo: string;
  school_ids: string[];
}

const emptyForm: UserFormData = {
  full_name: "",
  email: "",
  password: "",
  role: "Viewer",
  status: "active",
  profile_photo: "",
  school_ids: [],
};

// ─── Constants ────────────────────────────────────────────────────────
const roleBadgeClass: Record<string, string> = {
  Admin: "bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300 border-purple-200 dark:border-purple-800",
  Operator: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  Viewer: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700",
};

const statusBadgeClass: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  inactive: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300 border-red-200 dark:border-red-800",
};

const roleLabels: Record<string, string> = {
  Admin: "Administrador",
  Operator: "Operador",
  Viewer: "Visualizador",
};

const statusLabels: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
};

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// ─── Custom Modal Component (NO Radix) ────────────────────────────────
function Modal({ open, onClose, children }: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Lock body scroll when modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Close on Escape key
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
      {/* Overlay - clicking closes the modal */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      {/* Content - clicks inside do NOT close the modal */}
      <div
        className="relative z-10 w-full max-w-md mx-4 bg-background rounded-lg border shadow-lg p-6 animate-in fade-in-0 zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Photo Upload Component ──────────────────────────────────────────
function UserPhotoUpload({
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
    if (!["image/jpeg", "image/png", "image/jpg", "image/webp"].includes(file.type)) {
      toast.error("Tipo de arquivo não permitido. Use JPG, PNG ou WebP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Tamanho máximo: 5MB.");
      return;
    }

    setUploading(true);
    try {
      const data = await api.upload<{ url: string; filename: string }>(
        "/upload",
        file
      );
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
        <AvatarImage src={photo || undefined} alt="Foto do usuário" />
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
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────
export function UsersPage() {
  const currentUser = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  // Modal states
  const [modalMode, setModalMode] = useState<"closed" | "create" | "edit" | "delete" | "reset-password">("closed");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<UserFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [resetSaving, setResetSaving] = useState(false);

  // Schools list for the multi-select (operator/viewer school access)
  const [schools, setSchools] = useState<SchoolOption[]>([]);

  const isAdmin = currentUser?.role === "Admin";

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get<UsersResponse>("/users?limit=100");
      setUsers(data.users);
    } catch {
      toast.error("Erro ao carregar usuários");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSchools = useCallback(async () => {
    try {
      const data = await api.get<{ schools: SchoolOption[] }>("/schools?limit=100");
      setSchools(data.schools || []);
    } catch {
      // Silent — the multi-select will just show an empty list
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchSchools();
  }, [fetchUsers, fetchSchools]);

  const filteredUsers = users.filter(
    (u) =>
      u.full_name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(debouncedSearch.toLowerCase())
  );

  // ─── Helpers ──────────────────────────────────────────────────────
  const updateField = (field: keyof UserFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const closeModal = () => {
    setModalMode("closed");
    setSelectedUser(null);
    setFormData(emptyForm);
    setResetPassword("");
  };

  // ─── Open Create ──────────────────────────────────────────────────
  const openCreate = () => {
    setFormData(emptyForm);
    setSelectedUser(null);
    setModalMode("create");
  };

  // ─── Open Edit ────────────────────────────────────────────────────
  const openEdit = (user: User) => {
    setSelectedUser(user);
    setFormData({
      full_name: user.full_name,
      email: user.email,
      password: "",
      role: user.role,
      status: user.status as "active" | "inactive",
      profile_photo: user.profile_photo || "",
      school_ids: user.school_ids ?? [],
    });
    setModalMode("edit");
  };

  // ─── Toggle a school in the form's school_ids ─────────────────────
  const toggleSchool = (schoolId: string) => {
    setFormData((prev) => {
      const has = prev.school_ids.includes(schoolId);
      return {
        ...prev,
        school_ids: has
          ? prev.school_ids.filter((id) => id !== schoolId)
          : [...prev.school_ids, schoolId],
      };
    });
  };

  // ─── Open Reset Password ──────────────────────────────────────
  const openResetPassword = (user: User) => {
    if (user.id === currentUser?.id) {
      toast.error("Use as configurações de perfil para alterar sua própria senha");
      return;
    }
    setSelectedUser(user);
    setResetPassword("");
    setModalMode("reset-password");
  };

  // ─── Handle Reset Password ────────────────────────────────────────
  const handleResetPassword = async () => {
    if (!selectedUser) return;
    if (!resetPassword) {
      toast.error("Digite a nova senha temporária");
      return;
    }
    try {
      setResetSaving(true);
      await api.post(`/users/${selectedUser.id}/reset-password`, { temporaryPassword: resetPassword });
      toast.success("Senha resetada! O usuário deverá trocar no próximo login.");
      closeModal();
      fetchUsers();
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error("Erro ao resetar senha");
      }
    } finally {
      setResetSaving(false);
    }
  };

  // ─── Open Delete ──────────────────────────────────────────────────
  const openDelete = (user: User) => {
    if (user.id === currentUser?.id) {
      toast.error("Você não pode excluir seu próprio usuário");
      return;
    }
    setSelectedUser(user);
    setModalMode("delete");
  };

  // ─── Handle Create ────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!formData.full_name || !formData.email || !formData.password) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    // Non-admin roles require at least one school
    if (formData.role !== "Admin" && formData.school_ids.length === 0) {
      toast.error("Selecione ao menos uma escola para este operador");
      return;
    }
    try {
      setSaving(true);
      await api.post<UserResponse>("/users", {
        ...formData,
        profile_photo: formData.profile_photo || null,
        // Admins don't need school assignments (they see all)
        school_ids: formData.role === "Admin" ? [] : formData.school_ids,
      });
      toast.success("Usuário criado com sucesso!");
      closeModal();
      fetchUsers();
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error("Erro ao criar usuário");
      }
    } finally {
      setSaving(false);
    }
  };

  // ─── Handle Edit ──────────────────────────────────────────────────
  const handleEdit = async () => {
    if (!selectedUser) {
      toast.error("Nenhum usuário selecionado");
      return;
    }
    if (!formData.full_name || !formData.email) {
      toast.error("Nome e e-mail são obrigatórios");
      return;
    }
    // Non-admin roles require at least one school
    if (formData.role !== "Admin" && formData.school_ids.length === 0) {
      toast.error("Selecione ao menos uma escola para este operador");
      return;
    }
    try {
      setSaving(true);
      const body: Record<string, unknown> = {
        full_name: formData.full_name,
        email: formData.email,
        role: formData.role,
        status: formData.status,
        profile_photo: formData.profile_photo || null,
        // Always sync school_ids (Admins get an empty list)
        school_ids: formData.role === "Admin" ? [] : formData.school_ids,
      };
      if (formData.password) {
        body.password = formData.password;
      }
      await api.put<UserResponse>(`/users/${selectedUser.id}`, body);
      toast.success("Usuário atualizado com sucesso!");
      closeModal();
      fetchUsers();
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error("Erro ao atualizar usuário");
      }
    } finally {
      setSaving(false);
    }
  };

  // ─── Handle Delete ────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!selectedUser) return;
    try {
      setSaving(true);
      await api.delete(`/users/${selectedUser.id}`);
      toast.success("Usuário excluído com sucesso!");
      closeModal();
      fetchUsers();
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error("Erro ao excluir usuário");
      }
    } finally {
      setSaving(false);
    }
  };

  // ─── Non-admin guard ──────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Usuários</h1>
          <p className="text-muted-foreground dark:text-gray-300 mt-1">
            Gerenciamento de usuários do sistema
          </p>
        </div>
        <div className="flex flex-col items-center justify-center h-64 rounded-xl border-2 border-dashed border-muted-foreground/25 gap-3">
          <ShieldAlert className="h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground dark:text-gray-400 text-sm">
            Acesso restrito a administradores
          </p>
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Usuários</h1>
          <p className="text-muted-foreground dark:text-gray-300 mt-1">
            Gerencie os usuários do sistema
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2"
        >
          <Plus className="h-4 w-4" />
          Novo Usuário
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground dark:text-gray-400" />
        <Input
          placeholder="Buscar por nome ou e-mail..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Lista de Usuários
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-0">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-3">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-8 w-16" />
                </div>
              ))}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground dark:text-gray-400">
              <Users className="h-10 w-10 mb-3" />
              <p className="text-sm">Nenhum usuário encontrado</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Foto</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead>Escolas</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Último Login</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={user.profile_photo || undefined} alt={user.full_name} />
                        <AvatarFallback className="text-xs font-semibold">
                          {getInitials(user.full_name)}
                        </AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="font-medium">{user.full_name}</TableCell>
                    <TableCell className="text-muted-foreground dark:text-gray-300">{user.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={roleBadgeClass[user.role]}>
                        {roleLabels[user.role]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.role === "Admin" ? (
                        <span className="text-xs text-muted-foreground">Todas</span>
                      ) : (
                        <Badge variant="outline" className="bg-cyan-50 text-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800 text-xs">
                          {(user.school_ids?.length ?? 0)} escola(s)
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusBadgeClass[user.status]}>
                        {statusLabels[user.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground dark:text-gray-300 text-sm">
                      {formatDate(user.last_login)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {user.must_change_password && (
                          <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-800 text-[10px] px-1.5 py-0">
                            Temporária
                          </Badge>
                        )}
                        <button
                          type="button"
                          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground h-8 w-8"
                          onClick={() => openEdit(user)}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground h-8 w-8"
                          onClick={() => openResetPassword(user)}
                          disabled={user.id === currentUser?.id}
                          title="Resetar senha"
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => openDelete(user)}
                          disabled={user.id === currentUser?.id}
                          title={user.id === currentUser?.id ? "Não é possível excluir" : "Excluir"}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ═══ CREATE MODAL ═══════════════════════════════════════════════ */}
      <Modal open={modalMode === "create"} onClose={closeModal}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Novo Usuário</h2>
            <p className="text-sm text-muted-foreground dark:text-gray-300">
              Preencha os dados para criar um novo usuário no sistema.
            </p>
          </div>
          <button type="button" onClick={closeModal} className="opacity-70 hover:opacity-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Photo upload */}
          <div className="flex justify-center">
            <UserPhotoUpload
              photo={formData.profile_photo}
              onPhotoChange={(url) => updateField("profile_photo", url)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-name">Nome Completo *</Label>
            <Input
              id="create-name"
              value={formData.full_name}
              onChange={(e) => updateField("full_name", e.target.value)}
              placeholder="Nome completo do usuário"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="create-email">E-mail *</Label>
            <Input
              id="create-email"
              type="email"
              value={formData.email}
              onChange={(e) => updateField("email", e.target.value)}
              placeholder="usuario@email.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="create-password">Senha *</Label>
            <Input
              id="create-password"
              type="password"
              value={formData.password}
              onChange={(e) => updateField("password", e.target.value)}
              placeholder="••••••••"
            />
            <p className="text-xs text-muted-foreground dark:text-gray-400">
              Mínimo 8 caracteres, 1 maiúscula, 1 número, 1 especial
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="create-role">Papel</Label>
              <select
                id="create-role"
                value={formData.role}
                onChange={(e) => updateField("role", e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="Admin">Administrador</option>
                <option value="Operator">Operador</option>
                <option value="Viewer">Visualizador</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-status">Status</Label>
              <select
                id="create-status"
                value={formData.status}
                onChange={(e) => updateField("status", e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </select>
            </div>
          </div>

          {formData.role !== "Admin" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <SchoolIcon className="h-3.5 w-3.5" />
                  Escolas com acesso *
                </Label>
                <span className="text-xs text-muted-foreground">
                  {formData.school_ids.length} selecionada(s)
                </span>
              </div>
              <p className="text-xs text-muted-foreground dark:text-gray-400">
                Selecione em quais escolas este operador poderá fazer frequência.
              </p>
              {schools.length === 0 ? (
                <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                  Nenhuma escola cadastrada.
                </div>
              ) : (
                <div className="rounded-md border max-h-44 overflow-y-auto">
                  {schools.map((school) => (
                    <label
                      key={school.id}
                      className="flex items-center gap-2.5 px-3 py-2 hover:bg-accent/50 cursor-pointer border-b last:border-b-0"
                    >
                      <Checkbox
                        checked={formData.school_ids.includes(school.id)}
                        onCheckedChange={() => toggleSchool(school.id)}
                      />
                      <span className="text-sm">{school.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={closeModal}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Criando...
              </>
            ) : (
              "Criar Usuário"
            )}
          </button>
        </div>
      </Modal>

      {/* ═══ EDIT MODAL ═════════════════════════════════════════════════ */}
      <Modal open={modalMode === "edit"} onClose={closeModal}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Editar Usuário</h2>
            <p className="text-sm text-muted-foreground dark:text-gray-300">
              Atualize os dados do usuário. Deixe a senha em branco para manter a atual.
            </p>
          </div>
          <button type="button" onClick={closeModal} className="opacity-70 hover:opacity-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Photo upload */}
          <div className="flex justify-center">
            <UserPhotoUpload
              photo={formData.profile_photo}
              onPhotoChange={(url) => updateField("profile_photo", url)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-name">Nome Completo *</Label>
            <Input
              id="edit-name"
              value={formData.full_name}
              onChange={(e) => updateField("full_name", e.target.value)}
              placeholder="Nome completo do usuário"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-email">E-mail *</Label>
            <Input
              id="edit-email"
              type="email"
              value={formData.email}
              onChange={(e) => updateField("email", e.target.value)}
              placeholder="usuario@email.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-password">Senha (opcional)</Label>
            <Input
              id="edit-password"
              type="password"
              value={formData.password}
              onChange={(e) => updateField("password", e.target.value)}
              placeholder="Deixe em branco para manter a atual"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-role">Papel</Label>
              <select
                id="edit-role"
                value={formData.role}
                onChange={(e) => updateField("role", e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="Admin">Administrador</option>
                <option value="Operator">Operador</option>
                <option value="Viewer">Visualizador</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-status">Status</Label>
              <select
                id="edit-status"
                value={formData.status}
                onChange={(e) => updateField("status", e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </select>
            </div>
          </div>

          {formData.role !== "Admin" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <SchoolIcon className="h-3.5 w-3.5" />
                  Escolas com acesso *
                </Label>
                <span className="text-xs text-muted-foreground">
                  {formData.school_ids.length} selecionada(s)
                </span>
              </div>
              <p className="text-xs text-muted-foreground dark:text-gray-400">
                Selecione em quais escolas este operador poderá fazer frequência.
              </p>
              {schools.length === 0 ? (
                <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                  Nenhuma escola cadastrada.
                </div>
              ) : (
                <div className="rounded-md border max-h-44 overflow-y-auto">
                  {schools.map((school) => (
                    <label
                      key={school.id}
                      className="flex items-center gap-2.5 px-3 py-2 hover:bg-accent/50 cursor-pointer border-b last:border-b-0"
                    >
                      <Checkbox
                        checked={formData.school_ids.includes(school.id)}
                        onCheckedChange={() => toggleSchool(school.id)}
                      />
                      <span className="text-sm">{school.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={closeModal}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleEdit}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar Alterações"
            )}
          </button>
        </div>
      </Modal>

      {/* ═══ DELETE MODAL ═══════════════════════════════════════════════ */}
      <Modal open={modalMode === "delete"} onClose={closeModal}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Excluir Usuário</h2>
          <button type="button" onClick={closeModal} className="opacity-70 hover:opacity-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground dark:text-gray-300 mb-6">
          Tem certeza que deseja excluir o usuário{" "}
          <strong>{selectedUser?.full_name}</strong>? Esta ação não pode ser desfeita.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={closeModal}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 h-9 px-4 py-2"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Excluindo...
              </>
            ) : (
              "Excluir"
            )}
          </button>
        </div>
      </Modal>

      {/* ═══ RESET PASSWORD MODAL ═════════════════════════════════════ */}
      <Modal open={modalMode === "reset-password"} onClose={closeModal}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Resetar Senha</h2>
            <p className="text-sm text-muted-foreground dark:text-gray-300">
              Defina uma nova senha temporária para <strong>{selectedUser?.full_name}</strong>.<br />
              O usuário será obrigado a trocar a senha no próximo login.
            </p>
          </div>
          <button type="button" onClick={closeModal} className="opacity-70 hover:opacity-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reset-password">Nova Senha Temporária *</Label>
            <Input
              id="reset-password"
              type="password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder="••••••••"
            />
            <p className="text-xs text-muted-foreground dark:text-gray-400">
              Mínimo 8 caracteres, 1 maiúscula, 1 número, 1 especial
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={closeModal}
            disabled={resetSaving}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleResetPassword}
            disabled={resetSaving}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2"
          >
            {resetSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Resetando...
              </>
            ) : (
              <>
                <RotateCcw className="h-4 w-4" />
                Resetar Senha
              </>
            )}
          </button>
        </div>
      </Modal>
    </div>
  );
}
