"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { io, Socket } from "socket.io-client";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MessageSquare,
  Plus,
  Search,
  Loader2,
  Send,
  Clock,
  CheckCheck,
  ChevronLeft,
  Filter,
  Ticket,
  User,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────
interface TicketMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
  sender: {
    id: string;
    full_name: string;
    email: string;
    profile_photo: string | null;
    role: string;
  };
}

interface SupportTicket {
  id: string;
  protocol: string;
  subject: string;
  status: string;
  priority: string;
  user_id: string;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  user: {
    id: string;
    full_name: string;
    email: string;
    profile_photo: string | null;
  };
  assignee?: {
    id: string;
    full_name: string;
    email: string;
  } | null;
  messages?: TicketMessage[];
  _count?: {
    messages: number;
  };
}

interface TicketsResponse {
  tickets: SupportTicket[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

interface TicketDetailResponse {
  ticket: SupportTicket;
}

interface MessagesResponse {
  messages: TicketMessage[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

// ─── Constants ────────────────────────────────────────────────────────
const statusConfig: Record<string, { label: string; class: string }> = {
  open: { label: "Aberto", class: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200 dark:border-blue-800" },
  in_progress: { label: "Em Andamento", class: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-800" },
  resolved: { label: "Resolvido", class: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800" },
  closed: { label: "Fechado", class: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700" },
};

const priorityConfig: Record<string, { label: string; class: string }> = {
  low: { label: "Baixa", class: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700" },
  normal: { label: "Normal", class: "bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300 border-blue-200 dark:border-blue-800" },
  high: { label: "Alta", class: "bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300 border-orange-200 dark:border-orange-800" },
  urgent: { label: "Urgente", class: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300 border-red-200 dark:border-red-800" },
};

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatShortTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Agora";
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// ─── Main Component ──────────────────────────────────────────────────
export function SupportPage({ embedded = false }: { embedded?: boolean } = {}) {
  const currentUser = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const isAdmin = currentUser?.role === "Admin" || currentUser?.role === "Operator";

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Detail view
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Create ticket
  const [showCreate, setShowCreate] = useState(false);
  const [createSubject, setCreateSubject] = useState("");
  const [createContent, setCreateContent] = useState("");
  const [createPriority, setCreatePriority] = useState("normal");
  const [creating, setCreating] = useState(false);

  // Socket
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("limit", "50");
      const data = await api.get<TicketsResponse>(`/support/tickets?${params.toString()}`);
      setTickets(data.tickets);
    } catch {
      toast.error("Erro ao carregar tickets");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Socket.IO connection
  useEffect(() => {
    if (!token) return;

    const socket = io("/?XTransformPort=3003", {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      console.log("Chat connected");
    });

    socket.on("new-message", (msg: TicketMessage) => {
      setMessages((prev) => {
        // Avoid duplicate
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      // Also update ticket list's last message count
      setTickets((prev) =>
        prev.map((t) =>
          t.id === msg.ticket_id
            ? { ...t, _count: { messages: (t._count?.messages || 0) + 1 } }
            : t
        )
      );
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [token]);

  // Join ticket room when selecting a ticket
  useEffect(() => {
    if (selectedTicket && socketRef.current) {
      socketRef.current.emit("join-ticket", selectedTicket.id);

      return () => {
        socketRef.current?.emit("leave-ticket", selectedTicket.id);
      };
    }
  }, [selectedTicket]);

  // Fetch messages when selecting a ticket
  useEffect(() => {
    if (!selectedTicket) return;
    const fetchMessages = async () => {
      setLoadingMessages(true);
      try {
        const data = await api.get<MessagesResponse>(`/support/tickets/${selectedTicket.id}/messages?limit=100`);
        setMessages(data.messages);
        // Mark as read
        await api.put(`/support/tickets/${selectedTicket.id}/read`);
      } catch {
        toast.error("Erro ao carregar mensagens");
      } finally {
        setLoadingMessages(false);
      }
    };
    fetchMessages();
  }, [selectedTicket]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleCreateTicket = async () => {
    if (!createSubject || !createContent) {
      toast.error("Preencha todos os campos");
      return;
    }
    try {
      setCreating(true);
      const data = await api.post<TicketDetailResponse>("/support/tickets", {
        subject: createSubject,
        content: createContent,
        priority: createPriority,
      });
      toast.success(`Ticket criado! Protocolo: ${data.ticket.protocol}`);
      setShowCreate(false);
      setCreateSubject("");
      setCreateContent("");
      setCreatePriority("normal");
      fetchTickets();
      // Select the new ticket
      setSelectedTicket(data.ticket);
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error("Erro ao criar ticket");
      }
    } finally {
      setCreating(false);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedTicket) return;
    const content = newMessage.trim();
    setNewMessage("");

    try {
      setSendingMessage(true);
      const data = await api.post<{ message: TicketMessage }>(
        `/support/tickets/${selectedTicket.id}/messages`,
        { content }
      );

      // Emit via socket for real-time
      if (socketRef.current) {
        socketRef.current.emit("send-message", {
          ticket_id: selectedTicket.id,
          content,
          sender_id: currentUser?.id,
          sender_name: currentUser?.full_name,
          sender_role: currentUser?.role,
        });
      }

      // Add to messages locally too for instant feedback
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.message.id)) return prev;
        return [...prev, data.message];
      });
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error("Erro ao enviar mensagem");
      }
      setNewMessage(content); // Restore on error
    } finally {
      setSendingMessage(false);
    }
  };

  const handleStatusChange = async (ticketId: string, newStatus: string) => {
    try {
      await api.put(`/support/tickets/${ticketId}`, { status: newStatus });
      toast.success("Status atualizado!");
      fetchTickets();
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket((prev) => prev ? { ...prev, status: newStatus } : null);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      }
    }
  };

  const filteredTickets = tickets.filter(
    (t) =>
      t.subject.toLowerCase().includes(search.toLowerCase()) ||
      t.protocol.toLowerCase().includes(search.toLowerCase()) ||
      t.user.full_name.toLowerCase().includes(search.toLowerCase())
  );

  const currentStatus = selectedTicket ? statusConfig[selectedTicket.status] : null;

  // ─── Render ────────────────────────────────────────────────────────
  return (
    <div className={embedded ? "flex flex-col h-full p-4 gap-4" : "space-y-6"}>
      {/* Header (hidden when embedded — Sheet provides its own) */}
      {!embedded && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Suporte</h1>
            <p className="text-muted-foreground mt-1">
              Gerencie seus tickets de suporte e conversas
            </p>
          </div>
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Ticket
          </Button>
        </div>
      )}

      {/* Floating "Novo Ticket" button when embedded */}
      {embedded && (
        <Button onClick={() => setShowCreate(true)} className="gap-2 w-fit" size="sm">
          <Plus className="h-4 w-4" />
          Novo Ticket
        </Button>
      )}

      {/* Main Content - Split view */}
      <div
        className={
          embedded
            ? "grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0"
            : "grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-220px)]"
        }
      >
        {/* Left: Ticket List */}
        <div className={`lg:col-span-1 ${selectedTicket ? "hidden lg:block" : ""}`}>
          <Card className="h-full flex flex-col">
            <CardHeader className="pb-3 space-y-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Ticket className="h-4 w-4" />
                Tickets
              </CardTitle>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar ticket..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <div className="flex gap-1 flex-wrap">
                {["all", "open", "in_progress", "resolved", "closed"].map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                      statusFilter === s
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:bg-accent"
                    }`}
                  >
                    {s === "all" ? "Todos" : statusConfig[s]?.label || s}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-y-auto">
              {loading ? (
                <div className="space-y-3 p-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex gap-3 p-2">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredTickets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <MessageSquare className="h-10 w-10 mb-3" />
                  <p className="text-sm">Nenhum ticket encontrado</p>
                </div>
              ) : (
                <div className="divide-y">
                  {filteredTickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      onClick={() => setSelectedTicket(ticket)}
                      className={`w-full text-left p-3 hover:bg-accent/50 transition-colors ${
                        selectedTicket?.id === ticket.id ? "bg-accent" : ""
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <Avatar className="h-9 w-9 shrink-0">
                          <AvatarImage src={ticket.user.profile_photo || undefined} />
                          <AvatarFallback className="text-xs">{getInitials(ticket.user.full_name)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-mono text-muted-foreground">{ticket.protocol}</span>
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusConfig[ticket.status]?.class}`}>
                              {statusConfig[ticket.status]?.label}
                            </Badge>
                          </div>
                          <p className="text-sm font-medium truncate">{ticket.subject}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-muted-foreground truncate">{ticket.user.full_name}</span>
                            <span className="text-xs text-muted-foreground">•</span>
                            <span className="text-xs text-muted-foreground">{formatShortTime(ticket.created_at)}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Chat / Detail */}
        <div className={`lg:col-span-2 ${!selectedTicket ? "hidden lg:block" : ""}`}>
          {!selectedTicket ? (
            <Card className="h-full flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-20" />
                <p className="text-lg font-medium">Selecione um ticket</p>
                <p className="text-sm mt-1">Escolha um ticket à esquerda para ver a conversa</p>
              </div>
            </Card>
          ) : (
            <Card className="h-full flex flex-col">
              {/* Chat Header */}
              <div className="p-4 border-b flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden shrink-0"
                  onClick={() => setSelectedTicket(null)}
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-mono text-muted-foreground">{selectedTicket.protocol}</span>
                    <Badge variant="outline" className={`text-xs ${currentStatus?.class}`}>
                      {currentStatus?.label}
                    </Badge>
                    <Badge variant="outline" className={`text-xs ${priorityConfig[selectedTicket.priority]?.class}`}>
                      {priorityConfig[selectedTicket.priority]?.label}
                    </Badge>
                  </div>
                  <h3 className="font-semibold truncate mt-0.5">{selectedTicket.subject}</h3>
                  <p className="text-xs text-muted-foreground">
                    Por {selectedTicket.user.full_name} • {formatTime(selectedTicket.created_at)}
                  </p>
                </div>
                {/* Admin actions */}
                {isAdmin && (
                  <div className="flex gap-1">
                    {selectedTicket.status === "open" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => handleStatusChange(selectedTicket.id, "in_progress")}
                      >
                        Em Andamento
                      </Button>
                    )}
                    {selectedTicket.status === "in_progress" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => handleStatusChange(selectedTicket.id, "resolved")}
                      >
                        Resolver
                      </Button>
                    )}
                    {(selectedTicket.status === "resolved" || selectedTicket.status === "in_progress") && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => handleStatusChange(selectedTicket.id, "closed")}
                      >
                        Fechar
                      </Button>
                    )}
                    {(selectedTicket.status === "closed" || selectedTicket.status === "resolved") && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => handleStatusChange(selectedTicket.id, "open")}
                      >
                        Reabrir
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {loadingMessages ? (
                  <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex gap-3">
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-3 w-24" />
                          <Skeleton className="h-16 w-full" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    <p className="text-sm">Nenhuma mensagem ainda</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isOwn = msg.sender_id === currentUser?.id;
                    return (
                      <div
                        key={msg.id}
                        className={`flex gap-3 ${isOwn ? "flex-row-reverse" : ""}`}
                      >
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarImage src={msg.sender.profile_photo || undefined} />
                          <AvatarFallback className="text-xs">{getInitials(msg.sender.full_name)}</AvatarFallback>
                        </Avatar>
                        <div className={`max-w-[75%] ${isOwn ? "text-right" : ""}`}>
                          <div className="flex items-center gap-2 mb-1">
                            {!isOwn && (
                              <span className="text-xs font-medium">{msg.sender.full_name}</span>
                            )}
                            <span className="text-[10px] text-muted-foreground">
                              {formatShortTime(msg.created_at)}
                            </span>
                            {isOwn && (
                              msg.is_read ? (
                                <CheckCheck className="h-3 w-3 text-blue-500" />
                              ) : (
                                <CheckCheck className="h-3 w-3 text-muted-foreground/50" />
                              )
                            )}
                          </div>
                          <div
                            className={`rounded-xl px-3.5 py-2.5 text-sm inline-block ${
                              isOwn
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted"
                            }`}
                          >
                            {msg.content}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              {selectedTicket.status !== "closed" ? (
                <div className="p-3 border-t">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSendMessage();
                    }}
                    className="flex gap-2"
                  >
                    <Input
                      placeholder="Digite sua mensagem..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      disabled={sendingMessage}
                      className="flex-1"
                    />
                    <Button type="submit" size="icon" disabled={sendingMessage || !newMessage.trim()}>
                      {sendingMessage ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </form>
                </div>
              ) : (
                <div className="p-3 border-t text-center">
                  <p className="text-sm text-muted-foreground">
                    Este ticket está fechado. {isAdmin && "Reabra para continuar a conversa."}
                  </p>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* ═══ CREATE TICKET MODAL ═══════════════════════════════════ */}
      {showCreate && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCreate(false)} />
          <div
            className="relative z-10 w-full max-w-lg mx-4 bg-background rounded-lg border shadow-lg p-6 animate-in fade-in-0 zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">Novo Ticket de Suporte</h2>
                <p className="text-sm text-muted-foreground">
                  Descreva seu problema e receba um protocolo de acompanhamento.
                </p>
              </div>
              <button onClick={() => setShowCreate(false)} className="opacity-70 hover:opacity-100">
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Assunto *</Label>
                <Input
                  placeholder="Ex: Não consigo registrar frequência"
                  value={createSubject}
                  onChange={(e) => setCreateSubject(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Prioridade</Label>
                <select
                  value={createPriority}
                  onChange={(e) => setCreatePriority(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="low">Baixa</option>
                  <option value="normal">Normal</option>
                  <option value="high">Alta</option>
                  <option value="urgent">Urgente</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Descrição *</Label>
                <textarea
                  placeholder="Descreva detalhadamente o problema..."
                  value={createContent}
                  onChange={(e) => setCreateContent(e.target.value)}
                  rows={4}
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setShowCreate(false)} disabled={creating}>
                Cancelar
              </Button>
              <Button onClick={handleCreateTicket} disabled={creating || !createSubject || !createContent}>
                {creating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Criando...
                  </>
                ) : (
                  <>
                    <Ticket className="mr-2 h-4 w-4" />
                    Criar Ticket
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
