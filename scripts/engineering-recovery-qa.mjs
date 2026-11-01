import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("..", import.meta.url));
const screenshots = join(root, "screenshots");
const temporary = mkdtempSync(join(tmpdir(), "noah-forge-recovery-qa-"));
mkdirSync(screenshots, { recursive: true });
const url = process.argv[2] || "http://127.0.0.1:8080/";
assert.match(url, /^http:\/\/127\.0\.0\.1:808[01]\/$/);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = [];
const checks = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
const button = (name) => page.getByRole("button", { name, exact: true });
const dialog = () => page.getByRole("dialog");
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem("airframe-lab")).state);
const open = (name) =>
  page
    .getByRole("navigation", { name: "Project workspaces" })
    .getByRole("button", { name, exact: true })
    .click();
const projectDialog = async () => {
  await button("Projects").click();
  await dialog().waitFor();
};
const exportProject = async (name) => {
  const pending = page.waitForEvent("download");
  await dialog().getByRole("button", { name: "Export project", exact: true }).click();
  const path = join(temporary, name);
  await (await pending).saveAs(path);
  return path;
};
const importProject = async (data, name) => {
  // Never write fixtures inside the watched project tree: Vite reloads JSON changes.
  const path = join(temporary, name);
  writeFileSync(path, JSON.stringify(data));
  await projectDialog();
  await page.getByLabel("Import project", { exact: true }).setInputFiles(path);
  await dialog().waitFor({ state: "hidden" });
  await page.getByRole("heading", { name: "Mission & requirements", exact: true }).waitFor();
};
const entry = (index) => ({
  id: `recovery-entry-${index}`,
  date: "2026-11-01",
  title: `QA record ${index}`,
  kind: "experiment",
  procedure: "Regression fixture; no physical test was performed.",
  predicted: null,
  measured: null,
  unit: "",
  notes: "",
  photos: [],
});
const requirement = (index) => ({
  id: `recovery-requirement-${index}`,
  text: `QA requirement ${index}`,
  metric: "mass",
  target: 1000,
  unit: "g",
  direction: "max",
  actual: null,
  method: "test",
  evidence: "",
});
const removeEntry = async (index) => {
  await page
    .locator("summary")
    .filter({
      has: page.getByText(`QA record ${index}`, { exact: true }),
    })
    .click();
  await button(`Remove notebook entry QA record ${index}`).click();
};
const assertFreshNotebook = async () => {
  assert.equal(await page.getByLabel("Entry title", { exact: true }).inputValue(), "");
  assert.equal(await button("Save changes").count(), 0);
  assert.equal(await button("Undo remove").count(), 0);
  assert.equal((await state()).engineering.notebook.length, 2);
};

