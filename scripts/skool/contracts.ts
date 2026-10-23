import { z } from "zod";
import { workerConfig } from "./worker-config";
export const teamAuthors = Object.fromEntries(workerConfig.authorIds.map(id => [id, true]));
export const extractionSchema = z
  .object({
    changes: z
      .array(
        z
          .object({
            eventId: z.uuid(),
            event_date: z.string().nullable(),
            start_time: z.string().nullable(),
            timezone: z.string().nullable(),
            venue_name: z.string().max(150).nullable(),
            venue_address: z.string().max(300).nullable(),
          })
          .strict(),
      )
      .max(5),
    needsReview: z.boolean(),
    reason: z.string().max(500),
  })
  .strict();
export type Extraction = z.infer<typeof extractionSchema>;
export const sourceSchema = z
  .object({
    id: z.string().regex(/^[a-f0-9]{32}$/),
    url: z.url(),
    authorId: z.string().regex(/^[a-f0-9]{32}$/),
    author: z.string().max(100),
    title: z.string().max(1000),
    body: z.string().max(20000),
    createdAt: z.iso.datetime({ offset: true }),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
