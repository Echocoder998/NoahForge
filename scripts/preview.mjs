#!/usr/bin/env node
/**
 * Owns :8081, the built-output QA preview.
 *
 * `vite preview` is strictPort, so a preview left over from an earlier turn
 * both fails the next start and keeps serving the previous build's output.
 * Linux owners come from /proc. Windows uses native TCP/process inspection,
 * and only terminates preview commands belonging to this workspace.
 *
 *   node scripts/preview.mjs stop|restart
 */
import { execFileSync, spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PREVIEW_PORT = 8081;
const PREVIEW_URL = `http://127.0.0.1:${PREVIEW_PORT}/`;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PID_FILE = join(ROOT, ".grok/preview.pid");
const LOG_FILE = join(ROOT, ".grok/preview.log");
const READY_TIMEOUT_MS = Number(process.env.PREVIEW_READY_TIMEOUT_MS || 60000);
const GRACE_MS = 3000;
const POLL_MS = 100;

export function parsePreviewArgs(argv) {
  const [action, ...rest] = argv;
  if (!action) return { error: "usage: node scripts/preview.mjs stop|restart" };
  if (rest.length > 0) return { error: `unexpected argument: ${rest[0]}` };
  if (!["stop", "restart"].includes(action)) {
    return { error: `unknown action: ${action} (expected stop or restart)` };
  }
  return { action };
}

export function parsePid(text) {
  const raw = String(text ?? "").trim();
  const pid = /^\d+$/.test(raw) ? Number(raw) : NaN;
  // pid 1 is the sandbox init — never the preview, and dangerous to signal.
  return Number.isSafeInteger(pid) && pid > 1 ? pid : null;
}

/** pgid of a process from its /proc/<pid>/stat line. */
export function parsePgid(stat) {
  const line = String(stat ?? "");
  // The comm field is parenthesised and may itself contain spaces; state, ppid
  // and pgrp are the three fields after it.
  const end = line.lastIndexOf(") ");
  if (end === -1) return null;
  const pgid = Number.parseInt(line.slice(end + 2).split(/\s+/)[2], 10);
  return Number.isInteger(pgid) && pgid > 0 ? pgid : null;
}

const TCP_LISTEN = "0A";

/** Socket inodes of the LISTEN sockets on `port` in a /proc/net/tcp{,6} dump. */
export function parseListenerInodes(procNetTcp, port) {
  const wanted = `:${port.toString(16).toUpperCase().padStart(4, "0")}`;
  const inodes = [];
  for (const line of String(procNetTcp ?? "").split("\n")) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 10 || cols[3] !== TCP_LISTEN || !cols[1].endsWith(wanted)) continue;
    if (/^\d+$/.test(cols[9])) inodes.push(cols[9]);
  }
  return inodes;
}

