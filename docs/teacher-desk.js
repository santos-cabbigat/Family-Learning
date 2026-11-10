import {listPacks,getPack} from './lesson-store.js';
import {rowLink} from './screens.js';
import {buildTeachingPlan,teachingPlanHtml,assessmentHtml,escapeHtml as esc} from './teaching-plan.js';
import {printContent,resourceDialog,showLessonResources} from './lesson-resources.js';

const views={plans:'Lesson plans',assessments:'Assessments',print:'Print materials'};
export async function teacherDesk(host,view,{courses,dialog,onError,signal}){
 if(!views[view]){
  host.innerHTML='<div class="page-heading"><h1>Teachers</h1></div><div class="screen-menu">'+
   rowLink('#subjects','Subjects','Open books and present a lesson')+
   rowLink('#teachers/plans',views.plans)+rowLink('#teachers/assessments',views.assessments)+
   rowLink('#teachers/print',views.print)+rowLink('#library','Teaching library','Create lessons and assign work')+'</div>';
  return;
 }
 host.innerHTML='<div class="page-heading"><h1>'+views[view]+'</h1></div><div class="card stack" id="teaching-desk"></div>';
 const packs=await listPacks();if(signal.aborted)return;
 const entries=[...packs.map(m=>({m,pack:true})),...courses.map(m=>({m,pack:false}))];
 const desk=host.querySelector('#teaching-desk');
 if(!entries.length){desk.innerHTML='<p>Download a book or create a teaching material to begin.</p>'+rowLink('#downloads','Downloads')+rowLink('#create','Create material');return;}
 desk.innerHTML='<label>Subject<select data-subject></select></label><label>Book or material<select data-book></select></label>'+
  '<label data-ch>Chapter<select data-chapter></select></label><label data-act>Lesson or activity<select data-lesson></select></label>'+
  (view==='print'?'<label>Print item<select data-kind><option value="lesson">Student lesson</option><option value="plan">Teacher’s guide</option><option value="assessment">Assessment</option><option value="key">Teacher marking key</option></select></label>':'')+
  '<div class="actions"><button class="btn primary" data-print-item>Print</button><button class="btn" data-more>Open lesson resources</button></div><article class="reading" data-reading></article>';
 const get=name=>desk.querySelector('[data-'+name+']'),select=get('subject'),book=get('book'),chapter=get('chapter'),lesson=get('lesson'),reading=get('reading');
 let group=[],urls=[],serial=0,content='',loaded,selectedChapter,selectedCard;
 const release=()=>{urls.forEach(url=>URL.revokeObjectURL(url));urls=[];};
 signal.addEventListener('abort',release,{once:true});
 const subjects=[...new Set(entries.map(e=>e.m.subject))].sort();
 select.replaceChildren(...subjects.map(s=>new Option(s,s)));
 function chooseSubject(){
  group=entries.filter(e=>e.m.subject===select.value);
  book.replaceChildren(...group.map((e,i)=>new Option(e.m.title,String(i))));chooseBook();
 }
 function chooseBook(){
  const {m,pack}=group[Number(book.value)];
  get('ch').hidden=get('act').hidden=!pack;
  chapter.replaceChildren(...(m.chapters || []).map((ch,i)=>new Option(ch.title,String(i))));chooseChapter();
 }
 function chooseChapter(){
  const {m}=group[Number(book.value)];
  const ch=m.chapters?.[Number(chapter.value)];
  lesson.replaceChildren(...(ch?.cards || []).map((card,i)=>new Option(card.lessonTitle || card.label || 'Activity '+(i+1),String(i))));
  show().catch(error=>onError('Could not open material',error.message));
 }
 async function show(){
  const n=++serial;release();content='';get('print-item').disabled=get('more').disabled=true;
  const {m,pack}=group[Number(book.value)];
  const kind=view==='plans'?'plan':view==='assessments'?'assessment':get('kind').value;
  get('more').hidden=!pack;
  if(!pack){
   const part={lesson:'student',assessment:'practice',plan:'teacher',key:'answers'}[kind];
   if(m[part])content='<h2>'+esc(m.title)+'</h2><div class="prose">'+esc(m[part])+'</div>';
  }else{
   reading.textContent='Opening lesson…';
   const data=loaded?.manifest.id===m.id?loaded:await getPack(m.id);
   if(signal.aborted||n!==serial)return;
   loaded=data;selectedChapter=m.chapters[Number(chapter.value)];selectedCard=selectedChapter?.cards[Number(lesson.value)];
   if(!selectedCard || !data){reading.textContent='This book could not be opened.';return;}
   const c=selectedCard,plan=buildTeachingPlan(m,selectedChapter,c);
   if(kind==='plan')content=teachingPlanHtml(plan);
   else if((kind==='assessment'||kind==='key') && plan.assessment?.questions?.length)content=assessmentHtml(plan,kind==='key');
   else{
    const cards=kind==='lesson' || kind==='assessment'?selectedChapter.cards.filter(v=>(v.pdfPage||v.page)===(c.pdfPage||c.page)):[c];
    for(const card of cards){
     const image=data.assets[kind==='key'?card.answerImage:card.image];
     if(image){const url=URL.createObjectURL(image);urls.push(url);content+='<div class="worksheet-page"><img src="'+url+'" alt="'+esc(card.label)+'"></div>';}
     else if(kind!=='key' && card.text)content+='<p>'+esc(card.text)+'</p>';
    }
   }
  }
  if(!content){reading.textContent='No separate '+(kind==='key'?'marking key':'material')+' is provided for this lesson.';}
  else reading.innerHTML=content;
  get('print-item').disabled=!content;get('more').disabled=!pack;
 }
 const change=()=>show().catch(e=>onError('Could not open material',e.message));
 select.onchange=chooseSubject;book.onchange=chooseBook;chapter.onchange=chooseChapter;lesson.onchange=change;
 if(get('kind'))get('kind').onchange=change;
 get('print-item').onclick=()=>printContent(content).catch(e=>onError('Could not print',e.message));
 get('more').onclick=()=>{(view==='plans'?resourceDialog:showLessonResources)(loaded,selectedChapter,selectedCard,{dialog,onError});};
 chooseSubject();
}
