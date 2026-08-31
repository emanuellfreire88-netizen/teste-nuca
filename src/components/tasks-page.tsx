"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CheckSquare, Plus, Clock, CheckCircle2, AlertTriangle, Loader2,
  ChevronDown, Trash2, Calendar,
} from "lucide-react";

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  related_type: string | null;
  creator: { id: string; full_name: string };
  assignee: { id: string; full_name: string } | null;
}

interface TaskUser {
  id: string;
  full_name: string;
}

const PRIORITY_LABELS: Record<string, string> = {
  baixa: "Baixa", normal: "Normal", alta: "Alta", critica: "Crítica",
};
const PRIORITY_COLORS: Record<string, string> = {
  baixa: "bg-gray-100 text-gray-700",
  normal: "bg-blue-100 text-blue-700",
  alta: "bg-orange-100 text-orange-700",
  critica: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente", in_progress: "Em andamento", blocked: "Bloqueada",
  completed: "Concluída", cancelled: "Cancelada",
};
const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  in_progress: "bg-blue-100 text-blue-700",
  blocked: "bg-red-100 text-red-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-gray-100 text-gray-700",
};

const STATUS_ICONS: Record<string, React.ElementType> = {
  pending: Clock, in_progress: Loader2, blocked: AlertTriangle,
  completed: CheckCircle2, cancelled: Trash2,
};

export function TasksPage() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<TaskUser[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: "", description: "", priority: "normal", due_date: "", assigned_to: "",
  });

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter) params.set("status", filter);
      if (overdueOnly) params.set("overdue", "true");
      const data = await api.get<{ tasks: Task[]; summary: { overdue: number } }>(`/tasks?${params}`);
      setTasks(data.tasks);
    } catch {
      toast.error("Erro ao carregar tarefas");
    }
    setLoading(false);
  }, [filter, overdueOnly]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Fetch users for assignment (admin only)
  useEffect(() => {
    if (user?.role === "Admin") {
      api.get<{ users: TaskUser[] }>("/users?limit=100").then(data => {
        setUsers(data.users.map(u => ({ id: u.id, full_name: u.full_name })));
      }).catch(() => {});
    }
  }, [user?.role]);

  const handleCreate = async () => {
    if (!formData.title.trim()) {
      toast.error("Título é obrigatório");
      return;
    }
    try {
      await api.post("/tasks", {
        title: formData.title,
        description: formData.description || undefined,
        priority: formData.priority,
        due_date: formData.due_date || undefined,
        assigned_to: formData.assigned_to || undefined,
      });
      toast.success("Tarefa criada!");
      setCreateOpen(false);
      setFormData({ title: "", description: "", priority: "normal", due_date: "", assigned_to: "" });
      fetchTasks();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar tarefa");
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    try {
      await api.put(`/tasks/${taskId}`, { status: newStatus });
      toast.success(`Status alterado para ${STATUS_LABELS[newStatus]}`);
      fetchTasks();
    } catch {
      toast.error("Erro ao alterar status");
    }
  };

  const handleDelete = async (taskId: string) => {
    if (!confirm("Tem certeza que deseja excluir esta tarefa?")) return;
    try {
      await api.delete(`/tasks/${taskId}`);
      toast.success("Tarefa excluída");
      fetchTasks();
    } catch {
      toast.error("Erro ao excluir tarefa");
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  const isOverdue = (task: Task) => {
    if (!task.due_date || task.status === "completed" || task.status === "cancelled") return false;
    return new Date(task.due_date) < new Date();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tarefas</h1>
          <p className="text-muted-foreground mt-1">Gerencie tarefas e prazos do sistema</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Nova Tarefa
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border p-0.5">
          <Button size="sm" variant={filter === "" ? "secondary" : "ghost"} className="h-7 text-xs" onClick={() => setFilter("")}>Todas</Button>
          <Button size="sm" variant={filter === "pending" ? "secondary" : "ghost"} className="h-7 text-xs" onClick={() => setFilter("pending")}>Pendentes</Button>
          <Button size="sm" variant={filter === "in_progress" ? "secondary" : "ghost"} className="h-7 text-xs" onClick={() => setFilter("in_progress")}>Em andamento</Button>
          <Button size="sm" variant={filter === "completed" ? "secondary" : "ghost"} className="h-7 text-xs" onClick={() => setFilter("completed")}>Concluídas</Button>
        </div>
        <Button size="sm" variant={overdueOnly ? "secondary" : "outline"} className="h-7 text-xs" onClick={() => setOverdueOnly(!overdueOnly)}>
          <AlertTriangle className="h-3 w-3 mr-1" /> Atrasadas
        </Button>
      </div>

      {/* Tasks list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : tasks.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <CheckSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>Nenhuma tarefa encontrada</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => {
            const StatusIcon = STATUS_ICONS[task.status] || Clock;
            const overdue = isOverdue(task);
            return (
              <Card key={task.id} className={overdue ? "border-red-300" : ""}>
                <CardContent className="p-4 flex items-start gap-3">
                  <StatusIcon className={`h-5 w-5 mt-0.5 shrink-0 ${overdue ? "text-red-500" : "text-muted-foreground"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{task.title}</p>
                      <Badge variant="outline" className={`text-xs ${PRIORITY_COLORS[task.priority]}`}>
                        {PRIORITY_LABELS[task.priority]}
                      </Badge>
                      <Badge variant="outline" className={`text-xs ${STATUS_COLORS[task.status]}`}>
                        {STATUS_LABELS[task.status]}
                      </Badge>
                      {overdue && (
                        <Badge variant="outline" className="text-xs bg-red-100 text-red-700">
                          Atrasada
                        </Badge>
                      )}
                    </div>
                    {task.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      {task.due_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> {formatDate(task.due_date)}
                        </span>
                      )}
                      {task.assignee && (
                        <span>Responsável: {task.assignee.full_name}</span>
                      )}
                      <span>Criada por: {task.creator.full_name}</span>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm"><ChevronDown className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleStatusChange(task.id, "in_progress")}>
                        <Loader2 className="h-4 w-4 mr-2" /> Em andamento
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleStatusChange(task.id, "completed")}>
                        <CheckCircle2 className="h-4 w-4 mr-2" /> Concluir
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleStatusChange(task.id, "blocked")}>
                        <AlertTriangle className="h-4 w-4 mr-2" /> Bloquear
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleStatusChange(task.id, "cancelled")}>
                        <Trash2 className="h-4 w-4 mr-2" /> Cancelar
                      </DropdownMenuItem>
                      {(user?.role === "Admin" || task.creator.id === user?.id) && (
                        <>
                          <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(task.id)}>
                            <Trash2 className="h-4 w-4 mr-2" /> Excluir
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Tarefa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Título *</Label>
              <Input value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="Título da tarefa" maxLength={255} />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Detalhes da tarefa" rows={3} maxLength={2000} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Prioridade</Label>
                <Select value={formData.priority} onValueChange={v => setFormData({...formData, priority: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Prazo</Label>
                <Input type="date" value={formData.due_date} onChange={e => setFormData({...formData, due_date: e.target.value})} />
              </div>
            </div>
            {user?.role === "Admin" && users.length > 0 && (
              <div className="space-y-2">
                <Label>Atribuir para</Label>
                <Select value={formData.assigned_to} onValueChange={v => setFormData({...formData, assigned_to: v})}>
                  <SelectTrigger><SelectValue placeholder="Sem responsável" /></SelectTrigger>
                  <SelectContent>
                    {users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate}>Criar Tarefa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
