import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart3,
  FilePlus,
  Files,
  FileText,
  Hash,
  TrendingUp,
  Settings,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ─── Constants ────────────────────────────────────────────────────────────────

export const DOCUMENT_TYPES = [
  { value: "oficio", label: "Ofício" },
  { value: "memorando", label: "Memorando" },
  { value: "declaracao", label: "Declaração" },
  { value: "convite", label: "Convite" },
  { value: "comunicado", label: "Comunicado" },
  { value: "solicitacao_transporte", label: "Solicitação de Transporte" },
  { value: "solicitacao_espaco", label: "Solicitação de Espaço" },
  { value: "solicitacao_alimentacao", label: "Solicitação de Alimentação" },
  { value: "encaminhamento", label: "Encaminhamento" },
  { value: "relatorio", label: "Relatório" },
  { value: "certificado", label: "Certificado" },
  { value: "outros", label: "Outros" },
];

export const DOCUMENT_STATUS = [
  { value: "draft", label: "Em elaboração", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  { value: "generated", label: "Gerado", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  { value: "printed", label: "Impresso", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  { value: "signed", label: "Assinado", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  { value: "sent", label: "Enviado", color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200" },
  { value: "received", label: "Recebido", color: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200" },
  { value: "archived", label: "Arquivado", color: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200" },
  { value: "cancelled", label: "Cancelado", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
];

export const STATUS_ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ["generated", "cancelled"],
  generated: ["printed", "cancelled"],
  printed: ["signed", "cancelled"],
  signed: ["sent", "cancelled"],
  sent: ["received", "cancelled"],
  received: ["archived", "cancelled"],
  archived: [],
  cancelled: [],
};

export const CHART_COLORS = [
  "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899",
  "#14b8a6", "#f97316", "#6366f1", "#84cc16", "#e11d48",
  "#06b6d4", "#a855f7",
];

export type SubpageKey = "dashboard" | "new" | "list" | "templates" | "protocols" | "reports" | "settings";

export const SUBPAGE_TABS: { key: SubpageKey; label: string; icon: React.ElementType }[] = [
  { key: "dashboard", label: "Dashboard", icon: BarChart3 },
  { key: "new", label: "Novo Documento", icon: FilePlus },
  { key: "list", label: "Todos os Documentos", icon: Files },
  { key: "templates", label: "Modelos", icon: FileText },
  { key: "protocols", label: "Protocolos", icon: Hash },
  { key: "reports", label: "Relatórios", icon: TrendingUp },
  { key: "settings", label: "Configurações", icon: Settings },
];

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface DocCreator {
  id: string;
  full_name: string;
  email?: string;
}

export interface DocTemplateRef {
  id: string;
  name: string;
  display_name: string;
}

export interface DocHistoryEntry {
  id: string;
  action: string;
  description?: string;
  old_value?: string;
  new_value?: string;
  created_at: string;
  user: { id: string; full_name: string };
}

export interface DocAttachment {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  uploaded_by: string;
  uploaded_at: string;
  uploader?: { id: string; full_name: string };
}

export interface Document {
  id: string;
  document_type: string;
  number: number;
  number_formatted: string | null;
  year: number;
  protocol: string;
  date: string;
  recipient: string | null;
  recipient_title: string | null;
  institution: string | null;
  subject: string | null;
  body_text: string | null;
  internal_notes: string | null;
  status: string;
  signature1_name: string | null;
  signature1_title: string | null;
  signature2_name: string | null;
  signature2_title: string | null;
  signature3_name: string | null;
  signature3_title: string | null;
  template_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  creator: DocCreator;
  template?: DocTemplateRef | null;
  history?: DocHistoryEntry[];
  attachments?: DocAttachment[];
}

export interface Template {
  id: string;
  name: string;
  display_name: string;
  document_type: string | null;
  description: string | null;
  header_text: string | null;
  body_text: string | null;
  footer_text: string | null;
  signature1_name: string | null;
  signature1_title: string | null;
  signature2_name: string | null;
  signature2_title: string | null;
  signature3_name: string | null;
  signature3_title: string | null;
  is_default: boolean;
  is_active: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocConfig {
  id: string;
  config_key: string;
  config_value: string | null;
  description?: string | null;
}

export interface DashboardData {
  totalDocuments: number;
  documentsByType: { document_type: string; count: number }[];
  documentsByStatus: { status: string; count: number }[];
  documentsByMonth: { month: string; count: number }[];
  documentsByYear: { year: number; count: number }[];
  recentDocuments: Document[];
  pendingDocuments: Document[];
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ─── Helper functions ─────────────────────────────────────────────────────────

export function getTypeLabel(type: string): string {
  const found = DOCUMENT_TYPES.find((t) => t.value === type);
  return found ? found.label : type;
}

export function getStatusInfo(status: string) {
  const found = DOCUMENT_STATUS.find((s) => s.value === status);
  return found || { value: status, label: status, color: "bg-gray-100 text-gray-800" };
}

export function formatDateBR(dateStr: string): string {
  try {
    return format(parseISO(dateStr), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return dateStr;
  }
}

export function formatDateLongBR(dateStr: string): string {
  try {
    return format(parseISO(dateStr), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  } catch {
    return dateStr;
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Status Badge ────────────────────────────────────────────────────────────

export function StatusBadge({ status }: { status: string }) {
  const info = getStatusInfo(status);
  return <Badge className={`${info.color} text-xs`}>{info.label}</Badge>;
}