try {
  await page.goto(url);
  await page.waitForFunction(() => {
    const input = document.querySelector("#project-name");
    return input && Object.keys(input).some((key) => key.startsWith("__reactProps"));
  });
  // Obtain a complete valid fixture through the public export UI, so this test
  // also runs from a fresh checkout without any generated artifact dependencies.
  await projectDialog();
  const seedPath = await exportProject("seed.json");
  const seed = JSON.parse(readFileSync(seedPath, "utf8"));
  await button("Close projects").click();
  const recovery = structuredClone(seed);
  recovery.state.projectName = "Recovery regression";
  recovery.state.engineering.notebook = [entry(1), entry(2)];
  recovery.state.engineering.mission.requirements = [requirement(1), requirement(2)];
  await importProject(recovery, "recovery.json");
  await button("Save restore point").click();
  await open("Experiment notebook");
  await page.getByLabel("Entry title", { exact: true }).fill("Unsaved draft before restore");
  await removeEntry(1);
  assert.equal(await button("Undo remove").isEnabled(), true);
  await projectDialog();
  await dialog().getByRole("button", { name: "Restore", exact: true }).first().click();
  await dialog().waitFor({ state: "hidden" });
  await assertFreshNotebook();
  checks.push("Restoring the same project clears the unsaved notebook draft and pending Undo");

  await projectDialog();
  await dialog().getByRole("button", { name: "Save named project", exact: true }).click();
  await button("Close projects").click();
  await page
    .locator("summary")
    .filter({ has: page.getByText("QA record 2", { exact: true }) })
    .click();
  await button("Edit entry").click();
  await page.getByLabel("Entry title", { exact: true }).fill("Unsaved edit before reopen");
  await removeEntry(1);
  await projectDialog();
  await dialog().getByRole("button", { name: "Open project", exact: true }).click();
  await dialog().waitFor({ state: "hidden" });
  await assertFreshNotebook();
  checks.push("Reopening the same named project clears notebook edit mode and pending Undo");

  await page
    .locator("summary")
    .filter({ has: page.getByText("QA record 2", { exact: true }) })
    .click();
  await button("Edit entry").click();
  await button("Remove notebook entry QA record 2").click();
  await button("Save changes").click();
  await page
    .getByRole("alert")
    .getByText(
      "This entry was removed. Undo its removal before saving the edit, or start a new entry.",
      { exact: true },
    )
    .waitFor();
  assert.equal((await state()).engineering.notebook.length, 1);
  await projectDialog();
  await dialog().getByRole("button", { name: "Open project", exact: true }).click();
  await dialog().waitFor({ state: "hidden" });
  await assertFreshNotebook();
  checks.push(
    "Saving an edit to a removed entry shows an explicit error and preserves remaining records",
  );

  await open("Mission & requirements");
  await button("Remove requirement 1").click();
  assert.equal(await button("Undo remove").isEnabled(), true);
  await projectDialog();
  await dialog().getByRole("button", { name: "Open project", exact: true }).click();
  await dialog().waitFor({ state: "hidden" });
  assert.equal(await button("Undo remove").count(), 0);
  assert.equal((await state()).engineering.mission.requirements.length, 2);
  checks.push("Project reopening clears pending requirement Undo without cross-project records");

  const limits = structuredClone(seed);
  limits.state.projectName = "Capacity regression";
  limits.state.engineering.notebook = Array.from({ length: 100 }, (_, index) => entry(index + 1));
  limits.state.engineering.mission.requirements = Array.from({ length: 60 }, (_, index) =>
    requirement(index + 1),
  );
  await importProject(limits, "limits.json");
  await open("Experiment notebook");
  await removeEntry(100);
  assert.equal((await state()).engineering.notebook.length, 99);
  assert.equal(await button("Undo remove").isEnabled(), true);
  await page.getByLabel("Entry title", { exact: true }).fill("Replacement at notebook capacity");
  await button("Save entry").click();
  assert.equal((await state()).engineering.notebook.length, 100);
  assert.equal(await button("Undo remove").isDisabled(), true);
  checks.push("Notebook Undo is disabled after a replacement reaches the 100-entry limit");

  await open("Mission & requirements");
  await button("Remove requirement 1").click();
  assert.equal((await state()).engineering.mission.requirements.length, 59);
  assert.equal(await button("Undo remove").isEnabled(), true);
  await button("Add mass limit").click();
  assert.equal((await state()).engineering.mission.requirements.length, 60);
  assert.equal(await button("Undo remove").isDisabled(), true);
  checks.push("Requirement Undo is disabled after a replacement reaches the 60-item limit");

  await projectDialog();
  const boundedPath = await exportProject("bounded-round-trip.json");
  await page.getByLabel("Import project", { exact: true }).setInputFiles(boundedPath);
  await dialog().waitFor({ state: "hidden" });
  const bounded = await state();
  assert.equal(bounded.engineering.notebook.length, 100);
  assert.equal(bounded.engineering.mission.requirements.length, 60);
  assert.equal(new Set(bounded.engineering.notebook.map((item) => item.id)).size, 100);
  assert.equal(new Set(bounded.engineering.mission.requirements.map((item) => item.id)).size, 60);
  checks.push("Capacity-bound project exports remain importable with unique record IDs");
  await page.screenshot({ path: join(screenshots, "engineering-recovery-qa.png") });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, url, checks, errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: join(screenshots, "engineering-recovery-qa-failure.png") });
  throw error;
} finally {
  await context.close();
  await browser.close();
  if (
    dirname(temporary) === resolve(tmpdir()) &&
    basename(temporary).startsWith("noah-forge-recovery-qa-")
  )
    rmSync(temporary, { recursive: true, force: true });
}
