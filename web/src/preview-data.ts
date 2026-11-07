import { emptyArchive } from './archive';

// LOCAL_PREVIEW_ONLY: fictional data; this module is excluded from production builds.
export function previewArchive(){
  const archive=emptyArchive();
  for(let i=0;i<60;i++){
    const d=new Date();d.setDate(d.getDate()-59+i);
    const date=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
    archive.body.push({date,weight:Number((70-i*.02+Math.sin(i)*.25).toFixed(2)),bodyFat:Number((22-i*.02).toFixed(1))});
    archive.sleep.push({date,hours:7,nightHours:6.5,napHours:.5});
    if(i%3===0)archive.workout.push({recordKey:`preview-${i}`,date,time:'08:00:00',species:'Running',durationMinutes:30+i*.1,distanceKm:5,caloriesKcal:300});
    if(i%7===0)archive.vo2.push({date,value:43+i*.03,source:'export'});
  }
  return archive;
}
