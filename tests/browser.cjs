const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
module.exports = async function ({
  base,
  cookie,
  courseId,
  chapterId,
  documentId,
}) {
  const browser = await chromium.launch({
    executablePath: process.env.BROWSER_PATH || undefined,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const fresh = await browser.newContext({
      viewport: { width: 1200, height: 900 },
    });
    const signup = await fresh.newPage();
    signup.setDefaultTimeout(120000);
    await signup.goto(base, { waitUntil: "domcontentloaded" });
    await signup
      .getByRole("button", { name: "Dokumente hochladen", exact: true })
      .click();
    await signup.getByPlaceholder("Dein Vorname").fill("Browser-Test");
    const email = "browser-" + Date.now() + "@example.test";
    await signup.getByPlaceholder("du@beispiel.de").fill(email);
    await signup
      .getByPlaceholder("Mindestens 10 Zeichen")
      .fill("browser-original-password");
    await signup
      .getByRole("button", { name: "Kostenlos starten", exact: true })
      .click();
    await signup.locator(".recovery-code").waitFor();
    const recovery = (
      await signup.locator(".recovery-code").innerText()
    ).trim();
    await signup
      .getByRole("button", { name: "Code gesichert · Weiter", exact: true })
      .click();
    await signup.locator(".auth-modal").waitFor({ state: "hidden" });
    await fresh.request.post(base + "/api/auth/logout");
    await signup.reload();
    await signup.locator(".profile").click();
    await signup
      .getByRole("button", { name: "Passwort vergessen?", exact: true })
      .click();
    await signup.getByPlaceholder("du@beispiel.de").fill(email);
    await signup
      .getByPlaceholder("XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX")
      .fill(recovery);
    await signup
      .getByPlaceholder("Mindestens 10 Zeichen")
      .fill("browser-reset-password");
    await signup
      .getByRole("button", { name: "Passwort ändern", exact: true })
      .click();
    await signup.locator(".recovery-code").waitFor();
    await signup
      .getByRole("button", { name: "Code gesichert · Weiter", exact: true })
      .click();
    await signup
      .getByRole("button", { name: "Anmelden", exact: true })
      .last()
      .click();
    await signup.locator(".auth-modal").waitFor({ state: "hidden" });
    await fresh.close();
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
    });
    const split = cookie.indexOf("=");
    await context.addCookies([
      {
        name: cookie.slice(0, split),
        value: cookie.slice(split + 1),
        url: base,
      },
    ]);
    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.locator("h1").waitFor();
    await page.waitForTimeout(500);
    const result = await context.request.post(base + "/api/question", {
      data: {
        courseId,
        chapterId,
        question: {
          type: "matching",
          prompt: "Ordne Vermögen und Kapital den Bilanzseiten zu.",
          options: ["Vermögen → Aktivseite", "Kapital → Passivseite"],
          answer: "Vermögen → Aktivseite; Kapital → Passivseite",
          explanation:
            "Die Aktivseite zeigt das Vermögen, die Passivseite das Kapital.",
          difficulty: 1,
          sources: [
            {
              documentId,
              page: 1,
              quote: "Die Bilanz zeigt Vermögen und Kapital.",
            },
          ],
        },
      },
    });
    assert.equal(result.status(), 200);
    await page.reload();
    await page.locator("h1").waitFor();
    await page.getByRole("button", { name: "Lernen", exact: true }).click();
    await page
      .getByRole("button", { name: /3Anwenden|3 Anwenden|Anwenden/ })
      .first()
      .click();
    await page
      .getByRole("heading", {
        name: "Ordne Vermögen und Kapital den Bilanzseiten zu.",
      })
      .waitFor();
    const columns = page.locator(".match-columns>div");
    await columns
      .nth(0)
      .getByRole("button", { name: "Vermögen", exact: true })
      .click();
    await columns
      .nth(1)
      .getByRole("button", { name: "Aktivseite", exact: true })
      .click();
    await columns
      .nth(0)
      .getByRole("button", { name: "Kapital", exact: true })
      .click();
    await columns
      .nth(1)
      .getByRole("button", { name: "Passivseite", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Antwort prüfen", exact: true })
      .click();
    await page.locator(".feedback.correct").waitFor();
    assert.ok(
      (await page.locator(".feedback.correct").innerText()).includes(
        "Richtig zugeordnet",
      ),
    );
    await page.screenshot({ path: "learning-desktop.png", fullPage: true });
    for (const [width, height, label] of [
      [1024, 1366, "tablet"],
      [390, 844, "mobile"],
    ]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(500);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.screenshot({
        path: "learning-" + label + ".png",
        fullPage: true,
      });
    }
    await page.getByRole("button", { name: "Design wechseln" }).click();
    await page.waitForTimeout(500);
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
    await page.screenshot({ path: "learning-dark-mobile.png", fullPage: true });
    await page.getByRole("button", { name: "Menü", exact: true }).click();
    await page
      .getByRole("button", { name: "Einstellungen", exact: true })
      .click();
    const connect = page.getByRole("button", {
      name: "Continue with ChatGPT",
      exact: true,
    });
    await connect.waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({ path: "chatgpt-mobile.png", fullPage: true });
    // Only verify the browser handoff. Real OpenAI consent requires the account owner.
    await page.route("https://auth.openai.com/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<p>OAuth browser handoff verified by test.</p>",
      }),
    );
    await connect.click();
    await page.waitForURL("https://auth.openai.com/**");
    const oauth = new URL(page.url());
    assert.equal(oauth.pathname, "/api/accounts/authorize");
    assert.equal(oauth.searchParams.get("client_id"), "dynamic_agent_client");
    assert.equal(
      oauth.searchParams.get("redirect_uri"),
      base + "/api/chatgpt/callback",
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: browser learning phases, touch matching, server grading, desktop/tablet/mobile, dark mode and no page errors.",
    );
  } finally {
    await browser.close();
  }
};
