import { Globe2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Card, CardTitle, EmptyState, ErrorNote, PageHeader, Spinner } from "@/components/common";
import { Button } from "@/components/ui/button";
import { ContactListItem } from "@/features/contacts/ContactListItem";
import { errorMessage } from "@/lib/api";
import { MAP_DIMENSION_LABELS } from "@/lib/labels";
import { useCountryDetail, useMapData } from "@/lib/queries";
import type { MapDimension } from "@/lib/types";
import { cn } from "@/lib/utils";
import { NO_DATA_COLOR, buildClasses, classLabel, colorFor } from "./colorScale";
import { WorldMap } from "./WorldMap";

const DIMENSIONS: MapDimension[] = ["residence", "nationality", "activity", "expertise", "interest"];

function Breakdown({ title, items }: { title: string; items: { name: string; count: number }[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">{title}</h3>
      <div className="flex flex-wrap gap-1.5">
        {items.map((i) => (
          <span key={i.name} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs">
            {i.name} <span className="text-muted-foreground tabular-nums">{i.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function CountryPanel({ dimension, code, onClose }: { dimension: MapDimension; code: string; onClose: () => void }) {
  const { data, isLoading, error } = useCountryDetail(dimension, code);
  return (
    <Card>
      {isLoading ? (
        <Spinner />
      ) : error || !data ? (
        <ErrorNote message={errorMessage(error)} />
      ) : (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">{data.name}</h2>
              <p className="text-sm text-muted-foreground">
                {data.count} {data.count === 1 ? "Kontakt" : "Kontakte"} · {MAP_DIMENSION_LABELS[dimension]}
              </p>
            </div>
            <Button variant="ghost" size="icon" className="size-8" onClick={onClose} aria-label="Auswahl schließen">
              <X className="size-4" />
            </Button>
          </div>
          {data.count === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Kontakte mit {MAP_DIMENSION_LABELS[dimension]} {data.name}.</p>
          ) : (
            <>
              <Breakdown title="Berufe" items={data.professions} />
              <Breakdown title="Unternehmen" items={data.companies} />
              <Breakdown title="Expertise" items={data.expertise} />
              <ul className="-mx-2 divide-y divide-border/70 border-t border-border pt-1">
                {data.contacts.map((c) => (
                  <li key={c.id}>
                    <ContactListItem contact={c} compact aside={<span />} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

export function WorldMapPage() {
  const [dimension, setDimension] = useState<MapDimension>("residence");
  const [selected, setSelected] = useState<string | null>(null);
  const { data, isLoading, error } = useMapData(dimension);
  const classes = useMemo(() => buildClasses(data?.max_count ?? 0), [data?.max_count]);

  return (
    <div>
      <PageHeader title="Weltkarte" subtitle="Wo dein Netzwerk zu Hause ist – und wofür es steht." />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground" id="dim-label">
          Kontakte anzeigen nach:
        </span>
        <div className="inline-flex flex-wrap rounded-lg border border-border bg-card p-0.5" role="radiogroup" aria-labelledby="dim-label">
          {DIMENSIONS.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={dimension === d}
              onClick={() => setDimension(d)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                dimension === d ? "bg-brand font-medium text-white" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {MAP_DIMENSION_LABELS[d]}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <ErrorNote message={errorMessage(error)} />
      ) : (
        <>
          <Card className="mb-5 p-3">
            {isLoading || !data ? (
              <Spinner />
            ) : (
              <>
                <WorldMap counts={data.countries} classes={classes} selected={selected} onSelect={setSelected} />
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-2 pt-2 text-xs text-muted-foreground" aria-label="Legende">
                  <span>Kontakte je Land:</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-3 rounded-sm border border-border" style={{ background: NO_DATA_COLOR }} />0
                  </span>
                  {classes.map((c) => (
                    <span key={c.min} className="inline-flex items-center gap-1.5">
                      <span className="size-3 rounded-sm" style={{ background: c.color }} />
                      {classLabel(c)}
                    </span>
                  ))}
                  <span className="ml-auto">Scrollen zum Zoomen · Ziehen zum Verschieben</span>
                </div>
              </>
            )}
          </Card>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            <Card>
              <CardTitle icon={Globe2}>
                Länder · {MAP_DIMENSION_LABELS[dimension]}
              </CardTitle>
              {data && data.countries.length === 0 ? (
                <EmptyState compact icon={Globe2} title="Noch keine Länderzuordnungen" description="Ordne Kontakten im Editor Länder zu." />
              ) : (
                <ul className="-mx-2 max-h-[28rem] overflow-y-auto">
                  {data?.countries.map((c) => (
                    <li key={c.code}>
                      <button
                        type="button"
                        onClick={() => setSelected(c.code)}
                        aria-pressed={selected === c.code}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-secondary/70",
                          selected === c.code && "bg-brand-light",
                        )}
                      >
                        <span className="size-3 shrink-0 rounded-sm" style={{ background: colorFor(c.count, classes) }} aria-hidden="true" />
                        <span className="flex-1 truncate">{c.name}</span>
                        <span className="font-medium tabular-nums">{c.count}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            {selected ? (
              <CountryPanel dimension={dimension} code={selected} onClose={() => setSelected(null)} />
            ) : (
              <Card>
                <EmptyState compact icon={Globe2} title="Land auswählen" description="Klicke auf ein Land in der Karte oder in der Liste, um die zugehörigen Kontakte zu sehen." />
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
