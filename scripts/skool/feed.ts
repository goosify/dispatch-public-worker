import { createHash } from "node:crypto";
import { communityUrl } from "./session";

export interface SkoolSource {
  id: string;
  url: string;
  authorId: string;
  author: string;
  title: string;
  body: string;
  createdAt: string;
  fingerprint: string;
}
type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : {};
const text = (value: unknown) => (typeof value === "string" ? value : "");

/** Extract only source content, never account metadata, cookies or billing data.
 * Accepts the observed Skool postTrees shape. Changed/private-page schemas fail
 * closed so a login wall cannot be recorded as a successful empty scan.
 */
export function parseSkoolFeed(raw: unknown, groupUrl: string): SkoolSource[] {
  const root = communityUrl(groupUrl);
  const props = record(record(record(raw).props).pageProps);
  const slug = new URL(root).pathname.slice(1);
  if (
    record(props.currentGroup).name !== slug ||
    !Array.isArray(props.postTrees)
  )
    throw new Error("Skool feed is unavailable or its format changed.");
  const sources = new Map<string, SkoolSource>();
  let visited = 0;
  function visit(value: unknown, parentUrl = "", depth = 0) {
    if (++visited > 10000 || depth > 20)
      throw new Error("Skool feed exceeded the safe parsing limit.");
    if (Array.isArray(value)) {
      for (const child of value) visit(child, parentUrl, depth + 1);
      return;
    }
    const node = record(value);
    const post = record(node.post);
    let url = parentUrl;
    if (Object.keys(post).length) {
      const name = text(post.name);
      if (!parentUrl && /^[a-z0-9][a-z0-9-]*$/.test(name))
        url = root + "/" + name;
      const metadata = record(post.metadata);
      const user = record(post.user);
      const id = text(post.id);
      const body = text(metadata.content);
      const title = text(metadata.title);
      const authorId = text(user.id);
      const author = [text(user.firstName), text(user.lastName)]
        .filter(Boolean)
        .join(" ");
      const createdAt = text(post.createdAt);
      if (
        !id ||
        !url ||
        !authorId ||
        !author ||
        !Number.isFinite(Date.parse(createdAt))
      )
        throw new Error(
          `A Skool source is missing required fields: ${[!id && "id", !url && "url", !authorId && "authorId", !author && "author", !Number.isFinite(Date.parse(createdAt)) && "date"].filter(Boolean).join(", ")}.`,
        );
      if (body.length > 50000 || title.length > 1000)
        throw new Error("Skool source text exceeded the safe parsing limit.");
      const fingerprint = createHash("sha256")
        .update(JSON.stringify([id, authorId, title, body]))
        .digest("hex");
      sources.set(id, {
        id,
        url,
        authorId,
        author,
        title,
        body,
        createdAt,
        fingerprint,
      });
    }
    // Only traverse the post tree; metadata/currentUser are never returned.
    for (const [key, child] of Object.entries(node))
      if (key !== "post" && child && typeof child === "object")
        visit(child, url, depth + 1);
  }
  visit(props.postTrees);
  return [...sources.values()];
}

export function changedSources(
  sources: SkoolSource[],
  previous: Record<string, string> | null,
) {
  // The first scan establishes a baseline, avoiding a flood of old posts.
  return previous === null
    ? []
    : sources.filter((source) => previous[source.id] !== source.fingerprint);
}
