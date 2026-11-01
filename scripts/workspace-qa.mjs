import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = join(root, "screenshots");
mkdirSync(out, { recursive: true });
const url = process.argv[2] || "http://127.0.0.1:8080/";
assert.match(url, /^http:\/\/127\.0\.0\.1:808[01]\/$/);
const browser = await chromium.launch({ headless: true });
const errors = [];
const checks = [];
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
const nav = () => page.getByRole("navigation", { name: "Project workspaces" });
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem("airframe-lab")).state);
const noOverflow = async () =>
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
  );
try {
  const target = new URL(url);
  target.searchParams.set("qa", "1");
  await page.goto(target.href);
  await page.getByRole("heading", { name: "Overview & AI", exact: true }).waitFor();
  await page.waitForFunction(() => {
    const composer = document.querySelector("#design-msg");
    return composer && Object.keys(composer).some((key) => key.startsWith("__reactProps"));
  });
  await page
    .getByRole("button", {
      name: "Explain the components and power requirements of this design",
      exact: true,
    })
    .click();
  assert.match(
    await page.getByLabel("Message the design assistant").inputValue(),
    /Explain the components/,
  );
  assert.equal(await page.getByRole("log").getByText("You", { exact: true }).count(), 0);
  checks.push("AI suggestions fill the composer without submitting a paid request");
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await page
      .getByRole("log")
      .getByText(/ANTHROPIC_API_KEY setting is missing/)
      .waitFor();
    assert.equal((await state()).customs.length, 0);
    checks.push("Unconfigured AI returns a visible setup error and preserves the project");
    await page.getByRole("button", { name: "Clear chat", exact: true }).click();
  }

  await page.getByLabel("Project name", { exact: true }).fill("QA edited wing");
  await page.getByRole("button", { name: "Save restore point", exact: true }).click();
  await nav().getByRole("button", { name: "Components", exact: true }).click();
  await page.getByRole("searchbox", { name: "Search components", exact: true }).fill("sonar");
  const device = page.locator("[data-device]");
  assert.equal(await device.count(), 1);
  const sonarId = await device.getAttribute("data-device");
  await device.getByRole("button").click();
  assert.equal((await state()).picked[sonarId], 1);
  await page
    .getByRole("searchbox", { name: "Search components", exact: true })
    .fill("no-such-part-zz");
  await page.getByText("No components match these filters.").waitFor();
  await page.getByRole("button", { name: "Show all components", exact: true }).click();
  await page.getByRole("checkbox", { name: "Selected only" }).check();
  assert((await page.locator("[data-device]").count()) > 0);
  checks.push("Component search, add, empty state, clear filters, and selected-only filter");

  await nav().getByRole("button", { name: "Schematic", exact: true }).click();
  await page.getByRole("tab", { name: "Nets", exact: true }).click();
  await page.getByRole("button", { name: "GND", exact: true }).click();
  assert.equal(
    await page.getByRole("button", { name: "GND", exact: true }).getAttribute("aria-pressed"),
    "true",
  );
  await page.screenshot({ path: join(out, "noah-schematic-desktop.png"), fullPage: true });
  await nav().getByRole("button", { name: "PCB layout", exact: true }).click();
  assert.equal(
    await page.getByRole("button", { name: "GND", exact: true }).getAttribute("aria-pressed"),
    "true",
  );
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  assert.equal((await page.getByLabel("Zoom level").textContent()).trim(), "125%");
  await page.getByRole("button", { name: "Fit width", exact: true }).click();
  assert.equal((await page.getByLabel("Zoom level").textContent()).trim(), "100%");
  await page.getByRole("button", { name: "Clear selected net", exact: true }).click();
  const svgEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export layout SVG", exact: true }).click();
  const svg = await svgEvent;
  assert.match(readFileSync(await svg.path(), "utf8"), /<svg/);
  await page.getByRole("tab", { name: "Parts", exact: true }).click();
  await page.getByRole("searchbox", { name: "Search parts", exact: true }).fill("sonar");
  assert.match(await page.getByRole("tabpanel").innerText(), /HC-SR04|sonar/i);
  const csvEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export BOM CSV", exact: true }).click();
  const csv = await csvEvent;
  assert.match(readFileSync(await csv.path(), "utf8"), /HC-SR04/i);
  await page.screenshot({ path: join(out, "noah-pcb-desktop.png"), fullPage: true });
  await noOverflow();
  checks.push("Schematic/PCB shared net inspection, zoom, SVG export, and BOM search/export");

  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Drone/ })
    .click();
  assert.equal((await state()).chassis, "drone");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  const saved = page
    .getByRole("dialog")
    .locator("li")
    .filter({ has: page.getByText("QA edited wing", { exact: true }) });
  // The newest backup is the configuration with the added sensor.
  await saved.first().getByRole("button", { name: "Restore", exact: true }).click();
  assert.equal((await state()).projectName, "QA edited wing");
  assert.equal((await state()).picked[sonarId], 1);
  await page.reload();
  await page.getByLabel("Project name", { exact: true }).waitFor();
  await page.waitForFunction(
    () => document.querySelector("#project-name")?.value === "QA edited wing",
  );
  assert.equal((await state()).picked[sonarId], 1);
  checks.push("Template auto-backup, restore, and browser persistence preserve name and parts");

  await nav().getByRole("button", { name: "Firmware", exact: true }).click();
  assert.match(await page.locator("pre").innerText(), /sonar|echo|trig/i);
  await nav().getByRole("button", { name: "3D assembly", exact: true }).click();
  await page.locator("canvas").waitFor();
  await page.waitForFunction(() => Boolean(window.__controlsTest));
  assert(await page.locator("canvas").evaluate((canvas) => canvas.width > 0 && canvas.height > 0));
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const controls = await page.evaluate(async () => {
    const probe = window.__controlsTest;
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    probe.setKeys(["Space"]);
    await wait(400);
    const speed = probe.getSpeed();
    probe.setKeys(["KeyA"]);
    await wait(300);
    const left = probe.getRoll();
    probe.setKeys(["KeyD"]);
    await wait(650);
    const right = probe.getRoll();
    probe.setKeys([]);
    return { speed, left, right };
  });
  assert(
    controls.speed > 0.1 && controls.left > 0.05 && controls.right < -0.05,
    JSON.stringify(controls),
  );
  await page.screenshot({ path: join(out, "noah-assembly-controls.png"), fullPage: false });
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  checks.push(
    "Firmware uses the updated sensor plan; assembly renders and A/D bank left/right while moving",
  );
  for (const name of ["Drone", "Helicopter", "Spider", "Humanoid"]) {
    await page.getByRole("button", { name: "Projects", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: new RegExp(`^${name}`) })
      .click();
    await nav().getByRole("button", { name: "3D assembly", exact: true }).click();
    await page.waitForFunction(() => Boolean(window.__controlsTest));
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const result = await page.evaluate(async () => {
      const p = window.__controlsTest;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      p.setKeys(["KeyW"]);
      await wait(500);
      const speed = p.getSpeed();
      const y0 = p.getYaw();
      p.setKeys(["KeyW", "KeyA"]);
      await wait(300);
      const left = p.getYaw() - y0;
      const y1 = p.getYaw();
      p.setKeys(["KeyW", "KeyD"]);
      await wait(300);
      const right = p.getYaw() - y1;
      p.setKeys([]);
      return { speed, left, right };
    });
    assert(
      result.speed > 0.05 && result.left > 0.05 && result.right < -0.05,
      `${name} controls: ${JSON.stringify(result)}`,
    );
    await page.getByRole("button", { name: "Stop", exact: true }).click();
  }
  checks.push(
    "All five original chassis templates render with working left/right movement controls",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await nav().getByRole("button", { name: "Schematic", exact: true }).click();
  await noOverflow();
  await page.screenshot({ path: join(out, "noah-schematic-mobile.png"), fullPage: true });
  await nav().getByRole("button", { name: "PCB layout", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await noOverflow();
  await page.screenshot({ path: join(out, "noah-pcb-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await noOverflow();
  await page.screenshot({ path: join(out, "noah-projects-mobile.png"), fullPage: false });
  await page.getByRole("button", { name: "Close projects", exact: true }).click();
  checks.push("Mobile schematic, zoomed PCB canvas, and project picker have no page overflow");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, url, checks, errors }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
