import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BookOpen,
  Download,
  ImagePlus,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLab } from "@/lib/lab-store";
import type { NotebookEntry } from "@/lib/engineering/types";
import {
  MAX_NOTEBOOK_PHOTO_CHARS,
  MAX_PHOTO_BYTES,
  measurementDelta,
  reportHtml,
  reportMarkdown,
  requirementStatus,
  safePhoto,
} from "@/lib/engineering/report";

const field =
  "min-h-11 w-full rounded-md border border-line bg-hangar px-3 py-2 text-sm text-paper outline-none focus:border-cyan";
const newId = () => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
function blankEntry(): NotebookEntry {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
  return {
    id: newId(),
    date: localDate,
    title: "",
    kind: "experiment",
    procedure: "",
    predicted: null,
    measured: null,
    unit: "",
    notes: "",
    photos: [],
  };
}

async function photoFromFile(file: File): Promise<{ name: string; dataUrl: string }> {
  if (file.size > 12_000_000) throw new Error("Choose a photo smaller than 12 MB.");
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp =
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (
    !(png && file.type === "image/png") &&
    !(jpeg && file.type === "image/jpeg") &&
    !(webp && file.type === "image/webp")
  )
    throw new Error("Choose a PNG, JPEG, or WebP photo.");
  let photoBlob: Blob = file;
  if (file.size > MAX_PHOTO_BYTES) {
    const bitmap = await createImageBitmap(file);
    try {
      const canvas = document.createElement("canvas");
      let scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
      for (let pass = 0; pass < 6; pass++) {
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not prepare this photo.");
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        photoBlob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error("Could not resize this photo."))),
            "image/webp",
            0.8,
          ),
        );
        if (photoBlob.size <= MAX_PHOTO_BYTES) break;
        scale *= 0.75;
      }
    } finally {
      bitmap.close();
    }
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("The photo could not be read. Try another file."));
    reader.readAsDataURL(photoBlob);
  });
  if (!safePhoto(dataUrl))
    throw new Error(
      "The photo could not be attached safely. Choose a smaller PNG, JPEG, or WebP file.",
    );
  return { name: file.name.slice(0, 150), dataUrl };
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function NotebookBench() {
  const engineering = useLab((s) => s.engineering);
  const projectName = useLab((s) => s.projectName);
  const projectNotes = useLab((s) => s.notes);
  const patchEngineering = useLab((s) => s.patchEngineering);
  const [draft, setDraft] = useState<NotebookEntry>(blankEntry);
  const [editing, setEditing] = useState(false);
  const [linkedRequirement, setLinkedRequirement] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploading, setUploading] = useState(false);
  const [removed, setRemoved] = useState<NotebookEntry | null>(null);
  const [chartUnit, setChartUnit] = useState("");
  const entries = engineering.notebook;
  const canUndoRemove =
    removed !== null &&
    entries.length < 100 &&
    !entries.some((entry) => entry.id === removed.id) &&
    [...entries, removed].reduce(
      (sum, entry) => sum + entry.photos.reduce((count, photo) => count + photo.dataUrl.length, 0),
      0,
    ) <= MAX_NOTEBOOK_PHOTO_CHARS;
  const patch = (value: Partial<NotebookEntry>) =>
    setDraft((current) => ({ ...current, ...value }));
  const comparisonEntries = entries.filter((entry) => measurementDelta(entry) !== null);
  const units = [...new Set(comparisonEntries.map((entry) => entry.unit.trim() || "unitless"))];
  const unit = units.includes(chartUnit) ? chartUnit : (units[0] ?? "");
  const chartData = useMemo(
    () =>
      comparisonEntries
        .filter((entry) => (entry.unit.trim() || "unitless") === unit)
        .slice(-12)
        .map((entry) => ({
          name: entry.title.length > 20 ? entry.title.slice(0, 18) + "…" : entry.title,
          predicted: entry.predicted,
          measured: entry.measured,
        })),
    [comparisonEntries, unit],
  );
  const slug =
    projectName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "project";

  const save = () => {
    setError("");
    if (editing && !entries.some((entry) => entry.id === draft.id)) {
      setError(
        "This entry was removed. Undo its removal before saving the edit, or start a new entry.",
      );
      return;
    }
    if (!draft.title.trim()) {
      setError("Give this entry a title before saving.");
      return;
    }
    if (!draft.date || !/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) {
      setError("Choose a valid entry date.");
      return;
    }
    if (!editing && entries.length >= 100) {
      setError(
        "This project has 100 notebook entries. Export a report and start a new project for additional records.",
      );
      return;
    }
    const saved: NotebookEntry = {
      ...draft,
      title: draft.title.trim(),
      unit: draft.unit.trim(),
      photos: draft.photos.filter((photo) => safePhoto(photo.dataUrl)),
    };
    const next = editing
      ? entries.map((entry) => (entry.id === saved.id ? saved : entry))
      : [...entries, saved];
    if (
      next.reduce(
        (sum, entry) =>
          sum + entry.photos.reduce((count, photo) => count + photo.dataUrl.length, 0),
        0,
      ) > MAX_NOTEBOOK_PHOTO_CHARS
    ) {
      setError(
        "This project's photos exceed the 2 MB storage budget. Remove a photo before saving.",
      );
      return;
    }
    let mission = engineering.mission;
    if (linkedRequirement) {
      const requirement = mission.requirements.find((item) => item.id === linkedRequirement);
      if (!requirement) {
        setError(
          "The linked requirement no longer exists. Choose another requirement or save without a link.",
        );
        return;
      }
      if (saved.measured === null) {
        setError(
          "Record a measured or analyzed result before linking this entry to a requirement.",
        );
        return;
      }
      if (requirement.unit.trim().toLowerCase() !== saved.unit.toLowerCase()) {
        setError(
          `The result unit must match the requirement unit (${requirement.unit || "unitless"}). Convert the value first; units are not converted automatically.`,
        );
        return;
      }
      mission = {
        ...mission,
        requirements: mission.requirements.map((item) =>
          item.id === linkedRequirement
            ? {
                ...item,
                actual: saved.measured,
                evidence:
                  `Notebook ${saved.id}: ${saved.title} (${saved.date}). ${saved.procedure}`.slice(
                    0,
                    2000,
                  ),
              }
            : item,
        ),
      };
    }
    patchEngineering({ notebook: next, mission });
    setDraft(blankEntry());
    setEditing(false);
    setLinkedRequirement("");
    setNotice("Notebook entry saved in this project.");
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setError("");
    setUploading(true);
    try {
      if (draft.photos.length + files.length > 3)
        throw new Error("Attach up to three photos per entry.");
      const photos = await Promise.all(Array.from(files).map(photoFromFile));
      const otherPhotoChars = entries
        .filter((entry) => entry.id !== draft.id)
        .reduce(
          (sum, entry) =>
            sum + entry.photos.reduce((count, photo) => count + photo.dataUrl.length, 0),
          0,
        );
      const draftPhotoChars = [...draft.photos, ...photos].reduce(
        (sum, photo) => sum + photo.dataUrl.length,
        0,
      );
      if (otherPhotoChars + draftPhotoChars > MAX_NOTEBOOK_PHOTO_CHARS)
        throw new Error(
          "This project's photos exceed the 2 MB browser-storage budget. Use fewer or smaller photos.",
        );
      setDraft((current) => ({ ...current, photos: [...current.photos, ...photos] }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The photos could not be attached.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-3">
      <div className="min-w-0 space-y-4 xl:col-span-2">
        <section
          className="rounded-xl border border-line bg-panel p-4 sm:p-6"
          aria-labelledby="notebook-editor-heading"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2
                id="notebook-editor-heading"
                className="flex items-center gap-2 text-base font-semibold"
              >
                <BookOpen className="size-4 text-cyan" aria-hidden />
                {editing ? "Edit notebook entry" : "Record an experiment or decision"}
              </h2>
              <p className="mt-1 text-sm text-dust">
                Keep predictions, measurements, failures, and design reasoning with the project.
              </p>
            </div>
            {editing && (
              <Button
                onClick={() => {
                  setDraft(blankEntry());
                  setEditing(false);
                  setLinkedRequirement("");
                  setError("");
                }}
              >
                <Plus className="size-4" aria-hidden />
                New entry
              </Button>
            )}
          </div>
          <form
            className="mt-5"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <label htmlFor="notebook-title" className="block text-sm font-medium">
              Entry title
              <input
                id="notebook-title"
                value={draft.title}
                onChange={(event) => patch({ title: event.target.value })}
                maxLength={180}
                placeholder="Leg-load test at full extension"
                className={`${field} mt-2`}
              />
            </label>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Date
                <input
                  type="date"
                  value={draft.date}
                  onChange={(event) => patch({ date: event.target.value })}
                  className={`${field} mt-2`}
                  aria-label="Notebook date"
                />
              </label>
              <label className="block text-sm font-medium">
                Entry type
                <select
                  value={draft.kind}
                  onChange={(event) => patch({ kind: event.target.value as NotebookEntry["kind"] })}
                  className={`${field} mt-2`}
                  aria-label="Entry type"
                >
                  <option value="experiment">Experiment / test</option>
                  <option value="decision">Design decision</option>
                  <option value="failure">Failure investigation</option>
                  <option value="revision">Revision</option>
                </select>
              </label>
            </div>
            <label htmlFor="notebook-procedure" className="mt-4 block text-sm font-medium">
              Procedure, conditions, and equipment
              <textarea
                id="notebook-procedure"
                value={draft.procedure}
                onChange={(event) => patch({ procedure: event.target.value })}
                rows={4}
                maxLength={8000}
                placeholder="Describe the setup, component revision, supply voltage, load, measurement tools, and steps…"
                className={`${field} mt-2 resize-y`}
              />
            </label>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <MeasurementInput
                label="Predicted value"
                value={draft.predicted}
                onChange={(predicted) => patch({ predicted })}
              />
              <MeasurementInput
                label="Measured / analyzed value"
                value={draft.measured}
                onChange={(measured) => patch({ measured })}
              />
              <label className="col-span-2 block text-sm font-medium sm:col-span-1">
                Unit
                <input
                  value={draft.unit}
                  onChange={(event) => patch({ unit: event.target.value })}
                  maxLength={30}
                  placeholder="N·m, g, min…"
                  aria-label="Measurement unit"
                  className={`${field} mt-2`}
                />
              </label>
            </div>
            {measurementDelta(draft) && (
              <p className="mt-3 rounded-md border border-line bg-hangar p-3 text-sm text-dust">
                Measured − predicted:{" "}
                <strong className="font-mono text-paper">
                  {measurementDelta(draft)!.difference.toFixed(3)} {draft.unit}
                </strong>
                {measurementDelta(draft)!.percent === null
                  ? "; percentage is undefined for a zero prediction."
                  : ` (${measurementDelta(draft)!.percent!.toFixed(1)}%).`}
              </p>
            )}
            <label htmlFor="notebook-notes" className="mt-4 block text-sm font-medium">
              Observations and next action
              <textarea
                id="notebook-notes"
                value={draft.notes}
                onChange={(event) => patch({ notes: event.target.value })}
                rows={3}
                maxLength={8000}
                placeholder="What differed from the prediction? What will you change or test next?"
                className={`${field} mt-2 resize-y`}
              />
            </label>
            {engineering.mission.requirements.length > 0 && (
              <label className="mt-4 block text-sm font-medium">
                Use this result as requirement evidence
                <select
                  value={linkedRequirement}
                  onChange={(event) => setLinkedRequirement(event.target.value)}
                  className={`${field} mt-2`}
                  aria-label="Link requirement"
                >
                  <option value="">Save without linking a requirement</option>
                  {engineering.mission.requirements.map((requirement, index) => (
                    <option key={requirement.id} value={requirement.id}>
                      R{index + 1}: {requirement.text || "Untitled requirement"} (
                      {requirement.unit || "unitless"})
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs font-normal text-dust">
                  A linked result must use the same unit. The recorded value and this entry
                  reference will be saved to the requirement.
                </span>
              </label>
            )}
            <div className="mt-4 rounded-lg border border-line p-3">
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
                <ImagePlus className="size-4 text-cyan" aria-hidden />
                {uploading ? "Reading photos…" : "Attach test photos"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  disabled={uploading || draft.photos.length >= 3}
                  onChange={(event) => {
                    void addPhotos(event.target.files);
                    event.target.value = "";
                  }}
                  className="min-w-0 max-w-full flex-1 text-xs file:mr-2 file:rounded-md file:border file:border-line file:bg-hangar file:px-2 file:py-2 file:text-paper"
                  aria-label="Attach test photos"
                />
              </label>
              <p className="mt-1 text-xs text-dust">
                PNG, JPEG or WebP up to 12 MB; large photos are resized automatically. Three photos
                per entry. Photos stay in the project and exported report.
              </p>
              {draft.photos.length > 0 && (
                <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {draft.photos.map((photo, index) => (
                    <li
                      key={`${photo.name}-${index}`}
                      className="min-w-0 rounded-md border border-line bg-hangar p-2"
                    >
                      <img
                        src={photo.dataUrl}
                        alt={photo.name}
                        className="h-24 w-full rounded object-contain"
                      />
                      <Button
                        variant="ghost"
                        className="mt-1 w-full"
                        onClick={() =>
                          patch({
                            photos: draft.photos.filter((_, photoIndex) => photoIndex !== index),
                          })
                        }
                        aria-label={`Remove photo ${photo.name}`}
                      >
                        <X className="size-4" aria-hidden />
                        <span className="truncate text-xs">Remove photo</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {error && (
              <p
                role="alert"
                className="mt-4 rounded-md border border-magenta p-3 text-sm text-magenta"
              >
                {error}
              </p>
            )}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-dust">
                {editing
                  ? "Changes replace the selected entry when saved."
                  : "Drafts are added to the notebook when saved."}
              </p>
              <Button type="submit" variant="primary" disabled={uploading}>
                <Save className="size-4" aria-hidden />
                {editing ? "Save changes" : "Save entry"}
              </Button>
            </div>
          </form>
          {notice && (
            <p role="status" className="mt-3 text-sm text-cyan">
              {notice}
            </p>
          )}
        </section>
        <section
          className="rounded-xl border border-line bg-panel p-4 sm:p-6"
          aria-labelledby="notebook-records-heading"
        >
          <h2 id="notebook-records-heading" className="text-base font-semibold">
            Project records <span className="text-dust">({entries.length})</span>
          </h2>
          {entries.length === 0 ? (
            <p className="mt-3 text-sm text-dust">
              No entries yet. Record an initial prediction, then return with measured results.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {[...entries].reverse().map((entry) => {
                const delta = measurementDelta(entry);
                return (
                  <details key={entry.id} className="rounded-lg border border-line bg-hangar p-4">
                    <summary className="min-h-11 cursor-pointer">
                      <span className="block text-sm font-semibold">{entry.title}</span>
                      <span className="mt-1 block text-xs text-dust">
                        {entry.date} · {entry.kind} · {entry.photos.length} photo
                        {entry.photos.length === 1 ? "" : "s"}
                      </span>
                    </summary>
                    <div className="mt-3 border-t border-line pt-3">
                      <p className="whitespace-pre-wrap break-words text-sm">{entry.procedure}</p>
                      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <dt className="text-xs text-dust">Predicted</dt>
                          <dd className="mt-1 font-mono">
                            {entry.predicted ?? "Not recorded"} {entry.unit}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-dust">Measured / analyzed</dt>
                          <dd className="mt-1 font-mono">
                            {entry.measured ?? "Not recorded"} {entry.unit}
                          </dd>
                        </div>
                      </dl>
                      {delta && (
                        <p className="mt-3 text-xs text-dust">
                          Difference: {delta.difference.toFixed(3)} {entry.unit}
                          {delta.percent === null
                            ? "; percentage undefined at zero prediction."
                            : ` (${delta.percent.toFixed(1)}%).`}
                        </p>
                      )}
                      <p className="mt-3 whitespace-pre-wrap break-words text-sm text-dust">
                        {entry.notes}
                      </p>
                      {entry.photos.length > 0 && (
                        <div className="mt-3 grid gap-3 sm:grid-cols-3">
                          {entry.photos
                            .filter((photo) => safePhoto(photo.dataUrl))
                            .map((photo, index) => (
                              <figure key={index}>
                                <img
                                  src={photo.dataUrl}
                                  alt={photo.name}
                                  className="h-36 w-full rounded-md object-contain"
                                />
                                <figcaption className="mt-1 break-words text-xs text-dust">
                                  {photo.name}
                                </figcaption>
                              </figure>
                            ))}
                        </div>
                      )}
                      <p className="mt-3 break-all font-mono text-xs text-dust">
                        Reference: {entry.id}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          onClick={() => {
                            setDraft({ ...entry, photos: [...entry.photos] });
                            setEditing(true);
                            setLinkedRequirement("");
                            setError("");
                            setNotice("");
                            document
                              .querySelector("#notebook-editor-heading")
                              ?.scrollIntoView({ behavior: "smooth", block: "start" });
                          }}
                        >
                          <Pencil className="size-4" aria-hidden />
                          Edit entry
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setRemoved(entry);
                            patchEngineering({
                              notebook: entries.filter((item) => item.id !== entry.id),
                            });
                          }}
                          aria-label={`Remove notebook entry ${entry.title}`}
                        >
                          <Trash2 className="size-4" aria-hidden />
                          Remove
                        </Button>
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          )}
          {removed && (
            <div
              className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-line p-3"
              role="status"
            >
              <p className="text-sm text-dust">Entry removed.</p>
              <Button
                disabled={!canUndoRemove}
                onClick={() => {
                  if (!canUndoRemove) return;
                  patchEngineering({ notebook: [...entries, removed] });
                  setRemoved(null);
                }}
              >
                <RotateCcw className="size-4" aria-hidden />
                Undo remove
              </Button>
            </div>
          )}
        </section>
      </div>
      <aside className="min-w-0 space-y-4">
        <section className="rounded-xl border border-line bg-panel p-4 sm:p-5">
          <h2 className="text-base font-semibold">Project report</h2>
          <p className="mt-2 text-sm text-dust">
            Export the mission, verification evidence, calculation inputs, notebook records,
            attached photos, and existing project notes.
          </p>
          <div className="mt-4 grid gap-2">
            <Button
              variant="primary"
              onClick={() =>
                download(
                  `${slug}-engineering-report.md`,
                  reportMarkdown(projectName, engineering, projectNotes),
                  "text/markdown",
                )
              }
            >
              <Download className="size-4" aria-hidden />
              Export Markdown report
            </Button>
            <Button
              onClick={() =>
                download(
                  `${slug}-engineering-report.html`,
                  reportHtml(projectName, engineering, projectNotes),
                  "text/html",
                )
              }
            >
              <Download className="size-4" aria-hidden />
              Export printable HTML
            </Button>
          </div>
          <p className="mt-3 text-xs text-dust">
            The HTML file includes a Print / save PDF control. Exported reports include saved
            entries; save the current draft first.
          </p>
          <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-dust">Requirements with evidence</dt>
              <dd className="font-mono">
                {
                  engineering.mission.requirements.filter(
                    (requirement) => requirementStatus(requirement) === "met",
                  ).length
                }{" "}
                / {engineering.mission.requirements.length}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-dust">Recorded comparisons</dt>
              <dd className="font-mono">{comparisonEntries.length}</dd>
            </div>
          </dl>
        </section>
        <section
          className="rounded-xl border border-line bg-panel p-4 sm:p-5"
          aria-labelledby="comparison-heading"
        >
          <h2 id="comparison-heading" className="text-base font-semibold">
            Prediction vs result
          </h2>
          <p className="mt-1 text-xs text-dust">
            The latest 12 comparisons for one unit at a time. Different units are never plotted on
            the same axis.
          </p>
          {units.length > 0 ? (
            <>
              <label className="mt-3 block text-xs text-dust">
                Comparison unit
                <select
                  value={unit}
                  onChange={(event) => setChartUnit(event.target.value)}
                  className={`${field} mt-1`}
                  aria-label="Comparison unit"
                >
                  {units.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <div
                className="mt-4 h-64 min-w-0"
                role="img"
                aria-label={`Predicted and measured values in ${unit}`}
              >
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={chartData} margin={{ top: 8, right: 4, bottom: 20, left: -12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
                    <XAxis
                      dataKey="name"
                      fontSize={10}
                      tick={{ fill: "var(--color-dust)" }}
                      interval={0}
                      angle={-25}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis fontSize={10} tick={{ fill: "var(--color-dust)" }} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-panel)",
                        borderColor: "var(--color-line)",
                        color: "var(--color-paper)",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar name="Predicted" dataKey="predicted" fill="var(--color-dust)" />
                    <Bar name="Measured" dataKey="measured" fill="var(--color-cyan)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-3 space-y-2 text-xs text-dust">
                {chartData.map((item, index) => (
                  <li key={index} className="border-t border-line pt-2">
                    <span className="block font-medium text-paper">{item.name}</span>Predicted{" "}
                    {item.predicted}; measured {item.measured} {unit}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-4 rounded-md border border-line bg-hangar p-4 text-sm text-dust">
              Save an entry with both a predicted and measured value to compare them here.
            </p>
          )}
        </section>
      </aside>
    </div>
  );
}

function MeasurementInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        type="number"
        step="any"
        value={value ?? ""}
        onChange={(event) => {
          const next = event.target.value === "" ? null : Number(event.target.value);
          if (next === null || Number.isFinite(next)) onChange(next);
        }}
        aria-label={label}
        placeholder="Not recorded"
        className={`${field} mt-2 font-mono`}
      />
    </label>
  );
}
