import type {SkoolSource} from './feed';
import type {MonitorEvent} from './extract';
import type {Extraction} from './contracts';
export const isLocationAnnouncement=(source: Pick<SkoolSource,'title'>)=>/\b(?:location|venue|address)\s+(?:update|change)\b/i.test(source.title);
// Narrow, literal extraction for explicit location announcements. Ambiguous posts
// still go to the model/review; do not infer an address or an event date.
export function explicitLocationUpdate(source: SkoolSource, events: MonitorEvent[]): Extraction | null {
 if(!isLocationAnnouncement(source))return null;
 const normalize=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const title=normalize(source.title);
 const matches=events.filter(e=>[e.city,e.city.replace(/ City$/,'')].some(city=>title.includes(normalize(city))));
 if(matches.length!==1)return null;
 const venue=source.body.match(/(?:^|\n)\s*(?:meetup in|meet(?:ing)? at|we(?:’|')?re now at|we are now at)\s+([^\n🌉]+?)(?:\s+w\/|\s+with the bus|🌉|\n|$)/i)?.[1]?.trim();
 const address=source.body.match(/(?:^|\n)\s*📍\s*(\d[^\n]+)/)?.[1]?.trim();
 if(!venue||!address||!normalize(address).includes(normalize(matches[0].city)))return null;
 return {needsReview:false,reason:'Explicit location announcement with literal venue and address.',changes:[{eventId:matches[0].id,event_date:null,start_time:null,timezone:null,venue_name:venue,venue_address:address}]};
}
