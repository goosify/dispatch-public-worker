// Shared by the dependency-free preflight and the browser worker.
export function urgentEvent(startsAt, now = Date.now()) {
  const delta = Date.parse(startsAt) - now;
  return Number.isFinite(delta) && delta <= 24 * 3600000 && delta >= -6 * 3600000;
}
export function communityDue(lastScan, urgent, now = Date.now()) {
  return urgent || !lastScan || !Number.isFinite(Date.parse(lastScan)) || now - Date.parse(lastScan) >= 2 * 3600000;
}
export function communityRoot(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'www.skool.com' || url.port || !/^[a-z0-9][a-z0-9-]*$/.test(url.pathname.split('/').filter(Boolean)[0] || '')) throw Error('Invalid community URL');
  return url.origin + '/' + url.pathname.split('/').filter(Boolean)[0];
}
export function planGroups(state, now = Date.now()) {
  const groups = [...new Set(state.events.map(e => communityRoot(e.skool_post_url)))];
  const urgent = groups.filter(g => state.events.some(e => communityRoot(e.skool_post_url) === g && urgentEvent(e.starts_at, now)));
  const due = g => communityDue(state.groups.find(x => x.group_url === g)?.scanned_at, urgent.includes(g), now);
  const soon = [...new Set([...urgent, ...groups.slice(0, 6)])].filter(due);
  const others = groups.filter(g => !soon.includes(g) && due(g)).sort((a,b) => Date.parse(state.groups.find(g => g.group_url === a)?.scanned_at || '1970-01-01') - Date.parse(state.groups.find(g => g.group_url === b)?.scanned_at || '1970-01-01')).slice(0,2);
  return [...soon, ...others];
}
