import { z } from "zod";
const schema = z.object({
  authorIds: z.array(z.string().regex(/^[a-f0-9]{32}$/)).min(1),
  accountId: z.string().regex(/^[a-f0-9]{32}$/),
  accountHandle: z.string().regex(/^[a-z0-9_-]+$/i),
  accountName: z.string().min(1),
  testCommunity: z.string().url(),
});
function load() {
  try { return schema.parse(JSON.parse(process.env.WORKER_CONFIG || "")); }
  catch { throw new Error("Worker configuration is missing or invalid."); }
}
export const workerConfig = load();
