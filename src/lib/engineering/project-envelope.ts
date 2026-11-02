type SavedState = Record<string, unknown> & { projectId?: string; projectName?: string };
type SavedProject = { remote?: boolean; state?: SavedState; design?: unknown; savedAt?: number };
type WorkspaceState = SavedState & {
  projectId: string;
  projects?: SavedProject[];
  snapshots?: SavedProject[];
};
/** Split legacy workspace state without duplicating named projects or restore points. */
export function splitWorkspace(value: string) {
  const envelope = JSON.parse(value);
  const state = envelope.state as WorkspaceState;
  if (!state || typeof state.projectId !== "string") throw new Error("Invalid project state.");
  const timestamps = new Map<string, number>();
  const records = new Map<string, { id: string; name: string; payload: string }>();
  const add = (id: string, s: SavedState, time = 0) => {
    if ((timestamps.get(id) ?? -1) > time) return;
    timestamps.set(id, time);
    const clean: SavedState = {
      ...s,
      projectId: id,
      projects: [],
      snapshots: (state.snapshots ?? []).filter((x: SavedProject) => x.state?.projectId === id),
    };
    records.set(id, {
      id,
      name: String(s.projectName ?? "Untitled project").slice(0, 160),
      payload: JSON.stringify({ ...envelope, state: clean }),
    });
  };
  for (const saved of state.projects ?? [])
    if (!saved.remote && saved.state?.projectId)
      add(
        saved.state.projectId,
        { ...saved.state, customs: saved.design ? [saved.design] : [], chat: [], snapshots: [] },
        saved.savedAt ?? 0,
      );
  for (const saved of state.snapshots ?? [])
    if (saved.state?.projectId && saved.state.projectId !== state.projectId)
      add(
        saved.state.projectId,
        { ...saved.state, customs: saved.design ? [saved.design] : [], chat: [], snapshots: [] },
        saved.savedAt ?? 0,
      );
  records.delete(state.projectId);
  add(state.projectId, state, Number.MAX_SAFE_INTEGER);
  return { activeId: state.projectId as string, records: [...records.values()] };
}
