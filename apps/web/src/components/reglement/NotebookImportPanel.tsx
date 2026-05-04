import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardCopy, Loader2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const NOTEBOOK_ZONE_IMPORT_PROMPT = "Analyse les documents d’urbanisme fournis comme un instructeur confirmé. Ta réponse doit être structurée par zones du PLU/PLUi. Pour chaque zone détectée, liste les articles 1 à 14, résume la règle applicable, identifie les valeurs chiffrées, conditions, exceptions, documents liés, renvois vers documents graphiques, servitudes, SPR, PPRI, OAP ou annexes. Sépare les règles propres à une zone des règles transversales. Signale les incertitudes, conflits de documents, règles absentes ou renvois nécessitant une lecture graphique. Termine par un tableau des contrôles réglementaires exploitables par zone : destination, implantation, hauteur, emprise, stationnement, aspect extérieur, espaces libres, risques, patrimoine et servitudes.";

async function apiFetch(path: string, options: RequestInit = {}) {
  const response = await fetch(path, { credentials: "include", ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || payload.error || "Import impossible");
  return payload;
}

export function NotebookImportPanel({
  commune,
  documents,
}: {
  commune: string;
  documents: Array<{ id: string; title?: string | null; fileName?: string | null }>;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [rawContent, setRawContent] = useState("");
  const [documentId, setDocumentId] = useState("__none__");
  const [source, setSource] = useState("notebook");

  const importMutation = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.set("commune", commune);
      form.set("source", source);
      form.set("rawContent", rawContent);
      if (documentId !== "__none__") form.set("documentId", documentId);
      const file = fileInputRef.current?.files?.[0];
      if (file) form.set("file", file);
      return apiFetch("/api/reglement/import-analysis", { method: "POST", body: form });
    },
    onSuccess: (payload: any) => {
      setRawContent("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["reglement-summary", commune] });
      queryClient.invalidateQueries({ queryKey: ["reglement-zones", commune] });
      queryClient.invalidateQueries({ queryKey: ["reg-calibration-zones", commune] });
      queryClient.invalidateQueries({ queryKey: ["reg-calibration-library", commune] });
      toast({
        title: "Analyse importée",
        description: payload?.fallbackLegacy
          ? "Aucune zone détectée : l'ancien système restera disponible en fallback."
          : `${payload?.extraction?.zoneCount || 0} zone(s), ${payload?.extraction?.ruleCount || 0} règle(s), ${payload?.extraction?.controlCount || 0} contrôle(s).`,
      });
    },
    onError: (err: any) => toast({ title: "Import impossible", description: err.message, variant: "destructive" }),
  });

  return (
    <Card className="border-primary/10 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UploadCloud className="h-4 w-4 text-primary" />
          Import manuel d'analyse réglementaire
        </CardTitle>
        <CardDescription>
          Colle une sortie NotebookLM ou importe un fichier texte. L'import crée une nouvelle version et ne remplace pas les zones déjà validées.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(NOTEBOOK_ZONE_IMPORT_PROMPT);
              toast({ title: "Prompt NotebookLM copié" });
            }}
          >
            <ClipboardCopy className="mr-2 h-4 w-4" />
            Copier le prompt NotebookLM
          </Button>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="notebook">NotebookLM</SelectItem>
              <SelectItem value="manual">Manuel</SelectItem>
              <SelectItem value="ia">IA interne</SelectItem>
            </SelectContent>
          </Select>
          <Select value={documentId} onValueChange={setDocumentId}>
            <SelectTrigger className="min-w-[240px]"><SelectValue placeholder="Document source" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Aucun document source</SelectItem>
              {documents.map((document) => (
                <SelectItem key={document.id} value={document.id}>
                  {document.title || document.fileName || "Document"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Textarea
          className="min-h-40"
          placeholder="Colle ici l'analyse structurée par zones..."
          value={rawContent}
          onChange={(event) => setRawContent(event.target.value)}
        />
        <input ref={fileInputRef} type="file" accept=".txt,.md,.json,text/plain,application/json" className="text-sm" />
        <Button
          disabled={commune === "all" || importMutation.isPending || (!rawContent.trim() && !fileInputRef.current?.files?.length)}
          onClick={() => importMutation.mutate()}
        >
          {importMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
          Importer et découper par zones
        </Button>
      </CardContent>
    </Card>
  );
}
