function formatDate(value?: string | Date | null) {
  if (!value) return "Non daté";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

export type InstructionTimelineEvent = {
  id: string | number;
  type?: string | null;
  description?: string | null;
  createdAt?: string | Date | null;
  metadata?: Record<string, any> | null;
};

export function InstructionTimeline({ events, dates }: { events: InstructionTimelineEvent[]; dates?: Array<{ label: string; value?: string | Date | null }> }) {
  return (
    <div className="space-y-5">
      {!!dates?.length && (
        <div className="grid gap-3 sm:grid-cols-3">
          {dates.map((date) => (
            <div key={date.label} className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{date.label}</p>
              <p className="mt-1 font-semibold">{formatDate(date.value)}</p>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-4">
        {events.length === 0 && <p className="text-sm text-slate-500">Aucun événement d'instruction pour le moment.</p>}
        {events.map((event) => (
          <div key={event.id} className="flex gap-3">
            <span className="mt-2 h-3 w-3 shrink-0 rounded-full bg-slate-900" />
            <div>
              <p className="font-semibold">{event.description || event.type || "Événement"}</p>
              <p className="text-sm text-slate-500">{formatDate(event.createdAt)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
