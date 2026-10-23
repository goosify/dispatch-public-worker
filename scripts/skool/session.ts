import { z } from "zod";

const cookie = z.object({
  name: z.string(),
  value: z.string(),
  domain: z.string(),
  path: z.string(),
  expires: z.number(),
  httpOnly: z.boolean(),
  secure: z.boolean(),
  sameSite: z.enum(["Strict", "Lax", "None"]),
});
const stateSchema = z.object({
  cookies: z.array(cookie),
  origins: z.array(
    z.object({
      origin: z.string(),
      localStorage: z.array(z.object({ name: z.string(), value: z.string() })),
    }),
  ),
});

// Only the dedicated Skool login is portable. Never copy a user's Chrome profile.
export function skoolState(raw: unknown) {
  const state = stateSchema.parse(raw);
  return {
    cookies: state.cookies.filter((c) =>
      ["skool.com", ".skool.com", "www.skool.com"].includes(c.domain),
    ),
    origins: state.origins.filter((o) =>
      ["https://www.skool.com", "https://skool.com"].includes(o.origin),
    ),
  };
}

export function communityUrl(raw: string) {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "www.skool.com" ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    !/^\/[a-z0-9][a-z0-9-]*\/?$/.test(url.pathname)
  ) {
    throw new Error(
      "Use a Skool community URL, such as https://www.skool.com/example.",
    );
  }
  return url.origin + url.pathname.replace(/\/$/, "");
}

// This intentionally does not use a public feed as proof of authentication.
export function profileMatches(hrefs: string[], expectedHandle: string) {
  if (!/^@[a-z0-9_-]+$/i.test(expectedHandle)) return false;
  return hrefs.some((href) => {
    try {
      const url = new URL(href, "https://www.skool.com");
      return (
        url.hostname === "www.skool.com" &&
        url.pathname.toLowerCase() === "/" + expectedHandle.toLowerCase()
      );
    } catch {
      return false;
    }
  });
}
