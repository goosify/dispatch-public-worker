import {appendFile} from 'node:fs/promises';
import {planGroups} from './plan.mjs';
const base = process.env.DISPATCH_URL || '';
try {
  if (new URL(base).origin !== base || !base.startsWith('https://') || !process.env.SKOOL_MONITOR_SECRET) throw Error();
  const response = await fetch(`${base}/api/monitor/skool`, {headers:{Authorization:`Bearer ${process.env.SKOOL_MONITOR_SECRET}`},signal:AbortSignal.timeout(20000)});
  if (!response.ok) throw Error();
  const groups=planGroups(await response.json());
  await appendFile(process.env.GITHUB_OUTPUT, `due=${groups.length > 0}\n`);
  console.log(groups.length ? `${groups.length} communities due; continue collection.` : 'No communities due; skip dependencies and browser setup.');
} catch {
  console.error('Monitor preflight failed; no checkpoints changed. Next scheduled run will retry.');
  process.exitCode=1;
}
