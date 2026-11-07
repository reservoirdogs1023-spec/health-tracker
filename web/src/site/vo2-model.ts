import type {Vo2Record} from './vo2-api.ts';
export function buildVo2Series(records:Vo2Record[],buckets:Array<{key:string;label:string}>){
 const sorted=[...records].sort((a,b)=>a.date.localeCompare(b.date));
 return buckets.map(bucket=>{const rows=sorted.filter(r=>r.date.startsWith(bucket.key));return {...bucket,vo2:rows.at(-1)?.value??null};});
}
