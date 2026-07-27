"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";
import { Document, getTypeLabel, formatDateBR, StatusBadge } from "./shared";

interface ProtocolsSubpageProps {
  onViewDocument: (docId: string) => void;
}

export function ProtocolsSubpage({ onViewDocument }: ProtocolsSubpageProps) {
  const [protocolSearch, setProtocolSearch] = useState("");
  const [protocolResults, setProtocolResults] = useState<Document[]>([]);
  const [protocolSearching, setProtocolSearching] = useState(false);

  const handleProtocolSearch = async () => {
    if (!protocolSearch.trim()) { toast.error("Digite um número de protocolo"); return; }
    setProtocolSearching(true);
    try {
      const data = await api.get<{ document?: Document; documents?: Document[] }>(
        `/documents/protocols?protocol=${encodeURIComponent(protocolSearch.trim())}`
      );
      if (data.document) { setProtocolResults([data.document]); }
      else if (data.documents) { setProtocolResults(data.documents); }
      else { setProtocolResults([]); toast.error("Nenhum documento encontrado para este protocolo"); }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao buscar protocolo");
      setProtocolResults([]);
    }
    setProtocolSearching(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Busca por Protocolo</h1>
        <p className="text-muted-foreground mt-1">Encontre documentos pelo número de protocolo</p>
      </div>

      <Card><CardContent className="p-6">
        <div className="flex items-center gap-3 max-w-lg">
          <div className="flex-1">
            <Input value={protocolSearch} onChange={(e) => setProtocolSearch(e.target.value)} placeholder="Digite o protocolo (ex: 2026-000001)" />
          </div>
          <Button onClick={handleProtocolSearch} disabled={protocolSearching}>
            {protocolSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Buscar
          </Button>
        </div>
      </CardContent></Card>

      {protocolResults.length > 0 && (
        <div className="space-y-3">
          {protocolResults.map((doc) => (
            <Card key={doc.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => onViewDocument(doc.id)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold">{doc.number_formatted || doc.protocol}</span>
                      <StatusBadge status={doc.status} />
                    </div>
                    <p className="text-sm text-muted-foreground">{getTypeLabel(doc.document_type)} — {doc.subject || "Sem assunto"}</p>
                    {doc.recipient && <p className="text-xs text-muted-foreground">Destinatário: {doc.recipient}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">{formatDateBR(doc.date)}</p>
                    <p className="text-xs text-muted-foreground">{doc.creator?.full_name}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </motion.div>
  );
}