export function looksLikePreviewProcess(cmdline) {
  // /proc/<pid>/cmdline is NUL-separated.
  const argv = String(cmdline ?? "")
    .split("\0")
    .filter(Boolean)
    .join(" ");
  // The sandbox service runs scripts/preview-thumbnail.mjs in this box, and
  // this script can be running concurrently: neither is ever a target.
  if (/\bpreview[\w-]*\.mjs\b/.test(argv)) return false;
  // The `npm run preview` wrapper (`npm-cli.js run preview`) and its vite child.
  // `preview` must be the whole script name: `run preview:stop`/`preview:restart`
  // are this tooling's own wrappers, and `vite build --outDir preview-dist` is
  // not a server.
  return /\brun\s+preview(?:\s|$)/.test(argv) || /\bvite(?:\.js)?["']?\s+preview(?:\s|$)/.test(argv);
}

export function isWorkspacePreviewProcess(cmdline, root) {
  if (!looksLikePreviewProcess(cmdline)) return false;
  const normalize = (text) => String(text).replaceAll("\\", "/").toLowerCase();
  const command = normalize(cmdline);
  const base = normalize(root).replace(/\/+$/, "");
  return command.includes(`${base}/scripts/with-app-env.mjs`)
    || command.includes(`${base}/node_modules/vite/`);
}

export function previewCommand(platform, node, root) {
  return platform === "win32"
    ? { command: node, args: [join(root, "scripts/with-app-env.mjs"), "vite", "preview"] }
    : { command: "npm", args: ["run", "preview"] };
}

export function parseNetstatListeners(text, port) {
  const pids = new Set();
  for (const line of String(text).split(/\r?\n/)) {
    const fields = line.trim().split(/\s+/);
    if (fields[0] !== "TCP" || fields[3] !== "LISTENING" || !fields[1].endsWith(`:${port}`)) continue;
    const pid = parsePid(fields[4]);
    if (pid !== null) pids.add(pid);
  }
  return [...pids];
}

/**
 * Pids to signal. Port owners are owners by definition; the pidfile pid is only
 * a claim left by an earlier run — pids are re-used across hibernate/revive, so
 * signal it only when its command line still looks like the preview.
 */
export function previewOwners({ portPids, pidFilePid, cmdlineOf, verifyPortOwners = false, matches = looksLikePreviewProcess }) {
  const owners = new Set(portPids.filter((pid) => !verifyPortOwners || matches(cmdlineOf(pid))));
  if (
    pidFilePid !== null &&
    !owners.has(pidFilePid) &&
    matches(cmdlineOf(pidFilePid))
  ) {
    owners.add(pidFilePid);
  }
  return [...owners];
}

async function waitForExit(pids, { isAlive, sleep, timeoutMs, pollMs }) {
  let remaining = pids.filter((pid) => isAlive(pid));
  for (let waited = 0; remaining.length > 0 && waited < timeoutMs; waited += pollMs) {
    await sleep(pollMs);
    remaining = remaining.filter((pid) => isAlive(pid));
  }
  return remaining;
}

/**
 * SIGTERM every live pid, then SIGKILL whatever outlives the grace period.
 * Returns `{ signalled, killed, stubborn }` — `stubborn` is still alive after
 * the SIGKILL wait, which means the port is not reliably free.
 */
export async function terminatePids(
  pids,
  { kill, isAlive, sleep, graceMs = GRACE_MS, pollMs = POLL_MS },
) {
  const signalled = pids.filter((pid) => isAlive(pid));
  for (const pid of signalled) kill(pid, "SIGTERM");
  const killed = await waitForExit(signalled, { isAlive, sleep, timeoutMs: graceMs, pollMs });
  for (const pid of killed) kill(pid, "SIGKILL");
  const stubborn = await waitForExit(killed, { isAlive, sleep, timeoutMs: graceMs, pollMs });
  return { signalled, killed, stubborn };
}

/**
 * What `stop` reports. `after` is the post-kill port check: `unattributed: true`
 * means a listener exists whose pid could not be resolved, so it may not claim
 * the port is free.
 */
export function stopOutcome({ signalled, stubborn, after }) {
  const held = [...new Set([...stubborn, ...after.pids])];
  if (held.length > 0) {
    return { ok: false, error: `port ${PREVIEW_PORT} is still held by pid(s) ${held.join(", ")}` };
  }
  if (after.unattributed) {
    return {
      ok: false,
      error: `port ${PREVIEW_PORT} is held by a process this script cannot see`,
    };
  }
  const message =
    signalled.length > 0
      ? `stopped pid(s) ${signalled.join(", ")} — port ${PREVIEW_PORT} is free`
      : `nothing was listening on ${PREVIEW_PORT}`;
  return { ok: true, message };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === "EPERM";
  }
}

function pgidOf(pid) {
  try {
    return parsePgid(readFileSync(`/proc/${pid}/stat`, "utf8"));
  } catch {
    return null;
  }
}

function killPid(pid, signal) {
  // restart() detaches the server into its own process group, so signal the
  // group to reach `vite` under the `npm` wrapper. Only for a leader: `-pid` on
  // a pid that leads no group still reaches any unrelated group numbered pid.
  if (process.platform !== "win32" && pgidOf(pid) === pid) {
    try {
      process.kill(-pid, signal);
      return;
    } catch {
      // The group exited between the pgid read and the signal.
    }
  }
  try {
    process.kill(pid, signal);
  } catch {
    // Exited between the liveness check and the signal.
  }
}

function cmdlineOf(pid) {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, "utf8");
  } catch {
    // Usually a dead pid — the stale pidfile this corroboration exists for.
    return "";
  }
}

