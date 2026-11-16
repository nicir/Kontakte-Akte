import { expect, test, type Page } from "@playwright/test";

/**
 * Acceptance scenarios A–E (+ setup, lock/unlock, backup) through the real UI
 * against the real encrypted backend. Runs serially in one browser session.
 */
const PASSWORD = "Mein langer Satz mit Leerzeichen & Ümlauten 🔐";
const SHOTS = process.env.KA_E2E_SHOTS ?? "test-results/screens";

test.describe.configure({ mode: "serial" });

let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
});

async function shot(name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

async function addCountry(label: string, country: string) {
  await page.getByRole("button", { name: `${label}: Land hinzufügen` }).click();
  await page.getByPlaceholder("Land suchen …").fill(country);
  await page.getByRole("option", { name: country, exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByPlaceholder("Land suchen …")).toHaveCount(0);
}

async function addTag(label: string, value: string) {
  const input = page.getByRole("combobox", { name: label, exact: true });
  await input.click();
  await input.fill(value);
  await input.press("Enter");
}

async function nav(name: string | RegExp) {
  await page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("button", { name }).click();
}

test("first launch: create master password", async () => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Master-Passwort festlegen" })).toBeVisible();
  await shot("01-setup");
  await page.getByLabel("Master-Passwort", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Passwort bestätigen").fill(PASSWORD + "x");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Verschlüsselte Datenbank anlegen" }).click();
  await expect(page.getByText("Die Passwörter stimmen nicht überein.")).toBeVisible();
  await page.getByLabel("Passwort bestätigen").fill(PASSWORD);
  await page.getByRole("button", { name: "Verschlüsselte Datenbank anlegen" }).click();
  await expect(page.getByText("Willkommen bei Kontakte-Akte")).toBeVisible();
  await shot("02-dashboard-empty");
});

test("Scenario A: create Rahul Sharma with all classifications", async () => {
  await nav("Kontakte");
  await page.getByRole("button", { name: "Kontakt hinzufügen" }).first().click();
  await page.getByLabel("Vorname").fill("Rahul");
  await page.getByLabel("Nachname").fill("Sharma");
  await addCountry("Nationalität", "Indien");
  await page.locator("#residence").click();
  await page.getByPlaceholder("Land suchen …").fill("Singapur");
  await page.getByRole("option", { name: "Singapur", exact: true }).click();
  await expect(page.getByPlaceholder("Land suchen …")).toHaveCount(0);
  await page.getByLabel("Wohnort (Stadt)").fill("Singapur");
  await addTag("Beruf", "Rechtsanwalt");
  await page.getByLabel("Aktuelles Unternehmen").fill("Sharma & Partners LLP");
  await addTag("Spezialisierungen", "Indisches Steuerrecht");
  await addTag("Spezialisierungen", "Internationales Steuerrecht");
  await addTag("Branchen", "Rechtsberatung");
  await addCountry("Tätigkeitsländer", "Indien");
  await addCountry("Tätigkeitsländer", "Singapur");
  await addCountry("Tätigkeitsländer", "Vereinigte Arabische Emirate");
  await addCountry("Expertise-Länder", "Indien");
  await addCountry("Interessensländer", "Deutschland");
  await page.getByRole("button", { name: /^Beziehung/ }).click();
  await page.getByLabel("Wo habt ihr euch kennengelernt?").fill("Konferenz in Singapur");
  await page.getByLabel("Wann?").fill("2026-03-01");
  await page.getByRole("button", { name: /^Expertise & Themen/ }).click();
  await addTag("Besprochene Themen", "Grenzüberschreitende Investitionen");
  await addTag("Kooperationsthemen", "Investitionsprojekt Indien–Europa");
  await page.getByRole("button", { name: "E-Mail", exact: true }).click();
  await page.getByLabel("E-Mail – Wert").fill("rahul@example.com");
  await shot("03-editor");
  await page.getByRole("button", { name: "Kontakt anlegen" }).click();

  await expect(page.getByRole("heading", { name: "Rahul Sharma" })).toBeVisible();
  await expect(page.getByText("Rechtsanwalt · Sharma & Partners LLP")).toBeVisible();
  await expect(page.getByText("Singapur, Singapur")).toBeVisible();
  await expect(page.getByText("Nationalität: Indien")).toBeVisible();
  await expect(page.getByText("Indien, Singapur, Vereinigte Arabische Emirate")).toBeVisible();
  await expect(page.getByText("Konferenz in Singapur, 1. März 2026")).toBeVisible();
  await shot("04-profile");
});

test("second contact for contrast + autocomplete reuses existing values", async () => {
  await nav("Kontakte");
  await page.getByRole("button", { name: "Kontakt hinzufügen" }).first().click();
  await page.getByLabel("Vorname").fill("Maria");
  await page.getByLabel("Nachname").fill("Müller");
  const spec = page.getByRole("combobox", { name: "Spezialisierungen", exact: true });
  await spec.click();
  await spec.fill("steuer");
  await expect(page.getByRole("option", { name: "Indisches Steuerrecht" })).toBeVisible();
  await spec.fill("Deutsches Gesellschaftsrecht");
  await spec.press("Enter");
  await addTag("Beruf", "Rechtsanwältin");
  await addCountry("Expertise-Länder", "Deutschland");
  await page.getByRole("button", { name: "Kontakt anlegen" }).click();
  await expect(page.getByRole("heading", { name: "Maria Müller" })).toBeVisible();
});

