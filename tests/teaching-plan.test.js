import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTeachingPlan,teachingPlanHtml,assessmentHtml} from '../docs/teaching-plan.js';
import {validatePack} from '../docs/learning-core.js';
const card={id:'lesson1',page:3,label:'Water changes',guide:'Use the diagram.',image:'cards/page.webp',lessonTitle:'Evaporation',teacherPlan:{explanation:'Water vapour is a gas.'},assessment:{questions:[{prompt:'What state is water vapour?',answer:'SECRET_TEACHER_KEY: gas'}]}};
const chapter={id:'chapter1',title:'Water',cards:[card]};
const material={id:'science',title:'Science collection',subject:'Science',format:'family-learning-pack',version:1,original:'workbook.pdf',chapters:[chapter]};
test('student assessment excludes teacher marking answers',()=>{
 const plan=buildTeachingPlan(material,chapter,card);
 assert.ok(assessmentHtml(plan).includes('What state is water vapour?'));
 assert.ok(!assessmentHtml(plan).includes('SECRET_TEACHER_KEY'));
 assert.ok(assessmentHtml(plan,true).includes('SECRET_TEACHER_KEY'));
 assert.ok(teachingPlanHtml(plan).includes('SECRET_TEACHER_KEY'));
});
test('every subject receives preparation, teaching steps, support, assessment and reflection',()=>{
 for(const subject of ['Science','Math','Phonics','Reading Comprehension','Grammar','Writing']){
  const p=buildTeachingPlan({...material,subject},chapter,card),html=teachingPlanHtml(p);
  for(const heading of ['Learning objectives','Before class','Materials','Prior learning','Lesson procedure','Support and extension','Assessment and marking','Follow-up','Teacher reflection'])assert.ok(html.includes(heading),subject+': '+heading);
  assert.equal(p.title,'Evaporation');assert.equal(p.notes,'Use the diagram.');assert.equal(p.steps.length,5);
 }
});
test('guide rendering escapes text from private imported manifests',()=>{
 const plan=buildTeachingPlan(material,chapter,{...card,lessonTitle:'<img src=x onerror=alert(1)>',guide:'<script>bad()</script>'});
 const html=teachingPlanHtml(plan);assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src=x'));assert.ok(html.includes('&lt;script&gt;'));
});
test('pack validation requires printable resources and rejects unsafe paths',()=>{
 const m=structuredClone(material),c=m.chapters[0].cards[0];c.lessonPdf='resources/lesson.pdf';c.teacherPdf='resources/teacher.pdf';m.teacherHandbook='resources/handbook.pdf';
 const files={'workbook.pdf':new Uint8Array(),'cards/page.webp':new Uint8Array(),'resources/lesson.pdf':new Uint8Array(),'resources/teacher.pdf':new Uint8Array(),'resources/handbook.pdf':new Uint8Array()};
 assert.equal(validatePack(m,files),m);delete files['resources/teacher.pdf'];assert.throws(()=>validatePack(m,files),/PDF resource/);
 c.teacherPdf='../teacher.pdf';assert.throws(()=>validatePack(m,files),/PDF resource/);
});
test('multi-document packs retain their individual PDFs and cannot omit a source',()=>{
 const m=structuredClone(material);m.original='individual-pdfs';m.chapters[0].cards[0].lessonPdf='resources/source.pdf';
 const files={'cards/page.webp':new Uint8Array(),'resources/source.pdf':new Uint8Array()};
 assert.equal(validatePack(m,files),m);
 delete m.chapters[0].cards[0].lessonPdf;assert.throws(()=>validatePack(m,files),/incomplete/);
});
test('teacher-only references must have safe paths and existing PDF bytes',()=>{
 const m=structuredClone(material);m.referencePdfs=[{title:'Teacher key',path:'resources/key.pdf'}];
 const files={'workbook.pdf':new Uint8Array(),'cards/page.webp':new Uint8Array()};
 assert.throws(()=>validatePack(m,files),/reference PDF/);files['resources/key.pdf']=new Uint8Array();assert.equal(validatePack(m,files),m);
 m.referencePdfs[0].path='../key.pdf';assert.throws(()=>validatePack(m,files),/reference PDF/);
});