function readPidFile() {
  try {
    const text = readFileSync(PID_FILE, "utf8");
    return parsePid(text) ?? parsePid(JSON.parse(text).pid);
  } catch {
    return null;
  }
}

function pidsForSocketInodes(inodes) {
  const targets = new Set([...inodes].map((inode) => `socket:[${inode}]`));
  const pids = [];
  for (const entry of readdirSync("/proc")) {
    const pid = parsePid(entry);
    if (pid === null || pid === process.pid) continue;
    let fds;
    try {
      fds = readdirSync(`/proc/${pid}/fd`);
    } catch {
      // Exited mid-scan, or owned by another user.
      continue;
    }
    for (const fd of fds) {
      try {
        if (targets.has(readlinkSync(`/proc/${pid}/fd/${fd}`))) {
          pids.push(pid);
          break;
        }
      } catch {
        // fd closed mid-scan.
      }
    }
  }
  return pids;
}

/**
 * `{ pids, unattributed }` — `unattributed: true` when the port has a listener
 * whose owning pid could not be resolved (an fd dir we may not read).
 */
function portOwners() {
  if (process.platform === "win32") return windowsPortOwners();
  const inodes = new Set();
  for (const file of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    let dump;
    try {
      dump = readFileSync(file, "utf8");
    } catch {
      // tcp6 is absent when the box has no IPv6.
      continue;
    }
    for (const inode of parseListenerInodes(dump, PREVIEW_PORT)) inodes.add(inode);
  }
  const pids = inodes.size > 0 ? pidsForSocketInodes(inodes) : [];
  return { pids, unattributed: inodes.size > 0 && pids.length === 0 };
}

function windowsPortOwners() {
  try {
    const pids = windowsListenerPids();
    const marker = readWindowsMarker();
    const live = windowsProcesses([...pids, readPidFile()].filter((pid) => pid !== null));
    const cmdlines = {};
    if (marker) {
      for (const entry of live) {
        if (marker.processes.some((saved) => sameProcess(saved, entry))) cmdlines[entry.pid] = marker.command;
      }
    }
    return { pids, cmdlines, unattributed: false };
  } catch {
    // Failed inspection must never be interpreted as a free preview port.
    return { pids: [], cmdlines: {}, unattributed: true };
  }
}

function windowsListenerPids() {
  return parseNetstatListeners(execFileSync("netstat.exe", ["-ano", "-p", "tcp"], {
    encoding: "utf8", windowsHide: true, timeout: 10000, maxBuffer: 4 * 1024 * 1024,
  }), PREVIEW_PORT).filter((pid) => pid !== process.pid);
}

function windowsProcesses(pids) {
  const candidates = [...new Set(pids.map(parsePid).filter((pid) => pid !== null))];
  if (!candidates.length) return [];
  // Get-Process works without WMI access. Start time plus executable identifies
  // our recorded process even after Windows reuses a stale PID.
  const script = `$records = @(@(${candidates.join(",")}) | ForEach-Object {
    try {
      $entry = Get-Process -Id $_ -ErrorAction Stop
      @{ pid = $entry.Id; path = $entry.Path; start = [string]$entry.StartTime.ToUniversalTime().Ticks }
    } catch {}
  }); ConvertTo-Json -InputObject @($records) -Compress`;
  return JSON.parse(execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8", windowsHide: true, timeout: 10000, stdio: ["ignore", "pipe", "pipe"],
  }).replace(/^\uFEFF/, ""));
}

const normalizedPath = (value) => String(value).replaceAll("\\", "/").toLowerCase();
const windowsCommand = () => `${process.execPath} ${join(ROOT, "scripts/with-app-env.mjs")} vite preview`;
export function sameProcess(saved, live) {
  return parsePid(saved.pid) !== null && parsePid(saved.pid) === parsePid(live.pid) && saved.start === live.start
    && typeof saved.start === "string" && /^\d+$/.test(saved.start)
    && normalizedPath(saved.path) === normalizedPath(live.path) && Boolean(live.path);
}

function readWindowsMarker() {
  try {
    const marker = JSON.parse(readFileSync(PID_FILE, "utf8"));
    return normalizedPath(marker.root) === normalizedPath(ROOT) && marker.command === windowsCommand()
      && Array.isArray(marker.processes) ? marker : null;
  } catch {
    return null;
  }
}

