import {buildTeachingPlan, teachingPlanHtml, assessmentHtml, escapeHtml as e} from './teaching-plan.js';

export const PRINT_STYLE = `
  @page{size:A4 portrait;margin:15mm}
  body{font:11pt/1.5 Arial,sans-serif;color:#172d24;background:white;margin:0}
  h1{font-size:20pt;line-height:1.2;margin:0 0 8mm}h2{font-size:15pt}h3{font-size:12pt;margin:6mm 0 2mm}
  p{margin:0 0 3mm}ul,ol{padding-left:7mm}li{margin-bottom:2mm}section{break-inside:auto}h3{break-after:avoid}
  .plan-meta,.plan-source{font-size:9pt;color:#46574c}.plan-source{margin-top:7mm;border-top:1px solid #ccc;padding-top:3mm}
  .planning-fields{margin:5mm 0}.answer-lines,.reflection-lines{line-height:2;overflow:hidden;color:#555}
  .worksheet-page{break-after:page}.worksheet-page:last-child{break-after:auto}.worksheet-page img{display:block;max-width:100%;max-height:260mm;object-fit:contain;margin:auto}
  .screen-only{margin-bottom:15px}@media print{.screen-only{display:none}}
`;
const fileName = value => String(value).replace(/[^a-zA-Z0-9 -]/g,'').trim().slice(0,100) || 'Lesson';
export function downloadBlob(blob, name) {
  const url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url;a.download=name;a.rel='noopener';document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
export function printableDocument(html,title) {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>'+e(title)+'</title><style>'+PRINT_STYLE+'</style></head><body><button class="screen-only" onclick="window.print()">Print / Save as PDF</button>'+html+'</body></html>';
}
export async function printContent(html) {
  let surface=document.querySelector('#lesson-print-surface');
  if(!surface){surface=document.createElement('div');surface.id='lesson-print-surface';document.body.append(surface);}
  surface.innerHTML=html;
  await Promise.all([...surface.querySelectorAll('img')].map(image=>image.decode?.().catch(()=>{}) || Promise.resolve()));
  document.body.classList.add('printing-lesson-resource');
  const clean=()=>{document.body.classList.remove('printing-lesson-resource');surface.replaceChildren();};
  window.addEventListener('afterprint',clean,{once:true});
  try { if(window.FamilyNative?.printPage)window.FamilyNative.printPage();else window.print(); }
  catch(error){clean();throw error;}
}
export function resourceDialog(pack, chapter, card, {dialog,onError}) {
  const plan=buildTeachingPlan(pack.manifest,chapter,card), urls=[];
  const assetUrl=path=>{if(!pack.assets[path])return '';const url=URL.createObjectURL(pack.assets[path]);urls.push(url);return url;};
  const html=teachingPlanHtml(plan)+(card.answerImage ? '<section><h3>Publisher answer key</h3><img class="plan-key-image" src="'+assetUrl(card.answerImage)+'" alt="Publisher answer key"></section>' : '');
  dialog('<div class="guide-heading"><h2>Teacher’s guide & lesson plan</h2><button class="btn" data-close>Close</button></div>'+
    '<div class="actions resource-actions"><button class="btn primary" id="print-teacher-plan">Print teacher’s guide</button><button class="btn" id="save-teacher-plan">Download teacher’s guide</button><button class="btn" id="lesson-resources-tab">Lesson & assessment</button></div>'+html);
  const modal=document.querySelector('#dialog');modal.classList.add('resource-dialog');
  const cleanup=()=>{urls.forEach(url=>URL.revokeObjectURL(url));modal.classList.remove('resource-dialog');};
  modal.addEventListener('close',cleanup,{once:true});
  document.querySelector('#print-teacher-plan').onclick=()=>printContent(html).catch(err=>onError('Printing could not start',err.message));
  document.querySelector('#save-teacher-plan').onclick=()=>{
    const pdf=pack.assets[card.teacherPdf];
    downloadBlob(pdf || new Blob([printableDocument(html,plan.title+' - Teacher guide')],{type:'text/html'}),fileName(plan.title)+' - Teacher guide.'+(pdf?'pdf':'html'));
  };
  document.querySelector('#lesson-resources-tab').onclick=()=>{cleanup();showLessonResources(pack,chapter,card,{dialog,onError});};
  for (const reference of pack.manifest.referencePdfs || []) {
    const button=document.createElement('button');button.type='button';button.className='btn';button.textContent=reference.title;
    button.onclick=()=>downloadBlob(pack.assets[reference.path],fileName(reference.title)+'.pdf');
    document.querySelector('.resource-actions').append(button);
  }
}
export function showLessonResources(pack,chapter,card,{dialog,onError}) {
  const plan=buildTeachingPlan(pack.manifest,chapter,card), urls=[];
  const urlFor=path=>{if(!pack.assets[path])return '';const url=URL.createObjectURL(pack.assets[path]);urls.push(url);return url;};
  const pageCards=chapter.cards.filter(c=>(c.pdfPage || c.page)===(card.pdfPage || card.page));
  const pictures=pageCards.filter(c=>c.image).map(c=>({url:urlFor(c.image),label:c.label}));
  const lessonHtml=pictures.length ? pictures.map(p=>'<div class="worksheet-page"><img src="'+p.url+'" alt="'+e(p.label)+'"></div>').join('') :
    '<article><h1>'+e(plan.title)+'</h1>'+pageCards.map(c=>'<p class="print-word">'+e(c.text || c.label)+'</p>').join('')+'</article>';
  const assessment=assessmentHtml(plan), hasAssessment=Boolean(plan.assessment?.questions?.length);
  dialog('<div class="guide-heading"><h2>Lesson & assessment</h2><button class="btn" data-close>Close</button></div><h3>'+e(plan.title)+'</h3><p class="muted">'+e(pack.manifest.title)+' · Workbook page '+card.page+'</p>'+
    '<section class="resource-choice"><h3>Student lesson</h3><div class="actions"><button class="btn primary" id="print-student-lesson">Print lesson</button>'+
    (pack.assets[card.lessonPdf]?'<button class="btn" id="download-student-lesson">Download lesson PDF</button>':'')+
    '<button class="btn" id="open-source-workbook">Open original PDF</button></div></section>'+
    '<section class="resource-choice"><h3>Assessment</h3><p>'+ (hasAssessment?'Separate student questions and teacher marking points.':'Use the workbook’s printed questions. The teacher’s guide explains how to assess the selected work.')+'</p><div class="actions">'+
    (hasAssessment?'<button class="btn" id="print-assessment">Print assessment</button><button class="btn" id="save-assessment">Download assessment</button><button class="btn" id="view-assessment-key">Teacher marking key</button>':'')+
    (card.answerImage?'<button class="btn" id="print-publisher-key">Print publisher answer key</button>':'')+
    '</div></section><section class="resource-choice"><h3>Teacher preparation</h3><button class="btn" id="open-teaching-plan">Teacher’s guide & lesson plan</button></section>'+
    '<p class="muted">Print opens your device’s print dialog. Choose a connected printer or Save as PDF. Student sheets exclude teacher answers.</p>');
  const modal=document.querySelector('#dialog');modal.classList.add('resource-dialog');
  const cleanup=()=>{urls.forEach(url=>URL.revokeObjectURL(url));modal.classList.remove('resource-dialog');};
  modal.addEventListener('close',cleanup,{once:true});
  const run=html=>printContent(html).catch(err=>onError('Printing could not start',err.message));
  document.querySelector('#print-student-lesson').onclick=()=>run(lessonHtml);
  const download=document.querySelector('#download-student-lesson');
  if(download)download.onclick=()=>downloadBlob(pack.assets[card.lessonPdf],fileName(plan.title)+' - Lesson.pdf');
  document.querySelector('#open-source-workbook').onclick=()=>{
    const original=pack.assets['workbook.pdf'],blob=original || pack.assets[card.lessonPdf];if(!blob)return;
    const url=URL.createObjectURL(blob);window.open(url+'#page='+(original ? card.pdfPage || card.page : 1),'_blank','noopener');
    setTimeout(()=>URL.revokeObjectURL(url),600000);
  };
  if(hasAssessment){
    document.querySelector('#print-assessment').onclick=()=>run(assessment);
    document.querySelector('#save-assessment').onclick=()=>{
      const pdf=pack.assets[card.assessmentPdf];downloadBlob(pdf || new Blob([printableDocument(assessment,plan.title+' - Assessment')],{type:'text/html'}),fileName(plan.title)+' - Assessment.'+(pdf?'pdf':'html'));
    };
    document.querySelector('#view-assessment-key').onclick=()=>{cleanup();dialog('<div class="guide-heading"><h2>Teacher marking key</h2><button class="btn" data-close>Close</button></div><button class="btn" id="print-marking-key">Print marking key</button>'+assessmentHtml(plan,true));document.querySelector('#print-marking-key').onclick=()=>run(assessmentHtml(plan,true));};
  }
  if(card.answerImage)document.querySelector('#print-publisher-key').onclick=()=>run('<div class="worksheet-page"><img src="'+urlFor(card.answerImage)+'" alt="Publisher answer key"></div>');
  document.querySelector('#open-teaching-plan').onclick=()=>{cleanup();resourceDialog(pack,chapter,card,{dialog,onError});};
}
