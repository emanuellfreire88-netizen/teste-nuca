"use client";

import { useState, useRef } from "react";
import { useAuthStore } from "@/lib/auth-store";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FloatingSupportButton } from "@/components/floating-support-button";
import { api } from "@/lib/api";
import { toast } from "sonner";

import {
  LayoutDashboard,
  School,
  GraduationCap,
  ClipboardCheck,
  Users,
  BarChart3,
  FileText,
  CalendarDays,
  LogOut,
  Menu,
  Sun,
  Moon,
  ChevronDown,
  MessageSquare,
  UserCircle,
  Upload,
  Camera,
  Trash2,
  Loader2,
} from "lucide-react";

export type PageKey =
  | "dashboard"
  | "schools"
  | "students"
  | "attendance"
  | "events"
  | "users"
  | "reports"
  | "logs"
  | "support";

interface NavItem {
  key: PageKey;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "schools", label: "Escolas", icon: School },
  { key: "students", label: "Alunos", icon: GraduationCap },
  { key: "users", label: "Usuários", icon: Users, adminOnly: true },
  { key: "attendance", label: "Frequência", icon: ClipboardCheck },
  { key: "events", label: "Eventos", icon: CalendarDays },
  { key: "reports", label: "Relatórios", icon: BarChart3 },
  { key: "logs", label: "Logs", icon: FileText, adminOnly: true },
  { key: "support", label: "Suporte", icon: MessageSquare, adminOnly: true },
];

function UserAvatar({ user }: { user: { full_name: string; profile_photo: string | null } }) {
  const initials = user.full_name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Avatar className="h-8 w-8 shrink-0">
      <AvatarImage src={user.profile_photo || undefined} alt={user.full_name} />
      <AvatarFallback className="bg-slate-700 text-slate-200 text-xs font-semibold">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}

// ─── Profile Photo Dialog (self-service, available to ALL roles) ──────

/**
 * Reads an image File, draws it onto a square canvas at most `maxDim`×`maxDim`
 * (center-cropped), and returns a JPEG data URL at the given quality. This
 * runs entirely in the browser so we never touch the server filesystem
 * (which is read-only on Vercel), and the resulting string is small enough
 * (~15-40KB) to store comfortably in a Postgres text column via the
 * `profile_photo` field.
 */