function recordWindowsPreview(pid, includeListener = false) {
  const previous = readWindowsMarker();
  const known = windowsProcesses([pid]);
  if (!known.length) return;
  let processes = known;
  if (includeListener) {
    // The port was checked free immediately before this launch. Only record
    // Node listeners created since our own wrapper, never an older process.
    const started = BigInt(known[0].start);
    const listeners = windowsProcesses(windowsListenerPids()).filter((entry) =>
      normalizedPath(entry.path) === normalizedPath(process.execPath) && BigInt(entry.start) >= started);
    processes = [...known, ...listeners];
  } else if (previous) processes = [...known, ...previous.processes];
  writeFileSync(PID_FILE, JSON.stringify({ pid, root: ROOT, command: windowsCommand(), processes }));
}

async function stop(announce = true) {
  const before = portOwners();
  const owners = previewOwners({
    portPids: before.pids,
    pidFilePid: readPidFile(),
    cmdlineOf: process.platform === "win32" ? (pid) => before.cmdlines[pid] ?? "" : cmdlineOf,
    verifyPortOwners: process.platform === "win32",
    matches: process.platform === "win32" ? (command) => isWorkspacePreviewProcess(command, ROOT) : looksLikePreviewProcess,
  });
  const { signalled, stubborn } = await terminatePids(owners, { kill: killPid, isAlive, sleep });

  const outcome = stopOutcome({ signalled, stubborn, after: portOwners() });
  if (!outcome.ok) {
    // Keep the pidfile: a survivor the port scan cannot attribute leaves it as
    // the only record a retry could use.
    console.error(`[preview] ${outcome.error}`);
    return false;
  }
  rmSync(PID_FILE, { force: true });
  if (announce) console.log(`[preview] ${outcome.message}`);
  return true;
}

async function waitForReady(failure) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline && failure() === null) {
    try {
      // Any HTTP response means the server is bound; a 404 is still ready.
      await fetch(PREVIEW_URL, { signal: AbortSignal.timeout(2000) });
      return true;
    } catch {
      await sleep(250);
    }
  }
  return false;
}

async function restart() {
  if (!(await stop())) return 1;

  mkdirSync(dirname(LOG_FILE), { recursive: true });
  const log = openSync(LOG_FILE, "a");
  const launch = previewCommand(process.platform, process.execPath, ROOT);
  const child = spawn(launch.command, launch.args, {
    cwd: ROOT,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", log, log],
  });
  closeSync(log);
  child.unref();
  if (child.pid) {
    if (process.platform === "win32") recordWindowsPreview(child.pid);
    else writeFileSync(PID_FILE, `${child.pid}\n`);
  }

  let failure = null;
  child.on("error", (err) => {
    failure = `npm run preview could not be spawned: ${err.message}`;
  });
  child.on("exit", (code, signal) => {
    failure = `npm run preview exited early (${signal ?? `code ${code}`})`;
  });

  if (!(await waitForReady(() => failure))) {
    const secs = Math.round(READY_TIMEOUT_MS / 1000);
    const why =
      failure ??
      `nothing answered on ${PREVIEW_URL} within ${secs}s — check that vite.config.ts ` +
        `still sets preview.port ${PREVIEW_PORT}`;
    console.error(`[preview] ${why} — see ${LOG_FILE}`);
    // A server that binds a few seconds later would serve a build the agent has
    // already been told to distrust.
    await stop(false);
    return 1;
  }
  if (process.platform === "win32") recordWindowsPreview(child.pid, true);
  console.log(`[preview] serving ${PREVIEW_URL} (pid ${child.pid}, log ${LOG_FILE})`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parsePreviewArgs(process.argv.slice(2));
  if (args.error) {
    console.error(`[preview] ${args.error}`);
    process.exit(1);
  }
  if (process.platform !== "win32" && !existsSync("/proc/self")) {
    console.error("[preview] process inspection requires Windows or Linux /proc");
    process.exit(1);
  }
  process.exitCode = args.action === "stop" ? ((await stop()) ? 0 : 1) : await restart();
}
