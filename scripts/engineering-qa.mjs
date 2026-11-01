import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = join(root, "screenshots");
// Vite watches the project tree. Writing a downloaded JSON fixture there can
// reload the page mid-interaction, so downloads belong in an isolated temp dir.
const temporary = mkdtempSync(join(tmpdir(), "noah-forge-qa-"));
mkdirSync(out, { recursive: true });
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
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const nav = () => page.getByRole("navigation", { name: "Project workspaces" });
const open = async (name) => nav().getByRole("button", { name, exact: true }).click();
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem("airframe-lab")).state);
const number = (name) => page.getByRole("spinbutton", { name, exact: true });
const download = async (name) => {
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name, exact: true }).click();
  return event;
};
const noOverflow = async () =>
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
  );
try {
  await page.goto(url);
  await page.waitForFunction(() => {
    const input = document.querySelector("#project-name");
    return input && Object.keys(input).some((key) => key.startsWith("__reactProps"));
  });
  await page.getByLabel("Project name", { exact: true }).fill("Engineering QA rover");
  assert.equal(
    await page.getByRole("img", { name: "Precision Noah Forge emblem" }).getAttribute("src"),
    "/precision-noah-forge.png",
  );
  assert.equal(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--color-cyan").trim(),
    ),
    "#61162d",
  );

  await open("Mission & requirements");
  await page
    .getByLabel("Mission / problem statement", { exact: true })
    .fill("QA: six-leg inspection rover carrying a camera across an indoor course.");
  await page.getByRole("button", { name: "Add runtime target", exact: true }).click();
  await page.getByLabel("Requirement 1 recorded result", { exact: true }).fill("20");
  await page
    .getByLabel("Requirement 1 evidence", { exact: true })
    .fill("QA fixture: stopwatch observation in a stationary bench trial.");
  assert.equal((await state()).engineering.mission.requirements[0].actual, 20);
  await page.screenshot({ path: join(out, "engineering-mission-desktop.png"), fullPage: true });
  checks.push("Mission, measurable requirement, explicit result and verification evidence");

  await open("Legs & gait");
  await number("Upper link").fill("80");
  await number("Target x").fill("500");
  await page.getByText("Target is not reachable", { exact: true }).waitFor();
  await number("Target x").fill("95");
  assert.equal((await state()).engineering.leg.upperMm, 80);
  await page.getByRole("tab", { name: "Gait", exact: true }).click();
  await page.getByLabel("Leg count", { exact: true }).selectOption("8");
  await page.getByLabel("Gait pattern", { exact: true }).selectOption("wave");
  await page.getByRole("button", { name: "Play gait preview", exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Pause gait preview", exact: true }).click();
  assert((await state()).engineering.leg.phase > 0);
  await page.getByRole("button", { name: "Record analysis", exact: true }).click();
  const gait = await download("Export gait CSV");
  assert.match(readFileSync(await gait.path(), "utf8"), /phase|stance/i);
  await page.screenshot({ path: join(out, "engineering-leg-desktop.png"), fullPage: true });
  checks.push("Inverse kinematics, unreachable target, eight-leg gait playback, recording and CSV");

  await open("Flight sizing");
  await number("Frame / structure mass").fill("300");
  await page
    .locator("article")
    .filter({ has: page.getByLabel("Mass item name Frame / structure", { exact: true }) })
    .locator("summary")
    .click();
  await page
    .getByLabel("Frame / structure source", { exact: true })
    .fill("QA planning fixture; no real measurement");
  await page.getByRole("tab", { name: "Propulsion & battery", exact: true }).click();
  await number("Maximum thrust per motor").fill("450");
  await page
    .getByLabel("Propulsion data source", { exact: true })
    .fill("QA fixture assumptions, not measured propulsion data");
  await page.getByRole("button", { name: "Save calculation to notebook", exact: true }).click();
  const sizing = await download("Export sizing CSV");
  assert.match(readFileSync(await sizing.path(), "utf8"), /runtime|thrust/i);
  await page.getByRole("tab", { name: "Fixed-wing estimates", exact: true }).click();
  assert.equal((await state()).engineering.flight.thrustPerMotorG, 450);
  await page.screenshot({ path: join(out, "engineering-flight-desktop.png"), fullPage: true });
  checks.push("Mass/source budget, propulsion assumptions, wing sizing, notebook and CSV");

  await open("Mechanical assembly");
  await number("Plate width").fill("110");
  await number("Hole pitch X").fill("90");
  await page.locator("canvas").waitFor();
  for (const [label, pattern] of [
    ["Assembly STL", null],
    ["Editable CAD source", /difference|module/],
    ["Plate DXF", /SECTION/],
    ["Hardware BOM", /M3/],
  ]) {
    const file = await download(label);
    const bytes = readFileSync(await file.path());
    if (pattern) assert(pattern.test(bytes.toString("utf8")), `${label} content missing`);
    else {
      assert(bytes.length > 84);
      assert.equal(bytes.length, 84 + bytes.readUInt32LE(80) * 50);
    }
  }
  await page.getByRole("button", { name: "Save assembly revision", exact: true }).click();
  await page.screenshot({ path: join(out, "engineering-mechanical-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "Apply plate to Printable parts", exact: true }).click();
  assert.equal((await state()).plate.width, 110);
  for (const part of ["Rib", "Motor", "Horn", "Plate", "Clip"]) {
    await page.getByRole("button", { name: part, exact: true }).click();
    const file = await download("Download STL");
    assert(readFileSync(await file.path()).length > 100);
  }
  checks.push(
    "Mounting assembly geometry, STL/CAD/DXF/hardware exports; all five original STL families",
  );

  await open("Experiment notebook");
  await page.getByLabel("Entry title", { exact: true }).fill("QA runtime comparison");
  await page
    .getByLabel("Procedure, conditions, and equipment", { exact: true })
    .fill("QA fixture only: compare a 20 minute prediction with an 18 minute observation.");
  await number("Predicted value").fill("20");
  await number("Measured / analyzed value").fill("18");
  await page.getByLabel("Measurement unit", { exact: true }).fill("min");
  await page
    .getByLabel("Attach test photos", { exact: true })
    .setInputFiles(join(root, "images/Precision NF forge emblem.png"));
  await page.getByRole("img", { name: "Precision NF forge emblem.png", exact: true }).waitFor();
  await page.getByRole("button", { name: "Save entry", exact: true }).click();
  const notebook = (await state()).engineering.notebook;
  assert(
    notebook.some(
      (entry) =>
        entry.title === "QA runtime comparison" &&
        entry.measured === 18 &&
        entry.photos.length === 1,
    ),
  );
  for (const [label, pattern] of [
    ["Export Markdown report", /QA runtime comparison/],
    ["Export printable HTML", /<img/],
  ]) {
    const file = await download(label);
    assert.match(readFileSync(await file.path(), "utf8"), pattern);
  }
  await page.screenshot({ path: join(out, "engineering-notebook-desktop.png"), fullPage: true });
  checks.push(
    "Predicted/measured experiment, automatic photo resizing, chart, Markdown and printable report",
  );

  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("button", { name: "Save named project", exact: true }).click();
  const exported = await download("Export project");
  const exportedPath = join(temporary, "engineering-qa-project.json");
  await exported.saveAs(exportedPath);
  const saved = JSON.parse(readFileSync(exportedPath, "utf8"));
  assert.equal(saved.state.engineering.leg.upperMm, 80);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Drone/ })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByLabel("Import project", { exact: true }).setInputFiles(exportedPath);
  await page.getByRole("heading", { name: "Mission & requirements", exact: true }).waitFor();
  assert.equal((await state()).engineering.flight.massItems[0].massG, 300);
  assert.equal((await state()).engineering.notebook.length, 4);
  await page.reload();
  await page.waitForFunction(
    () => document.querySelector("#project-name")?.value === "Engineering QA rover",
  );
  assert.equal((await state()).engineering.leg.legCount, 8);
  assert.equal((await state()).engineering.notebook.length, 4);
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  const badPath = join(temporary, "engineering-qa-invalid.json");
  writeFileSync(badPath, '{"invalid":true}');
  await page.getByLabel("Import project", { exact: true }).setInputFiles(badPath);
  await page.getByRole("alert").waitFor();
  assert.equal((await state()).projectName, "Engineering QA rover");
  await page.getByRole("button", { name: "Close projects", exact: true }).click();
  checks.push(
    "Complete project export/import, named save, reload persistence, safe invalid-file rejection",
  );

  await open("Components");
  const pin = page.getByLabel("Pin for elevon L", { exact: true });
  await pin.selectOption("11");
  await open("Firmware");
  assert.match(await page.locator("pre").innerText(), /PIN_ELEVON_L = 11/);
  await open("Schematic");
  const cad = await download("Export KiCad netlist");
  assert.match(readFileSync(await cad.path(), "utf8"), /^\(export \(version "E"\)/);
  checks.push("Edited signal assignment propagates into firmware and exported CAD connectivity");

  await page.setViewportSize({ width: 390, height: 844 });
  for (const workspace of ["mission", "leg", "flight", "mechanical", "notebook"]) {
    await page.getByLabel("Choose workspace", { exact: true }).selectOption(workspace);
    await noOverflow();
    await page.screenshot({
      path: join(out, `engineering-${workspace}-mobile.png`),
      fullPage: false,
    });
  }
  checks.push("All five new engineering workspaces fit mobile without page overflow");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, url, checks, errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: join(out, "engineering-qa-failure.png"), fullPage: false });
  throw error;
} finally {
  await context.close();
  await browser.close();
  if (dirname(temporary) === resolve(tmpdir()) && basename(temporary).startsWith("noah-forge-qa-"))
    rmSync(temporary, { recursive: true, force: true });
}
