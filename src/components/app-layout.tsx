"use client";

import { useState } from "react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { FloatingSupportButton } from "@/components/floating-support-button";

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

function SidebarContent({
  currentPage,
  onNavigate,
  user,
  onLogout,
}: {
  currentPage: PageKey;
  onNavigate: (page: PageKey) => void;
  user: { full_name: string; email: string; role: string; profile_photo: string | null };
  onLogout: () => void;
}) {
  const isAdmin = user.role === "Admin";

  const visibleItems = navItems.filter((item) => !item.adminOnly || isAdmin);

  return (
    <div className="flex flex-col h-full bg-[#0D47A1]">
      {/* Brand */}
      <div className="px-5 h-14 flex items-center border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-md bg-orange-500 flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-sm leading-none">N</span>
          </div>
          <div className="leading-none">
            <p className="text-white font-semibold text-sm tracking-tight">NUCA</p>
            <p className="text-white/50 text-[10px] mt-0.5 tracking-wide uppercase">
              Gestão Escolar
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.key;
            return (
              <button
                key={item.key}
                onClick={() => onNavigate(item.key)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-md text-sm transition-colors cursor-pointer ${
                  isActive
                    ? "bg-[#1565C0] text-white"
                    : "text-white/85 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon
                  className={`h-5 w-5 shrink-0 ${
                    isActive ? "text-orange-400" : "text-white"
                  }`}
                />
                <span className="font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </ScrollArea>

      {/* User footer */}
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-white/10 transition-colors">
          <UserAvatar user={user} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {user.full_name}
            </p>
            <p className="text-[11px] text-white/60 truncate">
              {isAdmin ? "Administrador" : "Operador"}
            </p>
          </div>
          <button
            onClick={onLogout}
            className="p-1.5 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Sair"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
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
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0">
        <SidebarContent
          currentPage={currentPage}
          onNavigate={handleNavigate}
          user={user}
          onLogout={handleLogout}
        />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0 border-0 bg-[#0D47A1]">
          <SheetHeader className="sr-only">
            <SheetTitle>Menu de navegação</SheetTitle>
          </SheetHeader>
          <SidebarContent
            currentPage={currentPage}
            onNavigate={handleNavigate}
            user={user}
            onLogout={handleLogout}
          />
        </SheetContent>
      </Sheet>

      {/* Main area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
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
    </div>
  );
}
