"use client";

import { useState } from "react";
import Image from "next/image";
import { api, ApiError } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  KeyRound,
  ArrowLeft,
  Check,
} from "lucide-react";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const login = useAuthStore((s) => s.login);

  // Change password state
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [changePasswordToken, setChangePasswordToken] = useState<string | null>(
    null
  );
  const [changePasswordUser, setChangePasswordUser] = useState<{
    id: string;
    full_name: string;
    email: string;
    role: "Admin" | "Operator" | "Viewer";
    status: string;
    profile_photo: string | null;
    must_change_password: boolean;
  } | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const data = await api.post<{
        token: string;
        user: {
          id: string;
          full_name: string;
          email: string;
          role: "Admin" | "Operator" | "Viewer";
          status: string;
          profile_photo: string | null;
          must_change_password: boolean;
          school_ids?: string[];
        };
        mustChangePassword?: boolean;
      }>("/auth/login", { email, password, remember });

      if (data.mustChangePassword && data.token && data.user) {
        setChangePasswordToken(data.token);
        setChangePasswordUser(data.user);
        setMustChangePassword(true);
        setCurrentPassword(password);
        setNewPassword("");
        setConfirmPassword("");
      } else if (data.token && data.user) {
        login(data.token, data.user);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Erro ao conectar com o servidor. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentPassword) {
      setError("Digite sua senha atual.");
      return;
    }
    if (!newPassword) {
      setError("Digite a nova senha.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    if (newPassword.length < 8) {
      setError("A nova senha deve ter no mínimo 8 caracteres.");
      return;
    }
    if (!changePasswordToken) return;

    setChangingPassword(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${changePasswordToken}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new ApiError(data.error || "Erro ao alterar senha", res.status);
      }

      if (changePasswordUser) {
        login(changePasswordToken, {
          ...changePasswordUser,
          must_change_password: false,
        });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Erro ao alterar senha. Tente novamente.");
      }
    } finally {
      setChangingPassword(false);
    }
  };

  const handleBackToLogin = () => {
    setMustChangePassword(false);
    setChangePasswordToken(null);
    setChangePasswordUser(null);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
  };

  // Password strength indicator
  const getPasswordStrength = (pwd: string) => {
    const checks = {
      length: pwd.length >= 8,
      uppercase: /[A-Z]/.test(pwd),
      lowercase: /[a-z]/.test(pwd),
      number: /[0-9]/.test(pwd),
      special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd),
    };
    const score = Object.values(checks).filter(Boolean).length;
    return { checks, score };
  };

  const strength = getPasswordStrength(newPassword);

  return (
    <div className="min-h-screen w-full flex flex-col bg-background">
      {/* ── Top bar ──────────────────────────────────────── */}
      <header className="h-14 px-6 flex items-center justify-between border-b border-border/60">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">N</span>
          </div>
          <span className="text-sm font-semibold tracking-tight text-foreground">
            Nuca
          </span>
          <span className="text-xs text-muted-foreground/70 ml-1">
            · Gestão Escolar
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>Sistema operando normalmente</span>
        </div>
      </header>

      {/* ── Main content ─────────────────────────────────── */}
      <main className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-[420px]">
          {!mustChangePassword ? (
            <>
              {/* ── LOGIN ────────────────────────────────────── */}
              {/* Centered logo + heading */}
              <div className="flex flex-col items-center text-center mb-8">
                <div className="w-44 h-auto mb-6">
                  <Image
                    src="/uploads/nuca-logo.png"
                    alt="Nuca — Núcleo de Cidadania de Adolescentes"
                    width={1922}
                    height={1080}
                    className="w-full h-auto object-contain"
                    priority
                  />
                </div>
                <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] text-foreground">
                  Acessar sua conta
                </h1>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-[320px]">
                  Use suas credenciais para entrar na plataforma de gestão
                  escolar.
                </p>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/5 px-3.5 py-3 text-sm text-destructive mb-5">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span className="leading-snug">{error}</span>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="email"
                    className="text-[13px] font-medium text-foreground"
                  >
                    E-mail
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="nome@dominio.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    autoFocus
                    className="h-10 rounded-lg border-border bg-background text-sm transition-colors placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-0"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="password"
                      className="text-[13px] font-medium text-foreground"
                    >
                      Senha
                    </Label>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="h-10 rounded-lg border-border bg-background text-sm transition-colors placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-0 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-foreground transition-colors"
                      tabIndex={-1}
                      aria-label={
                        showPassword ? "Ocultar senha" : "Mostrar senha"
                      }
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="remember"
                      checked={remember}
                      onCheckedChange={(checked) => setRemember(checked === true)}
                      className="h-4 w-4"
                    />
                    <Label
                      htmlFor="remember"
                      className="text-[13px] text-muted-foreground cursor-pointer select-none"
                    >
                      Manter conectado
                    </Label>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-10 rounded-lg text-sm font-medium transition-all mt-2 bg-[#2480dc] hover:bg-[#1f6db8] active:bg-[#1a5fa3] text-white shadow-sm"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Entrando...
                    </>
                  ) : (
                    "Entrar"
                  )}
                </Button>
              </form>

              {/* Hint */}
              <p className="mt-6 text-xs text-muted-foreground/70 leading-relaxed text-center">
                Esqueceu sua senha? Entre em contato com o administrador do
                sistema.
              </p>
            </>
          ) : (
            <>
              {/* ── CHANGE PASSWORD ─────────────────────────── */}
              {/* Centered logo + heading */}
              <div className="flex flex-col items-center text-center mb-7">
                <div className="w-40 h-auto mb-6">
                  <Image
                    src="/uploads/nuca-logo.png"
                    alt="Nuca — Núcleo de Cidadania de Adolescentes"
                    width={1922}
                    height={1080}
                    className="w-full h-auto object-contain"
                    priority
                  />
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center">
                    <KeyRound className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <span className="text-xs font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    Senha temporária
                  </span>
                </div>
                <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] text-foreground">
                  Redefinir senha
                </h1>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-[320px]">
                  Você está usando uma senha temporária. Crie uma nova senha
                  para continuar.
                </p>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/5 px-3.5 py-3 text-sm text-destructive mb-5">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span className="leading-snug">{error}</span>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="current-password"
                    className="text-[13px] font-medium text-foreground"
                  >
                    Senha atual
                  </Label>
                  <div className="relative">
                    <Input
                      id="current-password"
                      type={showCurrentPassword ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="h-10 rounded-lg border-border bg-background text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-0 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowCurrentPassword(!showCurrentPassword)
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-foreground transition-colors"
                      tabIndex={-1}
                      aria-label="Mostrar senha"
                    >
                      {showCurrentPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="new-password"
                    className="text-[13px] font-medium text-foreground"
                  >
                    Nova senha
                  </Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      placeholder="Mínimo 8 caracteres"
                      className="h-10 rounded-lg border-border bg-background text-sm transition-colors placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-0 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-foreground transition-colors"
                      tabIndex={-1}
                      aria-label="Mostrar senha"
                    >
                      {showNewPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="confirm-password"
                    className="text-[13px] font-medium text-foreground"
                  >
                    Confirmar nova senha
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      placeholder="Repita a nova senha"
                      className="h-10 rounded-lg border-border bg-background text-sm transition-colors placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-0 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowConfirmPassword(!showConfirmPassword)
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-foreground transition-colors"
                      tabIndex={-1}
                      aria-label="Mostrar senha"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {confirmPassword && newPassword !== confirmPassword && (
                    <p className="text-xs text-destructive mt-1">
                      As senhas não coincidem
                    </p>
                  )}
                </div>

                {/* Password requirements - minimal & professional */}
                {newPassword && (
                  <div className="rounded-lg border border-border/70 bg-muted/30 p-3.5">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-2.5">
                      Requisitos da senha
                    </p>
                    <div className="grid grid-cols-1 gap-1.5">
                      {[
                        { ok: strength.checks.length, label: "Mínimo de 8 caracteres" },
                        { ok: strength.checks.uppercase, label: "Uma letra maiúscula" },
                        { ok: strength.checks.lowercase, label: "Uma letra minúscula" },
                        { ok: strength.checks.number, label: "Um número" },
                        { ok: strength.checks.special, label: "Um caractere especial" },
                      ].map((req, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 text-[12px] transition-colors"
                        >
                          <span
                            className={`flex h-3.5 w-3.5 items-center justify-center rounded-full transition-colors ${
                              req.ok
                                ? "bg-emerald-500 text-white"
                                : "bg-muted-foreground/15 text-transparent"
                            }`}
                          >
                            <Check className="h-2.5 w-2.5" strokeWidth={3} />
                          </span>
                          <span
                            className={
                              req.ok
                                ? "text-foreground"
                                : "text-muted-foreground"
                            }
                          >
                            {req.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full h-10 rounded-lg text-sm font-medium transition-all mt-2 bg-[#2480dc] hover:bg-[#1f6db8] active:bg-[#1a5fa3] text-white shadow-sm"
                  disabled={
                    changingPassword ||
                    !newPassword ||
                    !confirmPassword ||
                    newPassword !== confirmPassword
                  }
                >
                  {changingPassword ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Alterando...
                    </>
                  ) : (
                    "Alterar senha e continuar"
                  )}
                </Button>
              </form>

              {/* Back */}
              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={handleBackToLogin}
                  className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Voltar ao login
                </button>
              </div>
            </>
          )}
        </div>
      </main>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer className="h-12 px-6 flex items-center justify-between border-t border-border/60 text-xs text-muted-foreground/70">
        <span>
          © {new Date().getFullYear()} Nuca Plataforma
        </span>
        <span className="hidden sm:inline">
          v2.7 · {new Date().toISOString().slice(0, 10)}
        </span>
      </footer>
    </div>
  );
}
