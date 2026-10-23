import { isLocationAnnouncement } from './location-update';
import { planGroups } from "./plan.mjs";
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { skoolState, communityUrl } from "./session";
import { collectCommunity } from "./collect";
import { extractLogistics, type MonitorEvent } from "./extract";
import type { Extraction } from "./contracts";
const base =
  process.env.DISPATCH_URL || "";
if (new URL(base).origin !== base || !base.startsWith("https://"))
  throw new Error("Invalid Dispatch URL");
if (!process.env.SKOOL_MONITOR_SECRET || !process.env.GROQ_API_KEY)
  throw new Error("Monitor secrets are missing.");
async function api(method: string, body?: unknown) {
  const response = await fetch(`${base}/api/monitor/skool`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.SKOOL_MONITOR_SECRET}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Dispatch monitor API ${response.status}`);
  return response.json();
}
const state = (await api("GET")) as {
  events: (MonitorEvent & {starts_at: string})[];
  groups: {
    group_url: string;
    baseline_at: string;
    scanned_at: string | null;
    thread_cursor: number;
  }[];
  sources: { group_url: string; source_id: string; fingerprint: string; status?: string }[];
};
const root = (url: string) =>
  communityUrl(
    new URL(url).origin +
      "/" +
      new URL(url).pathname.split("/").filter(Boolean)[0],
  );
const planned = planGroups(state);
if (!planned.length) {
  console.log("No communities due for checking.");
  process.exit(0);
}
const browser = await chromium.launch({
  channel: process.env.CI_BROWSER_CHANNEL || (process.env.CI ? undefined : "chrome"),
});
let stage = "restore session";
let calls = 0,
  proposals = 0;
try {
  const auth =
    process.env.SKOOL_STORAGE_STATE ||
    (await readFile(".data/skool-auth/state.json", "utf8"));
  const context = await browser.newContext({
    storageState: skoolState(JSON.parse(auth)),
  });
  const page = await context.newPage();
  const started = Date.now();
  for (const group of planned) {
    if (Date.now() - started > 150000)
      throw new Error(
        "Collection time budget reached; remaining sources retry next run.",
      );
    stage = "collect community";
    const previous = state.groups.find((g) => g.group_url === group);
    const collected = await collectCommunity(
      page,
      group,
      previous?.thread_cursor ?? 0,
    );
    const pending: {
      source: (typeof collected.sources)[number];
      extraction: Extraction | null;
    }[] = [];
    for (const source of collected.sources) {
      const known = state.sources.find(
        (s) => s.group_url === group && s.source_id === source.id,
      );
      if (known?.fingerprint === source.fingerprint && known.status !== "baseline" && !(known.status === "ignored" && isLocationAnnouncement(source))) continue;
      let extraction: Extraction | null = null;
      if (Date.parse(source.createdAt) >= Date.now() - 30 * 86400000 || (known && known.status !== "baseline")) {
        if (calls >= 8)
          throw new Error(
            "Extraction batch limit reached; uncommitted sources retry next run.",
          );
        stage = "extract logistics";
        extraction = await extractLogistics(
          source,
          state.events.filter((e) => root(e.skool_post_url) === group),
        );
        calls++;
      }
      pending.push({ source, extraction });
    }
    // Small batches stay inside Dispatch's request size limit. No source cookies,
    // account metadata or unrelated community-member content leaves this worker.
    stage = "save checkpoints";
    if (!pending.length)
      await api("POST", {
        groupUrl: group,
        sources: [],
        coverage: collected.coverage,
        threadCursor: collected.threadOffset,
      });
    for (let i = 0; i < pending.length; i += 3) {
      const result = await api("POST", {
        groupUrl: group,
        sources: pending.slice(i, i + 3),
        coverage: collected.coverage,
        threadCursor: collected.threadOffset,
      });
      proposals += result.proposals;
    }
  }
  await api("PUT", { status: "succeeded" });
  console.log({
    communities: planned.length,
    extractions: calls,
    proposals,
  });
} catch (error) {
  await api("PUT", { status: "failed" }).catch(() => {});
  const message = error instanceof Error ? error.message : "";
  const safe =
    /^(Dispatch monitor API \d{3}|Groq extraction failed \(\d{3}\); checkpoint unchanged\.|Community unavailable\.|Dedicated Skool login expired or changed\.|Comments could not be collected\.|Comment response format changed\.)$/.test(
      message,
    )
      ? message
      : "Collection or extraction validation failed";
  console.error({ stage, reason: safe });
  console.error(
    "Skool monitor did not finish. Check login, collection coverage and API availability; committed checkpoints are safe.",
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
