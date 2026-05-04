import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

async function apiFetch(path: string, options: RequestInit = {}) {
  const response = await fetch(path, { credentials: "include", ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || payload.error || "Chargement impossible");
  return payload;
}

export function ZoneDetail({ zoneId }: { zoneId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<any>({
    queryKey: ["reglement-zone-detail", zoneId],
    queryFn: () => apiFetch(`/api/reglement/zones/${zoneId}`),
  });
  const validateMutation = useMutation({
    mutationFn: () => apiFetch(`/api/reglement/zones/${zoneId}/validate`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reglement-zone-detail", zoneId] });
      toast({ title: "Zone validée" });
    },
    onError: (err: any) => toast({ title: "Validation impossible", description: err.message, variant: "destructive" }),
  });

  if (isLoading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement de la zone...</div>;
  }
  if (!data?.zone) return null;

  const rules = data.rules || [];
  const controls = data.controls || [];
  const documents = data.documents || [];
  const articleNumbers = Array.from({ length: 13 }, (_, index) => index + 1);

  return (
    <div className="space-y-4">
      <Card className="border-primary/10 shadow-sm">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Zone {data.zone.zoneCode}</CardTitle>
              <CardDescription>{data.zone.zoneLabel || data.zone.summary || "Zone réglementaire"}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={data.zone.status === "validated" ? "default" : "secondary"}>{data.zone.status === "validated" ? "validée" : "brouillon"}</Badge>
              <Button disabled={validateMutation.isPending || data.zone.status === "validated"} onClick={() => validateMutation.mutate()}>
                {validateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Valider la zone
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{data.zone.summary || data.zone.guidanceNotes || "Aucun résumé validé."}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{rules.length} règle(s)</Badge>
            <Badge variant="outline">{controls.length} contrôle(s)</Badge>
            <Badge variant="outline">{documents.length} source(s)</Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/10 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Articles 1 à 13</CardTitle>
          <CardDescription>Règles importées et contrôles générés par article.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {articleNumbers.map((articleNumber) => {
            const articleRules = rules.filter((rule: any) => rule.articleNumber === articleNumber);
            const articleControls = controls.filter((control: any) => String(control.sourceArticle || "").includes(String(articleNumber)));
            return (
              <div key={articleNumber} className="rounded-lg border bg-background p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">Article {articleNumber}</p>
                  <Badge variant={articleRules.length ? "secondary" : "outline"}>{articleRules.length} règle(s)</Badge>
                </div>
                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                  {articleRules[0]?.ruleText || "Aucune règle structurée pour cet article."}
                </p>
                {articleControls.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {articleControls.slice(0, 3).map((control: any) => <Badge key={control.id} variant="outline">{control.controlType}</Badge>)}
                  </div>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="border-primary/10 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Documents sources</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {documents.length > 0 ? documents.map((document: any) => (
            <div key={document.id} className="rounded-lg border bg-muted/20 p-3 text-sm">
              {document.title || document.fileName || "Document"} · {document.documentType || "source"}
            </div>
          )) : <p className="text-sm text-muted-foreground">Aucun document source rattaché.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
