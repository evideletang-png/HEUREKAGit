import React, { useState, useRef, useEffect } from "react";
import { Send, Loader2, User, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getApiUrl } from "@/lib/api";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}

const SUGGESTED_QUESTIONS = [
  "Peut-on construire un immeuble collectif R+3 sur cette parcelle ?",
  "Quelle est l'emprise restante disponible pour un projet neuf ?",
  "Y a-t-il des contraintes pour une division parcellaire ?",
  "Quelles sont les règles de recul par rapport à la voirie ?",
  "Peut-on surélever l'existant d'un niveau ?",
  "Quelles démarches administratives pour un projet de 200 m² ?",
];

interface Props {
  analysisId: string;
  analysisStatus: string;
}

function BuildingBotAvatar({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  const size = compact ? "w-8 h-8" : "w-12 h-12";
  const body = compact ? "w-5 h-5" : "w-7 h-7";
  const arm = compact ? "h-3 w-1" : "h-4 w-1.5";
  const hand = compact ? "w-1.5 h-1.5" : "w-2 h-2";
  const eye = compact ? "w-1 h-1" : "w-1.5 h-1.5";
  const smile = compact ? "w-2.5 h-1.5" : "w-3.5 h-2";
  const windowCell = compact ? "w-1 h-1" : "w-1.5 h-1.5";

  return (
    <div className={`relative ${size} ${className}`}>
      <div className="absolute left-1/2 top-0 h-2 w-4 -translate-x-1/2 rounded-t-full bg-amber-300 shadow-sm" />
      <div className={`absolute left-0 top-4 ${arm} -rotate-[25deg] rounded-full bg-amber-500`} />
      <div className={`absolute left-[-2px] top-6 ${hand} rounded-full bg-amber-300`} />
      <div className={`absolute right-0 top-4 ${arm} rotate-[25deg] rounded-full bg-amber-500`} />
      <div className={`absolute right-[-2px] top-6 ${hand} rounded-full bg-amber-300`} />
      <div className={`absolute bottom-0 left-1/2 ${body} -translate-x-1/2 rounded-[0.85rem] border border-slate-700/20 bg-gradient-to-b from-sky-300 via-sky-500 to-sky-700 shadow-[0_8px_16px_rgba(15,23,42,0.18)]`}>
        <div className="absolute inset-x-1 top-1 h-1 rounded-full bg-white/30" />
        <div className="absolute left-1/2 top-2.5 flex -translate-x-1/2 gap-1">
          <span className={`${eye} rounded-full bg-slate-900`} />
          <span className={`${eye} rounded-full bg-slate-900`} />
        </div>
        <div className={`absolute left-1/2 top-4 -translate-x-1/2 rounded-b-full border-b-2 border-slate-900 ${smile}`} />
        <div className="absolute inset-x-1 bottom-1 grid grid-cols-2 gap-1">
          {Array.from({ length: 4 }).map((_, index) => (
            <span key={index} className={`${windowCell} rounded-[2px] bg-white/80 shadow-[0_0_0_1px_rgba(255,255,255,0.18)]`} />
          ))}
        </div>
      </div>
      <div className="absolute bottom-[-1px] left-1/2 h-1 w-3 -translate-x-[120%] rounded-full bg-slate-700" />
      <div className="absolute bottom-[-1px] left-1/2 h-1 w-3 translate-x-[20%] rounded-full bg-slate-700" />
    </div>
  );
}

export function AnalysisChat({ analysisId, analysisStatus }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { toast } = useToast();

  // Load history
  useEffect(() => {
    if (analysisStatus !== "completed") return;
    fetch(`${getApiUrl()}/api/analyses/${analysisId}/chat`, {
      credentials: "include",
    })
      .then(r => r.json())
      .then(d => {
        if (d.messages) setMessages(d.messages);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [analysisId, analysisStatus]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isStreaming) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsStreaming(true);

    const assistantId = crypto.randomUUID();
    setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "" }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(`${getApiUrl()}/api/analyses/${analysisId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: text }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error("Erreur serveur");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error("Stream non disponible");

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) {
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, content: m.content + data.content } : m
              ));
            }
            if (data.done) break;
            if (data.error) throw new Error(data.error);
          } catch {}
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      toast({ title: "Erreur", description: "Impossible d'obtenir une réponse. Réessayez.", variant: "destructive" });
      setMessages(prev => prev.filter(m => m.id !== assistantId));
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  if (analysisStatus !== "completed") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="w-10 h-10 mb-4 opacity-30 animate-spin" />
        <p className="text-center">L'assistant IA sera disponible une fois l'analyse complétée.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-340px)] min-h-[500px]">
      {/* Header */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-start gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-100 via-white to-sky-100 border border-primary/15 flex items-center justify-center flex-shrink-0 shadow-sm">
          <BuildingBotAvatar />
        </div>
        <div>
          <p className="font-semibold text-primary">Assistant HEUREKA IA</p>
          <p className="text-sm text-muted-foreground">
            Posez vos questions sur la faisabilite de votre projet. L'IA croise cette analyse avec les documents disponibles et cite les elements factuels utilises.
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.length === 0 && loaded && (
          <div>
            <p className="text-sm text-muted-foreground mb-4 text-center">Démarrez la conversation ou choisissez une question :</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SUGGESTED_QUESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="text-left text-sm px-4 py-3 rounded-xl border border-border bg-card hover:bg-primary/5 hover:border-primary/30 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === "user" ? "bg-primary/10" : "bg-primary"}`}>
              {msg.role === "user"
                ? <User className="w-4 h-4 text-primary" />
                : <BuildingBotAvatar compact className="scale-[0.95]" />
              }
            </div>
            <div className={`flex-1 max-w-[85%] ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col`}>
              <Card className={`${msg.role === "user" ? "bg-primary text-white border-primary" : "bg-card"}`}>
                <CardContent className="px-4 py-3">
                  {msg.content
                    ? <div className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                    : <Loader2 className="w-4 h-4 animate-spin opacity-50" />
                  }
                </CardContent>
              </Card>
            </div>
          </div>
        ))}
        <div ref={scrollRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2 items-end border border-border rounded-xl p-3 bg-card">
        <Textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Posez votre question sur ce projet foncier..."
          className="flex-1 resize-none border-0 shadow-none focus-visible:ring-0 p-0 min-h-[48px] max-h-[120px] bg-transparent"
          rows={1}
          disabled={isStreaming}
        />
        <div className="flex flex-col gap-2">
          {isStreaming && (
            <Button type="button" variant="outline" size="icon" className="w-10 h-10"
              onClick={() => { abortRef.current?.abort(); setIsStreaming(false); }}>
              <RotateCcw className="w-4 h-4" />
            </Button>
          )}
          <Button type="submit" size="icon" className="w-10 h-10" disabled={!input.trim() || isStreaming}>
            {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </form>
      <p className="text-xs text-muted-foreground text-center">
        L'IA s'appuie sur les donnees de cette analyse et doit citer ses appuis factuels. Les reponses restent indicatives et doivent etre confirmees par les services d'urbanisme.
      </p>
    </div>
  );
}
