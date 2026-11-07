'use client';
import {ChartHover} from './chart-hover';
import type {Vo2Record} from '../../site/vo2-api';
import {buildVo2Series} from '../../site/vo2-model';
export function Vo2Chart({records,buckets}:{records:Vo2Record[];buckets:Array<{key:string;label:string}>}){
 const points=buildVo2Series(records,buckets);
 const valid=points.filter(p=>p.vo2!==null);
 const plotted=points.flatMap((point,index)=>point.vo2===null?[]:[{...point,vo2:point.vo2,index}]);
 const latest=[...records].sort((a,b)=>a.date.localeCompare(b.date)).at(-1);
 const low=valid.length?Math.floor(Math.min(...valid.map(p=>p.vo2!))-0.5):0;
 const high=valid.length?Math.ceil(Math.max(...valid.map(p=>p.vo2!))+0.5):1;
 const x=(i:number)=>44+(i+0.5)*530/points.length;
 const y=(v:number)=>174-(v-low)/(high-low)*150;
 return <article className="card run-chart" data-run-metric="vo2"><div className="run-chart-heading"><h3>VO2max</h3><p><strong>{valid.at(-1)?.vo2??'データなし'}</strong><small>ml/(kg·min) · 期間内の最新値</small></p></div>
 {valid.length===0?<div className="run-empty">データなし</div>:<ChartHover key={points.map(p=>p.key).join('|')} label="VO2max" color="var(--run-vo2)" points={points.map((p,i)=>({key:p.key,x:x(i),y:p.vo2===null?174:y(p.vo2),value:p.vo2===null?'データなし':`${p.vo2} ml/(kg·min)`}))}><svg viewBox="0 0 600 210" role="img" aria-label="VO2maxの推移。記録のある点を線で結んでいます。日別の値は記録一覧で確認できます。">
 <defs><linearGradient id="run-gradient-vo2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--run-vo2)" stopOpacity=".28"/><stop offset="100%" stopColor="var(--run-vo2)" stopOpacity="0"/></linearGradient></defs>
 {plotted.length>1&&<polygon points={`${x(plotted[0].index)},174 ${plotted.map(p=>`${x(p.index)},${y(p.vo2)}`).join(' ')} ${x(plotted.at(-1)!.index)},174`} fill="url(#run-gradient-vo2)"/>}
 {[0,1,2,3].map(i=><g key={i}><line x1="44" x2="574" y1={24+i*50} y2={24+i*50} stroke="var(--grid)"/><text x="38" y={28+i*50} textAnchor="end">{(high-(high-low)*i/3).toFixed(1)}</text></g>)}
 {plotted.map((p,i)=><g key={p.key}><title>{`${p.key}: ${p.vo2} ml/(kg·min)`}</title>{i>0&&<line x1={x(plotted[i-1].index)} y1={y(plotted[i-1].vo2)} x2={x(p.index)} y2={y(p.vo2)} stroke="var(--run-vo2)" strokeWidth="2.5" strokeLinecap="round"/>}<circle cx={x(p.index)} cy={y(p.vo2)} r="4" fill="var(--run-vo2)" stroke="var(--card)" strokeWidth="1.5"/></g>)}
 {points.map((p,i)=>i%(points.length>15?5:1)===0||i===points.length-1?<text key={p.key} x={x(i)} y="197" textAnchor="middle">{p.label}</text>:null)}
 </svg></ChartHover>}
 <p className="run-note">Apple推定。年表示は各月の最新値。記録のある点を線で結び、未記録の日には点を置きません。{latest&&<> 全期間の最新：{latest.date} · {latest.value} ml/(kg·min)</>}</p>
 <details className="run-more"><summary>VO2maxの全記録（{records.length}日）</summary><div style={{overflowX:'auto'}}><table><thead><tr><th scope="col">日付</th><th scope="col">ml/(kg·min)</th><th scope="col">出典</th></tr></thead><tbody>{[...records].sort((a,b)=>b.date.localeCompare(a.date)).map(r=><tr key={r.date}><td>{r.date}</td><td>{r.value}</td><td>{r.source==='journal'?'日誌（丸め済み）':'Health Auto Export'}</td></tr>)}</tbody></table></div></details>
 </article>;
}
