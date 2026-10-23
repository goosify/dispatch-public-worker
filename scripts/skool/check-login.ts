import { workerConfig } from "./worker-config";
import { chromium, type Browser, type BrowserContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { communityUrl, profileMatches, skoolState } from "./session";

class LoginCheckError extends Error {}

async function check(context: BrowserContext, url: string, handle: string) {
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  if (!response?.ok() || new URL(page.url()).pathname !== new URL(url).pathname)
    throw new LoginCheckError(
      "Skool did not open the requested community. Login or access needs attention.",
    );
  // The profile action in the account menu distinguishes an authenticated viewer
  // from the account appearing as an author in an otherwise public community feed.
  const account = page.getByAltText(workerConfig.accountName, { exact: true }).first();
  await account.waitFor({ state: "visible" });
  const position = await account.boundingBox();
  if (!position || position.y < 0 || position.y > 100)
    throw new LoginCheckError(
      "The account avatar was not found in the Skool header.",
    );
  await account.click();
  await page
    .getByText("Log out", { exact: true })
    .waitFor({ state: "visible" });
  await page.getByText("Profile", { exact: true }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/@"));
  if (!profileMatches([page.url()], handle))
    throw new LoginCheckError(
      "The signed-in Skool account does not match the configured account. Reconnect the dedicated login.",
    );
  await page.close();
}

async function main() {
  const url = communityUrl(
    workerConfig.testCommunity,
  );
  const handle = "@" + workerConfig.accountHandle;
  const text =
    process.env.SKOOL_STORAGE_STATE ||
    (await readFile(".data/skool-auth/state.json", "utf8"));
  const state = skoolState(JSON.parse(text));
  if (!state.cookies.length)
    throw new LoginCheckError("No Skool login cookies configured.");
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({
      channel: process.env.CI ? undefined : "chrome",
    });
    const first = await browser.newContext({ storageState: state });
    await check(first, url, handle);
    const refreshed = skoolState(await first.storageState());
    await first.close();
    // Recreate a context to prove the login survives session restoration.
    const second = await browser.newContext({ storageState: refreshed });
    await check(second, url, handle);
    await second.close();
    console.log(
      "Skool login verified in two fresh browser contexts. No event updates or messages sent.",
    );
  } finally {
    await browser?.close();
  }
}
main().catch((error: unknown) => {
  // Browser exceptions can contain page content, URLs or session values.
  console.error(
    error instanceof LoginCheckError
      ? error.message
      : "Skool login test failed. Check authentication, community access, and account-menu selectors locally. No changes were made.",
  );
  process.exitCode = 1;
});
