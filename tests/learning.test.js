import test from 'node:test';
import assert from 'node:assert/strict';
import { seedRecords, record, envelope, validateBackup, mergeRecords } from '../docs/core.js';
import { chapterProgress, latestStop, validatePack } from '../docs/learning-core.js';

const score = (childId, earned, total, complete = true) => record('chapter_result', {
  materialId: 'k5-phonics-a', chapterId: 'a-ch-01', childId, earned, total, complete, notes: ''
});
test('a shared lesson can produce 100% and 50% with separate mastery', () => {
  const records = [...seedRecords(), score('older',10,10), score('younger',5,10)];
  assert.equal(chapterProgress(records,'older','k5-phonics-a','a-ch-01').status,'Mastered');
  assert.equal(chapterProgress(records,'younger','k5-phonics-a','a-ch-01').status,'Needs practice');
  validateBackup(envelope('family',records,'device'));
});
test('covering a chapter without a score awaits assessment', () => {
  assert.equal(chapterProgress([score('older',null,null)],'older','k5-phonics-a','a-ch-01').status,'Awaiting score');
  assert.equal(chapterProgress([score('older',10,10,false)],'older','k5-phonics-a','a-ch-01').mastered,false);
});
test('review attempts retain earlier scores and use the latest result', () => {
  const first = {...score('younger',5,10),createdAt:'2026-11-06T00:00:00Z'};
  const later = {...score('younger',9,10),createdAt:'2026-11-07T00:00:00Z'};
  const r=chapterProgress(mergeRecords([first],[later]),'younger','k5-phonics-a','a-ch-01');
  assert.equal(r.percentage,90);assert.equal(r.attempts.length,2);
});
test('bookmark records do not imply mastery or a score', () => {
  const stop=record('lesson_stop',{materialId:'k5-phonics-a',chapterId:'a-ch-01',cardId:'c2',page:6,childIds:['older','younger']});
  const records=[...seedRecords(),stop];
  assert.equal(latestStop(records,'k5-phonics-a').cardId,'c2');
  assert.equal(chapterProgress(records,'older','k5-phonics-a','a-ch-01').mastered,false);
  validateBackup(envelope('family',records,'device'));
});
test('invalid scores and missing learner identities fail backup validation', () => {
  for(const r of [score('older',11,10),score('older',3,0),score('older',null,10),score('missing',5,5)]) {
    assert.throws(()=>validateBackup(envelope('family',[...seedRecords(),r],'device')));
  }
});
test('lesson records survive backup export, restore and merge', () => {
  const a=score('older',4,5),b=score('younger',2,5);
  const parsed=JSON.parse(JSON.stringify(envelope('family',[...seedRecords(),a,b],'device')));
  validateBackup(parsed);
  assert.equal(mergeRecords(parsed.records,parsed.records).length,parsed.records.length);
});
test('packs reject missing image content and unsafe image paths', () => {
  const m={format:'family-learning-pack',version:1,id:'k5-phonics-a',title:'A',original:'workbook.pdf',
    chapters:[{id:'chapter1',title:'m',cards:[{id:'card1',page:6,guide:'Say m.',label:'Sound',image:'cards/m.webp'}]}]};
  assert.throws(()=>validatePack(m,{'workbook.pdf':new Uint8Array()}));
  assert.equal(validatePack(m,{'workbook.pdf':new Uint8Array(),'cards/m.webp':new Uint8Array()}),m);
  m.chapters[0].cards[0].image='../unsafe.webp';
  assert.throws(()=>validatePack(m,{'workbook.pdf':new Uint8Array(),'../unsafe.webp':new Uint8Array()}));
});