async function compressImageToDataUrl(
  file: File,
  maxDim: number,
  quality: number
): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onerror = () => reject(new Error("Imagem inválida"));
      image.onload = () => resolve(image);
      image.src = objectUrl;
    });

    // Center-crop to a square, then scale down to maxDim×maxDim. Avatars are
    // always shown as a square/circle, so a square crop matches the display.
    const side = Math.min(img.width, img.height);
    const sx = (img.width - side) / 2;
    const sy = (img.height - side) / 2;

    const canvas = document.createElement("canvas");
    canvas.width = maxDim;
    canvas.height = maxDim;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas não suportado neste navegador");
    // White background so transparent PNGs don't turn black when exported as JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, maxDim, maxDim);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, side, side, 0, 0, maxDim, maxDim);

    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function ProfilePhotoDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user, updateUser } = useAuthStore();
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(
    user?.profile_photo || null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Sync pending photo when dialog opens
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setPendingPhoto(user?.profile_photo || null);
    }
    onOpenChange(next);
  };

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/jpg", "image/webp"].includes(file.type)) {
      toast.error("Tipo de arquivo não permitido. Use JPG, PNG ou WebP.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Tamanho máximo: 10MB.");
      return;
    }

    setUploading(true);
    try {
      // Compress + resize the image entirely in the browser. This produces a
      // small (~15-40KB) base64 data URL that we store directly in the
      // database via PUT /api/auth/me. This avoids writing to the filesystem
      // (which is read-only on Vercel) and keeps the DB payload tiny. No
      // network round-trip is needed until the user clicks "Salvar".
      const dataUrl = await compressImageToDataUrl(file, 256, 0.85);
      setPendingPhoto(dataUrl);
      toast.success("Foto pronta! Clique em Salvar para confirmar.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao processar foto";
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    e.target.value = "";
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = await api.put<{ user: typeof user }>("/auth/me", {
        profile_photo: pendingPhoto || null,
      });
      if (data.user) {
        updateUser(data.user);
      }
      toast.success("Foto de perfil atualizada com sucesso!");
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar foto";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = () => {
    setPendingPhoto(null);
  };

  if (!user) return null;

  const initials = user.full_name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const roleLabel =
    user.role === "Admin"
      ? "Administrador"
      : user.role === "Operator"
        ? "Operador"
        : "Visitante";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Meu Perfil</DialogTitle>
          <DialogDescription>
            Gerencie sua foto de perfil. A foto será exibida no menu e na sua conta.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          {/* Preview Avatar */}
          <Avatar className="h-28 w-28">
            <AvatarImage src={pendingPhoto || undefined} alt={user.full_name} />
            <AvatarFallback className="bg-muted text-muted-foreground text-3xl font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>

          {/* User info */}
          <div className="text-center">
            <p className="text-base font-semibold">{user.full_name}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Perfil: {roleLabel}
            </p>
          </div>

          {/* Upload buttons */}
          <div className="flex flex-wrap gap-2 justify-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading || saving}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-1" />
              )}
              {uploading ? "Enviando..." : "Galeria"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading || saving}
              onClick={() => cameraInputRef.current?.click()}
            >
              <Camera className="h-4 w-4 mr-1" />
              Câmera
            </Button>
            {pendingPhoto && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading || saving}
                onClick={handleRemove}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Remover
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground text-center max-w-[280px]">
            Formatos: JPG, PNG ou WebP. A imagem é redimensionada automaticamente.
          </p>

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

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || uploading}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : null}
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SidebarContent({
  currentPage,
  onNavigate,
  user,
  onLogout,
  onProfileClick,
  collapsed = false,
  onToggleCollapse,
}: {
  currentPage: PageKey;
  onNavigate: (page: PageKey) => void;
  user: { full_name: string; email: string; role: string; profile_photo: string | null };
  onLogout: () => void;
  onProfileClick?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const isAdmin = user.role === "Admin";

  const visibleItems = navItems.filter((item) => !item.adminOnly || isAdmin);

  const roleLabel =
    user.role === "Admin"
      ? "Administrador"
      : user.role === "Operator"
        ? "Operador"
        : "Visitante";

  return (
    <div className="flex flex-col h-full bg-[#56CE20]">
      {/* Brand — white background so the colorful logo stands out */}
      <div className={`bg-white border-b border-black/5 flex items-center gap-2 ${collapsed ? "justify-center h-20 px-2" : "h-24 px-3"}`}>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-2 rounded-md text-[#09328B] hover:bg-black/5 transition-colors cursor-pointer shrink-0"
            title={collapsed ? "Expandir menu" : "Recolher menu"}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            <Menu className="h-6 w-6" />
          </button>
        )}
        {!collapsed && (
          <img
            src="/uploads/nuca-logo.png"
            alt="NUCA — Núcleo de Cidadania de Adolescentes"
            className="h-16 w-auto object-contain shrink-0 max-w-[180px]"
          />
        )}
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 py-2">
        <nav className="flex flex-col">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.key;
            return (
              <button
                key={item.key}
                onClick={() => onNavigate(item.key)}
                title={collapsed ? item.label : undefined}
                className={`relative w-full flex items-center gap-4 ${collapsed ? "justify-center px-2" : "px-6"} py-3 text-base transition-colors cursor-pointer ${
                  isActive
                    ? "bg-[#3DA815] text-white"
                    : "text-white hover:bg-[#4AB81A]"
                }`}
              >
                {isActive && !collapsed && (
                  <span
                    className="absolute left-0 top-0 h-full w-1.5 bg-white"
                    aria-hidden
                  />
                )}
                <Icon
                  className={`h-6 w-6 shrink-0 ${
                    isActive ? "text-white" : "text-white/90"
                  }`}
                />
                {!collapsed && <span className="font-normal">{item.label}</span>}
              </button>
            );
          })}
        </nav>
      </ScrollArea>

      {/* User footer */}
      <div className="border-t border-white/20 px-3 py-3">
        {collapsed ? (
          <div className="flex justify-center">
            <button
              onClick={onProfileClick}
              className="rounded-full ring-2 ring-white/30 hover:ring-white/60 transition-all cursor-pointer"
              title="Meu Perfil"
            >
              <UserAvatar user={user} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 py-1">
            <button
              onClick={onProfileClick}
              className="rounded-full ring-2 ring-white/30 hover:ring-white/60 transition-all cursor-pointer shrink-0"
              title="Meu Perfil"
            >
              <UserAvatar user={user} />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-normal text-white truncate">
                {user.full_name}
              </p>
              <p className="text-[11px] text-white/70 truncate">
                {roleLabel}
              </p>
            </div>
            <button
              onClick={onLogout}
              className="p-2 rounded-md text-white/90 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
              title="Sair"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function AppLayout({
  currentPage,
  onNavigate,
  children,
}: {
  currentPage: PageKey;
  onNavigate: (page: PageKey) => void;
  children: React.ReactNode;
}) {
  const { user, logout } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  if (!user) return null;

  const handleNavigate = (page: PageKey) => {
    onNavigate(page);
    setMobileOpen(false);
  };

  const handleLogout = () => {
    logout();
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <aside className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 transition-[width] duration-300 ${collapsed ? "lg:w-20" : "lg:w-72"}`}>
        <SidebarContent
          currentPage={currentPage}
          onNavigate={handleNavigate}
          user={user}
          onLogout={handleLogout}
          onProfileClick={() => setProfileOpen(true)}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
        />
      </aside>

      {/* Mobile Sidebar (narrow) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0 border-0 bg-[#56CE20]">
          <SheetHeader className="sr-only">
            <SheetTitle>Menu de navegação</SheetTitle>
          </SheetHeader>
          <SidebarContent
            currentPage={currentPage}
            onNavigate={handleNavigate}
            user={user}
            onLogout={handleLogout}
            onProfileClick={() => {
              setMobileOpen(false);
              setProfileOpen(true);
            }}
            onToggleCollapse={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Main area */}
      <div className={`flex-1 flex flex-col min-w-0 transition-[padding] duration-300 ${collapsed ? "lg:pl-20" : "lg:pl-72"}`}>
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 sm:px-6">
          {/* Mobile menu toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
            <span className="sr-only">Abrir menu</span>
          </Button>

          {/* Current page title */}
          <div className="flex-1">
            <h2 className="text-base font-semibold capitalize">
              {navItems.find((i) => i.key === currentPage)?.label || "Dashboard"}
            </h2>
          </div>

          {/* Theme toggle */}
          <Button variant="ghost" size="icon" onClick={toggleTheme}>
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Alternar tema</span>
          </Button>

          {/* User dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 px-2">
                <UserAvatar user={user} />
                <span className="hidden sm:inline text-sm font-medium max-w-[120px] truncate">
                  {user.full_name}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{user.full_name}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Perfil: {user.role}
                </p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setProfileOpen(true)}
                className="cursor-pointer"
              >
                <UserCircle className="mr-2 h-4 w-4" />
                Meu Perfil
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive cursor-pointer">
                <LogOut className="mr-2 h-4 w-4" />
                Sair da conta
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          <div className="p-6 min-h-full flex flex-col">{children}</div>
        </main>
      </div>

      {/* Floating Support button for non-admin users (Operator/Viewer) */}
      <FloatingSupportButton />

      {/* Self-service Profile Photo dialog (available to ALL roles) */}
      <ProfilePhotoDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </div>
  );
}
