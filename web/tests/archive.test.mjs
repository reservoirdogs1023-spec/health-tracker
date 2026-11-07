import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardFromArchive, rowsFromArchive } from '../src/archive.ts';

test('all six categories survive migration while pending input overlays the visible dashboard', () => {
  const archive = {
    body: [{ date:'2026-11-01', weight:70, bodyFat:20 }],
    sleep: [{ date:'2026-11-01', hours:7, nightHours:6, napHours:1 }],
    exercise: [{date:'2026-11-01',type:'ストレッチ'}],
    workout: [{ recordKey:'stable-1',date:'2026-11-01',time:'08:15:00',species:'Running',durationMinutes:30,distanceKm:5,caloriesKcal:null }],
    pending: [{ date:'2026-11-01', weight:69,bodyFat:null,nightHours:null,napHours:null }],
    vo2: [{date:'2026-11-01',value:45,source:'export'}],
  };
  assert.deepEqual(dashboardFromArchive(archive), {
    body: [{date:'2026-11-01',weight:69,bodyFat:20}], sleep: archive.sleep, exercise: archive.exercise, workout: archive.workout,
  });
  const rows = rowsFromArchive(archive);
  assert.equal(rows.length, 6);
  assert.deepEqual(rows.find(r=>r.category==='workout'), {category:'workout',key:'stable-1',payload:archive.workout[0]});
  assert.deepEqual(rows.find(r=>r.category==='vo2')?.payload, {date:'2026-11-01',value:45,source:'export'});
});
