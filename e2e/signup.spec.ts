import { test, expect, type Page } from "@playwright/test";

// Forces English so text assertions don't depend on the viewer's
// Accept-Language (the app defaults content off a `locale` cookie — see
// i18n/request.ts and lib/locales.ts).
async function setEnglishLocale(page: Page, baseURL: string) {
  await page.context().addCookies([{ name: "locale", value: "en", url: baseURL }]);
}

async function fillCommonFields(page: Page, email: string) {
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill("TestPassword123!");
  await page.getByPlaceholder("e.g. Van Damme Cleaning bv").fill("Playwright Test Company BV");
  await page.getByPlaceholder("e.g. Antwerp").fill("Brussels");
}

test.describe("Signup", () => {
  // Regression coverage for the beta bug where clicking "Sign up" silently
  // did nothing: the <form> had no method/action, so if the page's client
  // JS ever failed to hydrate (a blocked/failed script chunk, a content
  // blocker, a cold-start hiccup on the host), the browser fell back to a
  // plain native form submission — which reloaded the page and discarded
  // every field with zero visible error and zero request to the signup
  // API. The fix (app/signup/page.tsx + app/api/signup-fallback/route.ts)
  // gives the form a real method/action so that native fallback lands on a
  // visible error banner instead. This test disables JS entirely to
  // reproduce "hydration never happened" deterministically, without
  // depending on which specific script chunk fails in production.
  test("shows a visible error banner instead of silently discarding the form when JS never hydrates", async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
    const page = await context.newPage();
    await setEnglishLocale(page, baseURL!);
    await page.goto("/signup");

    await fillCommonFields(page, `qa-nojs-${Date.now()}@tenderproc.com`);
    // Sector/terms checkboxes aren't natively `required` (that check only
    // runs in the client onSubmit), so leaving them unchecked doesn't block
    // the native submission this test is exercising.
    await page.locator('button:has-text("Sign up")').click();

    await expect(page).toHaveURL(/\/signup\?hydrationFailed=1/);
    await expect(
      page.getByText(/Part of this page failed to load/i)
    ).toBeVisible();

    await context.close();
  });

  test("shows a client-side validation error when no sector is picked", async ({ page, baseURL }) => {
    await setEnglishLocale(page, baseURL!);
    await page.goto("/signup");

    await fillCommonFields(page, `qa-novalidation-${Date.now()}@tenderproc.com`);
    await page.getByLabel(/I agree to the Terms of Service/).check();
    await page.getByRole("button", { name: "Sign up" }).click();

    await expect(page.getByText("Pick at least one sector.")).toBeVisible();
    // Client-side validation should stop the submit before any navigation.
    await expect(page).toHaveURL(/\/signup$/);
  });

  test("completes signup and reaches the check-your-email confirmation", async ({ page, baseURL }) => {
    await setEnglishLocale(page, baseURL!);
    await page.goto("/signup");

    await fillCommonFields(page, `qa-signup-${Date.now()}@tenderproc.com`);
    await page.getByLabel("IT, software & telecom").check();
    await page.getByLabel(/I agree to the Terms of Service/).check();
    await page.getByRole("button", { name: "Sign up" }).click();

    await expect(
      page.getByRole("heading", { name: "Check your email" })
    ).toBeVisible({ timeout: 15_000 });
  });
});
