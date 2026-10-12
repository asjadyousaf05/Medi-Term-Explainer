import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

async function signIn(page: Page, email = "admin@example.com") {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("BrowserTest!1234");
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?.*)?$/);
}

test("login hydrates under CSP and logout revokes the session", async ({
  page,
  context,
}) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/content security policy|refused to execute/i.test(message.text()))
      violations.push(message.text());
  });
  await page.goto("/login");
  await expect(page.getByLabel("MFA code", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Use an authenticator code" }).click();
  await expect(page.getByLabel("MFA code", { exact: true })).toBeVisible();
  await page.getByLabel("MFA code", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Hide authenticator code" }).click();
  await expect(page.getByLabel("MFA code", { exact: true })).toHaveCount(0);
  await page.getByLabel("Email", { exact: true }).fill("admin@example.com");
  await page.getByLabel("Password", { exact: true }).fill("WrongPassword!123");
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page.locator("#login-error")).toHaveText(
    "Sign-in was not accepted. Check your email and password.",
  );
  await signIn(page);
  await expect(
    page.getByRole("heading", { name: "Governance dashboard" }),
  ).toBeVisible();
  const cookie = (await context.cookies()).find(
    (item) => item.name === "mediexplain_admin",
  );
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Strict");
  expect(
    await page
      .locator("script:not([src])")
      .evaluateAll((scripts) =>
        scripts.every((script) => Boolean((script as HTMLScriptElement).nonce)),
      ),
  ).toBe(true);
  expect(violations).toEqual([]);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/imports");
  await expect(page).toHaveURL(/\/login$/);
});