test("Scenario B: combined filters find Rahul", async () => {
  await nav("Kontakte");
  await expect(page.getByText("2 Kontakte")).toBeVisible();
  await page.getByRole("button", { name: "Filter hinzufügen" }).click();
  await page.getByRole("menuitem", { name: "Expertise-Land" }).click();
  await addCountry("Expertise-Land", "Indien");
  await page.getByRole("button", { name: "Übernehmen" }).click();

  await page.getByRole("button", { name: "Filter hinzufügen" }).click();
  await page.getByRole("menuitem", { name: "Beruf" }).click();
  await addTag("Beruf", "Rechtsanwalt");
  await page.getByRole("button", { name: "Übernehmen" }).click();

  await page.getByRole("button", { name: "Filter hinzufügen" }).click();
  await page.getByRole("menuitem", { name: "Spezialisierung" }).click();
  await addTag("Spezialisierung", "Steuerrecht");
  await page.getByRole("button", { name: "Übernehmen" }).click();

  await expect(page.getByText("1 Kontakt gefunden")).toBeVisible();
  // The typed term is used as-is (substring match), not silently replaced by a suggestion.
  await expect(page.getByText("„Steuerrecht“", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Rahul Sharma/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Maria Müller/ })).toHaveCount(0);
  await shot("05-search-filters");
  await page.getByRole("button", { name: "Zurücksetzen" }).click();
  await expect(page.getByText("2 Kontakte")).toBeVisible();

  await page.getByLabel("Kontakte durchsuchen").fill("muller");
  await expect(page.getByText("1 Kontakt gefunden")).toBeVisible();
  await page.getByLabel("Kontakte durchsuchen").fill("");
});

test("Scenario C: document a phone call", async () => {
  await page.getByRole("button", { name: /Rahul Sharma/ }).click();
  await page.getByRole("button", { name: "Interaktion", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Art").click();
  await page.getByRole("option", { name: "Telefonat" }).click();
  await dialog.getByLabel("Datum").fill("2026-03-15");
  await dialog.getByLabel("Beschreibung").fill(
    "Mögliche Investitionskooperation zwischen europäischen Investoren und indischen Unternehmen besprochen.",
  );
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Mögliche Investitionskooperation zwischen europäischen Investoren")).toBeVisible();
  await expect(page.getByText("15. März 2026")).toBeVisible();
});

test("Scenario D: reminder appears in profile, overview and dashboard (overdue)", async () => {
  await page.getByRole("button", { name: "Erinnerung", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Titel").fill("Follow up on investment project");
  await dialog.getByLabel("Fällig am").fill("2026-06-15");
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Follow up on investment project")).toBeVisible();
  await shot("06-profile-with-history");

  await nav(/Erinnerungen/);
  const overdue = page.locator("div.rounded-xl", { has: page.getByRole("heading", { name: /Überfällig/ }) });
  await expect(overdue.getByText("Follow up on investment project")).toBeVisible();
  await shot("07-reminders");

  await nav("Dashboard");
  await expect(page.getByRole("button", { name: /1\s*Überfällig/ })).toBeVisible();
  await expect(page.getByText("Follow up on investment project")).toBeVisible();
  await shot("08-dashboard");
});

test("Scenario E: world map dimensions", async () => {
  await nav("Weltkarte");
  await expect(page.getByRole("img", { name: "Weltkarte mit Kontaktdichte je Land" })).toBeVisible();
  await page.getByRole("radio", { name: "Expertise-Land" }).click();
  await page.getByRole("button", { name: /^Indien\s*1$/ }).click();
  await expect(page.getByRole("heading", { name: "Indien" })).toBeVisible();
  await expect(page.getByText("1 Kontakt · Expertise-Land")).toBeVisible();
  await expect(page.getByRole("button", { name: /Rahul Sharma/ })).toBeVisible();
  await shot("09-map-expertise");

  await page.getByRole("radio", { name: "Wohnsitz" }).click();
  await expect(page.getByRole("button", { name: /^Singapur\s*1$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Indien/ })).toHaveCount(0);
  await page.getByRole("button", { name: /^Singapur\s*1$/ }).click();
  await expect(page.getByRole("heading", { name: "Singapur" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Rahul Sharma/ })).toBeVisible();

  await page.getByRole("radio", { name: "Tätigkeitsland" }).click();
  for (const name of ["Indien", "Singapur", "Vereinigte Arabische Emirate"]) {
    await expect(page.getByRole("button", { name: new RegExp(`^${name}\\s*1$`) })).toBeVisible();
  }
  await shot("10-map-activity");
});

test("lock, wrong password, unlock; data persists after reload", async () => {
  await page.getByRole("button", { name: "Jetzt sperren" }).click();
  await expect(page.getByRole("heading", { name: "Entsperren" })).toBeVisible();
  await page.reload(); // simulates relaunching the desktop app
  await expect(page.getByRole("heading", { name: "Entsperren" })).toBeVisible();
  await page.getByLabel("Master-Passwort").fill("falsch");
  await page.getByRole("button", { name: "Entsperren" }).click();
  await expect(page.getByText("Das Passwort ist nicht korrekt.")).toBeVisible();
  await shot("11-unlock");
  await page.getByLabel("Master-Passwort").fill(PASSWORD);
  await page.getByRole("button", { name: "Entsperren" }).click();
  await nav("Kontakte");
  await expect(page.getByText("2 Kontakte")).toBeVisible();
});

test("settings: create encrypted backup", async () => {
  await page.getByRole("button", { name: "Einstellungen" }).click();
  await page.getByRole("button", { name: "Sicherung erstellen …" }).click();
  await expect(page.getByText(/^kontakte-akte-\d{8}-\d{6}\.kabackup$/)).toBeVisible();
  await shot("12-settings");
});
