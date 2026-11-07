import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildVo2Series} from './vo2-model.ts';
test('period series leaves gaps empty and uses the latest daily value in each month without summing VO2max',()=>{
 const rows=[{date:'2026-01-02',value:30.125,source:'export' as const},{date:'2026-01-15',value:31.5,source:'journal' as const},{date:'2026-02-01',value:32,source:'export' as const}];
 const series=buildVo2Series(rows,[{key:'2026-01',label:'1月'},{key:'2026-02',label:'2月'},{key:'2026-03',label:'3月'}]);
 assert.deepEqual(series.map(b=>b.vo2),[31.5,32,null]);
 assert.deepEqual(buildVo2Series(rows,[{key:'2026-01-02',label:'2'},{key:'2026-01-03',label:'3'}]).map(b=>b.vo2),[30.125,null]);
});