test("editor lands on an allowed page and support can open the dashboard", async ({
  page,
}) => {
  await signIn(page, "editor@example.com");
  await expect(page).toHaveURL(/\/content\/terminology$/);
  await expect(
    page.getByRole("link", { name: "Audit logs", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await signIn(page, "support@example.com");
  await expect(
    page.getByRole("heading", { name: "Governance dashboard" }),
  ).toBeVisible();
});

test("CSV dry run and confirmed apply work with recoverable validation errors", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/imports");
  await page
    .getByLabel("Authoritative source name")
    .fill("Reviewed browser fixture");
  await page.getByLabel("Source version").fill("browser-v1");
  await page.getByLabel("CSV dataset").setInputFiles({
    name: "products.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Registration Number,Brand Name,Composition,Dosage Form\nBROWSER-1,Test product,Test ingredient 10mg,tablet\n",
    ),
  });
  await page
    .getByRole("button", { name: "Validate dataset", exact: true })
    .click();
  const success = page.getByRole("status");
  await expect(success).toContainText("Validation passed");
  const job = (await success.innerText()).match(
    /[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/,
  )?.[0];
  expect(job).toBeTruthy();
  await page.getByLabel("Validated job ID", { exact: true }).fill(job!);
  await page.getByLabel("Repeat job ID to confirm").fill(job!);
  await page.getByRole("button", { name: "Apply reviewed import" }).click();
  await expect(page.getByRole("status").last()).toContainText(
    "applied successfully",
  );
  await page.getByRole("button", { name: "Apply reviewed import" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Authoritative source name")).toBeVisible();
});

test("all administrator navigation pages load real API data", async ({
  page,
}) => {
  await signIn(page);
  await expect(
    page.getByRole("heading", { name: "Governance dashboard" }),
  ).toBeVisible();
  const paths = await page
    .locator("nav a")
    .evaluateAll(
      (links) =>
        [...new Set(links.map((link) => link.getAttribute("href")))].filter(
          Boolean,
        ) as string[],
    );
  for (const route of paths) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    await expect(
      page.getByRole("heading", { name: "Could not load this page" }),
    ).toHaveCount(0);
    await expect(page.locator("main h1")).toBeVisible();
  }
});

test("a reference release can be inspected, independently approved, and published", async ({
  page,
  request,
}) => {
  const document = JSON.parse(
    readFileSync(
      path.resolve("../mobile/assets/terminology/starter_dataset_v1.json"),
      "utf8",
    ),
  );
  document.dataset_version = "browser-reviewed-release-v2";
  await signIn(page, "editor@example.com");
  await page.goto("/content/dataset/new");
  await page.getByLabel("Stable ID", { exact: true }).fill("browser.reference");
  await page
    .getByLabel("Versioned content JSON")
    .fill(JSON.stringify(document));
  await page
    .getByLabel("Source metadata JSON")
    .fill(JSON.stringify({ provider: "Browser review fixture" }));
  await page
    .getByLabel("Change reason")
    .fill("Reference release browser verification");
  await page.getByRole("button", { name: "Save draft revision" }).click();
  await expect(page).toHaveURL(/\/content\/dataset$/);
  await page
    .getByRole("link", { name: "browser.reference", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Source attribution" }),
  ).toBeVisible();
  await expect(
    page.getByText("Browser review fixture", { exact: false }),
  ).toBeVisible();
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Ready for independent review");
  await page
    .getByLabel("Repeat stable ID to confirm")
    .fill("browser.reference");
  await page.getByRole("button", { name: "Apply action" }).click();
  await expect(
    page.getByRole("heading", { name: "Revision 1 · in_review" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await signIn(page, "reviewer@example.com");
  await page.goto("/content/dataset/browser.reference");
  await expect(
    page.getByRole("link", { name: "Create revised draft" }),
  ).toHaveCount(0);
  for (const action of ["approve", "publish"]) {
    await page
      .getByRole("combobox", { name: "Action", exact: true })
      .selectOption(action);
    await page
      .getByLabel("Reason", { exact: true })
      .fill("Independently reviewed fixture and source attribution");
    await page
      .getByLabel("Repeat stable ID to confirm")
      .fill("browser.reference");
    await page.getByRole("button", { name: "Apply action" }).click();
    await expect(
      page.getByRole("heading", {
        name: `Revision 1 · ${action === "approve" ? "approved" : "published"}`,
      }),
    ).toBeVisible();
  }
  const response = await request.get(
    "http://127.0.0.1:18080/api/v1/content/dataset",
  );
  expect(response.ok()).toBe(true);
  expect((await response.json()).dataset_version).toBe(
    "browser-reviewed-release-v2",
  );
});

test("small screens have a usable menu and contained tables", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  const toggle = page.getByRole("button", { name: "Open menu", exact: true });
  await expect(toggle).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Imports", exact: true }),
  ).toBeHidden();
  await toggle.click();
  await page.getByRole("link", { name: "Imports", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Import jobs" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open menu", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("admin-mobile.png"),
    fullPage: true,
  });
});

test("dashboard totals, activity periods, and recent-content filters use persisted records", async ({
  page,
  context,
  request,
}) => {
  await signIn(page);
  await expect(
    page.getByText("FYP demo workspace", { exact: true }),
  ).toBeVisible();
  const token = (await context.cookies()).find(
    (cookie) => cookie.name === "mediexplain_admin",
  )!.value;
  const response = await request.get(
    "http://127.0.0.1:18080/api/v1/admin/dashboard",
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const snapshot = await response.json();
  await expect(
    page
      .locator(".metric-card")
      .filter({ hasText: "Content records" })
      .locator(".metric-value"),
  ).toHaveText(String(snapshot.content.total));
  await page.getByLabel("Activity period").selectOption("14");
  await expect(page).toHaveURL(/days=14/);
  await expect(
    page.getByRole("img", { name: /editorial events over 14 days/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "In review", exact: true }).click();
  await expect(page.locator(".content-table tbody tr").first()).toBeVisible();
  const badges = await page
    .locator(".content-table tbody .status")
    .allTextContents();
  expect(badges.every((label) => label === "in review")).toBe(true);
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Governance dashboard" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("workspace search, table filtering, and pagination work", async ({
  page,
}) => {
  await signIn(page);
  const search = page.getByLabel("Find an administration page");
  await search.fill("Imports");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/imports$/);
  await page
    .getByRole("searchbox", { name: "Search records", exact: true })
    .fill("missing_registration_id");
  await expect(page.locator(".records-panel tbody tr")).toHaveCount(1);
  await page.goto("/versions");
  await expect(page.locator(".records-panel tbody tr")).toHaveCount(10);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator(".records-panel .panel-footer")).toContainText(
    "11–20",
  );
  await page
    .getByRole("searchbox", { name: "Search records", exact: true })
    .fill("term-hypertension");
  await expect(page.locator(".records-panel tbody tr")).toHaveCount(1);
});

test("dashboard report links prefill an audited resolution and update the totals", async ({
  page,
}) => {
  await signIn(page);
  const before = Number(
    await page
      .locator(".metric-card")
      .filter({ hasText: "Reports to resolve" })
      .locator(".metric-value")
      .innerText(),
  );
  await page.locator(".report-item").first().click();
  const id = await page.getByLabel("Report ID", { exact: true }).inputValue();
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("resolved");
  await page
    .getByLabel("Resolution note", { exact: true })
    .fill("Resolved the synthetic report during browser verification.");
  await page.getByLabel("Type report ID to confirm", { exact: true }).fill(id);
  await page.getByRole("button", { name: "Apply audited resolution" }).click();
  await expect(page.getByRole("status")).toContainText(
    "completed successfully",
  );
  await page.goto("/");
  await expect(
    page
      .locator(".metric-card")
      .filter({ hasText: "Reports to resolve" })
      .locator(".metric-value"),
  ).toHaveText(String(before - 1));
});
