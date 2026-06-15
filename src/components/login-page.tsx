"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { api, ApiError } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, AlertCircle, Eye, EyeOff, ShieldCheck, ArrowLeft } from "lucide-react";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const login = useAuthStore((s) => s.login);

  // 2FA state
  const [show2FA, setShow2FA] = useState(false);
  const [userId2FA, setUserId2FA] = useState<string | null>(null);
  const [email2FA, setEmail2FA] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState(["", "", "", "", "", ""]);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const data = await api.post<{
        token?: string;
        user?: {
          id: string;
          full_name: string;
          email: string;
          role: "Admin" | "Operator" | "Viewer";
          status: string;
          profile_photo: string | null;
          two_factor_enabled: boolean;
        };
        requires2FA?: boolean;
        userId?: string;
        email?: string;
        message?: string;
      }>("/auth/login", { email, password, remember });

      if (data.requires2FA) {
        // Show 2FA verification screen
        setUserId2FA(data.userId || null);
        setEmail2FA(data.email || null);
        setShow2FA(true);
        setResendCooldown(60);
        // Focus first code input
        setTimeout(() => codeInputRefs.current[0]?.focus(), 100);
      } else if (data.token && data.user) {
        // Direct login (no 2FA)
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

  const handleCodeChange = (index: number, value: string) => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) return;

    const newCode = [...verificationCode];
    newCode[index] = value;
    setVerificationCode(newCode);

    // Auto-focus next input
    if (value && index < 5) {
      codeInputRefs.current[index + 1]?.focus();
    }
  };

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    // Move to previous input on backspace if current is empty
    if (e.key === "Backspace" && !verificationCode[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus();
    }
  };

  const handleCodePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 0) return;

    const newCode = [...verificationCode];
    for (let i = 0; i < 6; i++) {
      newCode[i] = pasted[i] || "";
    }
    setVerificationCode(newCode);

    // Focus the next empty input or the last one
    const nextEmpty = newCode.findIndex((c) => !c);
    if (nextEmpty >= 0) {
      codeInputRefs.current[nextEmpty]?.focus();
    } else {
      codeInputRefs.current[5]?.focus();
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const code = verificationCode.join("");
    if (code.length !== 6) {
      setError("Digite o código completo de 6 dígitos.");
      return;
    }

    if (!userId2FA) return;

    setVerifying(true);
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
          two_factor_enabled: boolean;
        };
      }>("/auth/verify-2fa", { userId: userId2FA, code });

      login(data.token, data.user);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Erro ao verificar código. Tente novamente.");
      }
    } finally {
      setVerifying(false);
    }
  };

  const handleResendCode = async () => {
    if (!userId2FA || resendCooldown > 0) return;

    setError(null);
    setResending(true);
    try {
      await api.post("/auth/resend-2fa", { userId: userId2FA });
      setResendCooldown(60);
      setVerificationCode(["", "", "", "", "", ""]);
      setTimeout(() => codeInputRefs.current[0]?.focus(), 100);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Erro ao reenviar código. Tente novamente.");
      }
    } finally {
      setResending(false);
    }
  };

  const handleBackToLogin = () => {
    setShow2FA(false);
    setVerificationCode(["", "", "", "", "", ""]);
    setUserId2FA(null);
    setEmail2FA(null);
    setError(null);
  };

  // Auto-submit when all 6 digits are entered
  useEffect(() => {
    const code = verificationCode.join("");
    if (code.length === 6 && !verifying) {
      // Small delay for visual feedback
      const timer = setTimeout(() => {
        handleVerifyCode({ preventDefault: () => {} } as React.FormEvent);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [verificationCode]);

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Branding & Image */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden bg-gradient-to-br from-[#091829] via-[#0f2644] to-[#1e3a5f]">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-96 h-96 bg-blue-400 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-80 h-80 bg-cyan-400 rounded-full blur-3xl translate-x-1/3 translate-y-1/3" />
          <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-indigo-400 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
        </div>

        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center justify-center w-full p-12">
          {/* Logo */}
          <div className="w-72 mb-10 animate-fade-in">
            <Image
              src="/uploads/nuca-logo.png"
              alt="Nuca Plataforma"
              width={1922}
              height={1080}
              className="w-full h-auto object-contain drop-shadow-2xl"
              priority
            />
          </div>

          {/* Tagline */}
          <p className="text-white/60 text-center text-lg max-w-md leading-relaxed">
            Plataforma completa para gestão escolar.<br />
            Alunos, escolas e frequência em um só lugar.
          </p>

          {/* Decorative features */}
          <div className="mt-16 grid grid-cols-3 gap-8 max-w-md w-full">
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10 flex items-center justify-center">
                <svg className="w-6 h-6 text-cyan-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
                </svg>
              </div>
              <span className="text-white/40 text-xs text-center">Gestão de<br />Alunos</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10 flex items-center justify-center">
                <svg className="w-6 h-6 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
              <span className="text-white/40 text-xs text-center">Controle de<br />Frequência</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10 flex items-center justify-center">
                <svg className="w-6 h-6 text-amber-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                </svg>
              </div>
              <span className="text-white/40 text-xs text-center">Relatórios<br />Detalhados</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form / 2FA Verification */}
      <div className="flex-1 flex items-center justify-center bg-white dark:bg-[#0d1117] p-6 sm:p-12">
        <div className="w-full max-w-[400px]">

          {!show2FA ? (
            <>
              {/* ── LOGIN FORM ────────────────────────────── */}
              {/* Mobile Logo */}
              <div className="flex flex-col items-center mb-8 lg:hidden">
                <div className="w-40 mb-3">
                  <Image
                    src="/uploads/nuca-logo.png"
                    alt="Nuca Plataforma"
                    width={1922}
                    height={1080}
                    className="w-full h-auto object-contain"
                    priority
                  />
                </div>
                <p className="text-muted-foreground text-sm">
                  Sistema de Gestão Escolar
                </p>
              </div>

              {/* Header */}
              <div className="mb-8">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  Bem-vindo de volta
                </h1>
                <p className="text-muted-foreground mt-2 text-sm">
                  Insira suas credenciais para acessar o sistema
                </p>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2.5 rounded-xl border border-destructive/30 bg-destructive/5 p-3.5 text-sm text-destructive mb-6 animate-in fade-in slide-in-from-top-1 duration-300">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium">
                    E-mail
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="h-11 rounded-xl border-muted-foreground/20 bg-muted/30 focus:bg-background transition-colors"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-sm font-medium">
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
                      className="h-11 rounded-xl border-muted-foreground/20 bg-muted/30 focus:bg-background transition-colors pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="remember"
                      checked={remember}
                      onCheckedChange={(checked) => setRemember(checked === true)}
                    />
                    <Label
                      htmlFor="remember"
                      className="text-sm font-normal text-muted-foreground cursor-pointer"
                    >
                      Lembrar de mim
                    </Label>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 rounded-xl text-sm font-semibold shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all duration-200"
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
            </>
          ) : (
            <>
              {/* ── 2FA VERIFICATION ─────────────────────── */}
              {/* Mobile Logo */}
              <div className="flex flex-col items-center mb-8 lg:hidden">
                <div className="w-40 mb-3">
                  <Image
                    src="/uploads/nuca-logo.png"
                    alt="Nuca Plataforma"
                    width={1922}
                    height={1080}
                    className="w-full h-auto object-contain"
                    priority
                  />
                </div>
              </div>

              {/* Header */}
              <div className="mb-8 text-center">
                <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <ShieldCheck className="h-7 w-7 text-primary" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  Verificação de segurança
                </h1>
                <p className="text-muted-foreground mt-2 text-sm">
                  Enviamos um código de 6 dígitos para
                </p>
                <p className="text-foreground font-medium text-sm mt-1">
                  {email2FA}
                </p>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2.5 rounded-xl border border-destructive/30 bg-destructive/5 p-3.5 text-sm text-destructive mb-6 animate-in fade-in slide-in-from-top-1 duration-300">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Code Input */}
              <form onSubmit={handleVerifyCode} className="space-y-6">
                <div className="flex justify-center gap-2">
                  {verificationCode.map((digit, index) => (
                    <Input
                      key={index}
                      ref={(el) => { codeInputRefs.current[index] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleCodeChange(index, e.target.value)}
                      onKeyDown={(e) => handleCodeKeyDown(index, e)}
                      onPaste={index === 0 ? handleCodePaste : undefined}
                      className="w-12 h-14 text-center text-xl font-bold rounded-xl border-muted-foreground/20 bg-muted/30 focus:bg-background transition-colors"
                      disabled={verifying}
                    />
                  ))}
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 rounded-xl text-sm font-semibold shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all duration-200"
                  disabled={verifying || verificationCode.join("").length < 6}
                >
                  {verifying ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verificando...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      Verificar código
                    </>
                  )}
                </Button>
              </form>

              {/* Resend & Back */}
              <div className="mt-6 space-y-3">
                <div className="text-center">
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={resendCooldown > 0 || resending}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {resending ? (
                      <span className="flex items-center justify-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Enviando...
                      </span>
                    ) : resendCooldown > 0 ? (
                      `Reenviar código em ${resendCooldown}s`
                    ) : (
                      "Não recebeu o código? Reenviar"
                    )}
                  </button>
                </div>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={handleBackToLogin}
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Voltar ao login
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Footer */}
          <div className="mt-10 pt-6 border-t border-border/50">
            <p className="text-center text-muted-foreground text-xs">
              Nuca Plataforma &copy; {new Date().getFullYear()} — Sistema de Gestão Escolar
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
