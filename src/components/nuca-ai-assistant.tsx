"use client";

import { useState, useRef, useEffect } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Sparkles, Send, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  tool?: string | null;
}

const SUGGESTED_QUESTIONS = [
  "Quantos adolescentes estão em risco de evasão?",
  "Quais são as pendências desta semana?",
  "Quantos eventos estão previstos para este mês?",
  "Faça um resumo dos indicadores de participação.",
  "Quais alertas precisam de atenção?",
];

export function NUCAAssistant() {
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSend = async (message?: string) => {
    const text = message || input;
    if (!text.trim() || loading) return;

    const userMessage: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const data = await api.post<{ reply: string; toolUsed?: string }>(
        "/ai/assistant",
        { message: text }
      );

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: data.reply,
        tool: data.toolUsed || null,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: unknown) {
      const errorMsg: ChatMessage = {
        role: "assistant",
        content:
          err instanceof Error
            ? `Erro: ${err.message}`
            : "Erro ao processar solicitação. Tente novamente.",
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-5 w-5 text-primary" />
          NUCA IA — Assistente Inteligente
          {user && (
            <span className="text-xs text-muted-foreground font-normal ml-auto">
              {user.role === "Admin" ? "Acesso total" : "Acesso limitado"}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Messages */}
        <div
          ref={scrollRef}
          className="max-h-[400px] overflow-y-auto space-y-3 pr-2"
        >
          {messages.length === 0 ? (
            <div className="text-center py-8">
              <Sparkles className="h-10 w-10 text-primary/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-4">
                Olá! Sou o NUCA IA. Posso ajudar a analisar dados do sistema,
                identificar tendências e sugerir ações.
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <Button
                    key={q}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => handleSend(q)}
                  >
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg p-3 text-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    {msg.tool && (
                      <p className="text-xs opacity-70 mt-1 pt-1 border-t border-current/20">
                        📊 Dados: {msg.tool}
                      </p>
                    )}
                  </div>
                </motion.div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg p-3">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
            </AnimatePresence>
          )}
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pergunte sobre os dados do sistema..."
            disabled={loading}
            maxLength={2000}
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <Button
            size="sm"
            onClick={() => handleSend()}
            disabled={loading || !input.trim()}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-muted-foreground flex items-start gap-1">
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
          O NUCA IA é uma ferramenta de apoio. Não substitui decisões humanas.
          Dados baseados em informações do sistema.
        </p>
      </CardContent>
    </Card>
  );
}
