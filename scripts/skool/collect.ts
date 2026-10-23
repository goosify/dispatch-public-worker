import type { Page } from "@playwright/test";
import { parseSkoolFeed, type SkoolSource } from "./feed";
import { workerConfig } from "./worker-config";
import { teamAuthors } from "./contracts";
// Convert only the observed comments API's snake-case field names; extraction
// still goes through the same bounded source parser, excluding account metadata.
function camel(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camel);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, v]) => [
      key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
      camel(v),
    ]),
  );
}
export function commentSources(
  raw: unknown,
  rootPost: unknown,
  groupUrl: string,
): SkoolSource[] {
  const data = camel(raw) as {
    postTree?: { children?: unknown[] };
    pinnedPostTree?: unknown;
  };
  if (!Array.isArray(data.postTree?.children))
    throw new Error("Comment response format changed.");
  return parseSkoolFeed(
    {
      props: {
        pageProps: {
          currentGroup: { name: new URL(groupUrl).pathname.slice(1) },
          postTrees: [
            {
              post: rootPost,
              children: [
                ...data.postTree.children,
                ...(data.pinnedPostTree ? [data.pinnedPostTree] : []),
              ],
            },
          ],
        },
      },
    },
    groupUrl,
  );
}
export async function collectCommunity(
  page: Page,
  groupUrl: string,
  threadOffset = 0,
) {
  const sources = new Map<string, SkoolSource>();
  const warnings: string[] = [];
  const response = await page.goto(groupUrl, {
    waitUntil: "domcontentloaded",
    timeout: 20000,
  });
  if (!response?.ok()) throw new Error("Community unavailable.");
  const raw = JSON.parse(
    (await page
      .locator("script#__NEXT_DATA__")
      .textContent({ timeout: 10000 }))!,
  );
  const props = raw.props.pageProps;
  if (
    props.self?.id !== workerConfig.accountId ||
    props.self?.name !== workerConfig.accountHandle
  )
    throw new Error("Dedicated Skool login expired or changed.");
  for (const source of parseSkoolFeed(raw, groupUrl))
    sources.set(source.id, source);
  // Follow only pagination links actually rendered by Skool.
  const links = await page
    .locator("a[href]")
    .evaluateAll((nodes) => nodes.map((n) => (n as HTMLAnchorElement).href));
  const next = links.find((link) => {
    const u = new URL(link);
    return (
      u.origin === "https://www.skool.com" &&
      u.pathname === new URL(groupUrl).pathname &&
      u.searchParams.get("p") === "2"
    );
  });
  const roots = [...(props.postTrees ?? [])];
  if (next) {
    await page.goto(next, { waitUntil: "domcontentloaded", timeout: 15000 });
    const more = JSON.parse(
      (await page.locator("script#__NEXT_DATA__").textContent())!,
    );
    for (const source of parseSkoolFeed(more, groupUrl))
      sources.set(source.id, source);
    roots.push(...more.props.pageProps.postTrees);
  }
  const threads = [
    ...new Map<
      string,
      { post: { id: string; metadata: { comments: number } } }
    >(
      roots
        .filter(
          (t: { post: { id: string; metadata: { comments: number } } }) =>
            Number(t.post?.metadata?.comments) > 0,
        )
        .map(
          (t: { post: { id: string; metadata: { comments: number } } }) =>
            [t.post.id, t] as const,
        ),
    ).values(),
  ];
  const selected = threads.slice(threadOffset, threadOffset + 4);
  for (const tree of selected) {
    const root = sources.get(tree.post.id);
    if (!root) continue;
    const comments = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === `/posts/${tree.post.id}/comments` &&
        r.status() === 200,
      { timeout: 15000 },
    );
    // Attach rejection handling before navigation so a failed navigation cannot
    // leave an unhandled promise in the worker.
    const captured = comments.then((r) => r.json()).catch(() => null);
    await page.goto(root.url, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    const data = await captured;
    if (!data) throw new Error("Comments could not be collected.");
    const commentsParsed = commentSources(data, tree.post, groupUrl);
    for (const source of commentsParsed) sources.set(source.id, source);
    if (
      commentsParsed.filter((s) => s.id !== root.id).length <
      Number(tree.post.metadata.comments)
    )
      warnings.push("Some older comments were not included by Skool.");
  }
  return {
    sources: [...sources.values()].filter((s) => teamAuthors[s.authorId]),
    threadOffset: threadOffset + 4 >= threads.length ? 0 : threadOffset + 4,
    coverage: `First ${next ? 2 : 1} feed pages; ${selected.length}/${threads.length} comment threads this run, rotating older threads.${warnings.length ? " " + [...new Set(warnings)].join(" ") : ""}`,
  };
}
