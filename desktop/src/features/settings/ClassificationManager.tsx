import { Check, Merge, Pencil, Plus, Tags, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardTitle, ConfirmDialog, Field } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { del, errorMessage, patch, post } from "@/lib/api";
import { CLASSIFICATION_LABELS } from "@/lib/labels";
import { useCategories, useInvalidateAll, useManagedClassifications } from "@/lib/queries";
import { fold } from "@/lib/text";
import type { ClassificationKind, ManagedClassification } from "@/lib/types";

function useRun() {
  const invalidate = useInvalidateAll();
  return async (fn: () => Promise<unknown>, success?: string) => {
    try {
      await fn();
      invalidate();
      if (success) toast.success(success);
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    }
  };
}

function Row({ item, all }: { item: ManagedClassification; all: ManagedClassification[] }) {
  const run = useRun();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(item.name);
  const [alias, setAlias] = useState("");
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<string>("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <li className="space-y-1.5 px-3 py-2.5">
      <div className="flex items-center gap-2">
        {renaming ? (
          <form
            className="flex flex-1 gap-1"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run(() => patch(`/api/classifications/${item.id}`, { name }), "Umbenannt.")) setRenaming(false);
            }}
          >
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
            <Button type="submit" size="icon" className="size-8" aria-label="Speichern">
              <Check className="size-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => setRenaming(false)} aria-label="Abbrechen">
              <X className="size-4" />
            </Button>
          </form>
        ) : (
          <>
            <span className="flex-1 font-medium">{item.name}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {item.contact_count} Kontakte{item.interaction_count ? ` · ${item.interaction_count} Interaktionen` : ""}
            </span>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => { setName(item.name); setRenaming(true); }} aria-label={`${item.name} umbenennen`}>
              <Pencil className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => setMergeOpen(true)} aria-label={`${item.name} zusammenführen`} disabled={all.length < 2}>
              <Merge className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="size-7 text-red-600" onClick={() => setConfirmDelete(true)} aria-label={`${item.name} löschen`}>
              <Trash2 className="size-3.5" />
            </Button>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pl-0.5">
        {item.aliases.map((a) => (
          <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-secondary py-0.5 pr-1 pl-2 text-xs">
            Synonym: {a.alias}
            <button type="button" className="rounded-full p-0.5 hover:bg-gray-200" onClick={() => void run(() => del(`/api/classification-aliases/${a.id}`))} aria-label={`Synonym ${a.alias} entfernen`}>
              <X className="size-3" />
            </button>
          </span>
        ))}
        <form
          className="inline-flex items-center gap-1"
          onSubmit={async (e) => {
            e.preventDefault();
            if (alias.trim() && (await run(() => post(`/api/classifications/${item.id}/aliases`, { alias }), "Synonym hinzugefügt."))) setAlias("");
          }}
        >
          <Input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="+ Synonym" className="h-6 w-32 px-2 text-xs" aria-label={`Synonym für ${item.name}`} />
        </form>
      </div>

      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>„{item.name}“ zusammenführen</DialogTitle>
            <DialogDescription>
              Alle Kontakte mit „{item.name}“ erhalten den Zielbegriff. „{item.name}“ wird als Synonym des Ziels gespeichert, damit die Suche
              weiterhin funktioniert.
            </DialogDescription>
          </DialogHeader>
          <Field label="Zusammenführen mit">
            <Select value={mergeTarget} onValueChange={setMergeTarget}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Zielbegriff wählen" />
              </SelectTrigger>
              <SelectContent>
                {all.filter((o) => o.id !== item.id).map((o) => (
                  <SelectItem key={o.id} value={String(o.id)}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeOpen(false)}>
              Abbrechen
            </Button>
            <Button
              disabled={!mergeTarget}
              onClick={async () => {
                if (await run(() => post(`/api/classifications/${item.id}/merge`, { target_id: Number(mergeTarget) }), "Zusammengeführt.")) setMergeOpen(false);
              }}
            >
              Zusammenführen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`„${item.name}“ löschen?`}
        description={`Der Begriff wird bei ${item.contact_count} Kontakten entfernt. Die Kontakte selbst bleiben erhalten.`}
        onConfirm={async () => {
          setConfirmDelete(false);
          await run(() => del(`/api/classifications/${item.id}`), "Gelöscht.");
        }}
      />
    </li>
  );
}

function CategoryManager() {
  const run = useRun();
  const categories = useCategories();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-border rounded-lg border border-border">
        {categories.data?.map((c) => (
          <li key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm">
            {editing?.id === c.id ? (
              <form
                className="flex flex-1 gap-1"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await run(() => patch(`/api/relationship-categories/${c.id}`, { name: editing.name }))) setEditing(null);
                }}
              >
                <Input autoFocus value={editing.name} onChange={(e) => setEditing({ id: c.id, name: e.target.value })} className="h-8" />
                <Button type="submit" size="icon" className="size-8" aria-label="Speichern">
                  <Check className="size-4" />
                </Button>
              </form>
            ) : (
              <>
                <span className="flex-1">{c.name}</span>
                <span className="text-xs text-muted-foreground">{c.contact_count} Kontakte</span>
                <Button variant="ghost" size="icon" className="size-7" onClick={() => setEditing({ id: c.id, name: c.name })} aria-label={`${c.name} umbenennen`}>
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-red-600"
                  onClick={() => void run(() => del(`/api/relationship-categories/${c.id}`), "Kategorie gelöscht – betroffene Kontakte behalten alle übrigen Angaben.")}
                  aria-label={`${c.name} löschen`}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (name.trim() && (await run(() => post("/api/relationship-categories", { name }), "Kategorie angelegt."))) setName("");
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Neue Beziehungskategorie" className="h-8" />
        <Button type="submit" size="sm" disabled={!name.trim()}>
          <Plus className="size-4" /> Anlegen
        </Button>
      </form>
    </div>
  );
}

export function ClassificationManager() {
  const [kind, setKind] = useState<ClassificationKind | "categories">("specialization");
  const [filter, setFilter] = useState("");
  const list = useManagedClassifications(kind === "categories" ? "tag" : kind);
  const items = useMemo(() => (list.data ?? []).filter((i) => !filter || fold(i.name).includes(fold(filter))), [list.data, filter]);

  return (
    <Card>
      <CardTitle icon={Tags}>Klassifikationen verwalten</CardTitle>
      <p className="mb-3 text-sm text-muted-foreground">
        Werte werden beim Speichern automatisch normalisiert („Steuerrecht“ = „steuerrecht “). Unterschiedliche Begriffe führst du hier bewusst zusammen
        oder hinterlegst Synonyme.
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        <Select value={kind} onValueChange={(v) => setKind(v as ClassificationKind | "categories")}>
          <SelectTrigger className="w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(CLASSIFICATION_LABELS) as ClassificationKind[]).map((k) => (
              <SelectItem key={k} value={k}>
                {CLASSIFICATION_LABELS[k]}
              </SelectItem>
            ))}
            <SelectItem value="categories">Beziehungskategorien</SelectItem>
          </SelectContent>
        </Select>
        {kind !== "categories" && <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtern …" className="w-48" />}
      </div>
      {kind === "categories" ? (
        <CategoryManager />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Einträge in dieser Kategorie.</p>
      ) : (
        <ul className="max-h-[28rem] divide-y divide-border overflow-y-auto rounded-lg border border-border text-sm">
          {items.map((item) => (
            <Row key={item.id} item={item} all={list.data ?? []} />
          ))}
        </ul>
      )}
    </Card>
  );
}
