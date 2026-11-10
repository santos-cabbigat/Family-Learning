import {listEvidence} from './evidence-store.js';
import {studentEvidenceFiles} from './drive.js';
import {teacherDesk} from './teacher-desk.js';
import {evidencePage,syncStudentEvidence} from './evidence.js';
import {downloadEvents,downloadJob} from './download-job.js';
import {rowLink, screenMenu, restorePanel, activePanel, revealInvalid} from './screens.js';
import {driveGuide} from './drive-guide.js';
import {transferDisplay} from './pack-transfer.js';
import {listPacks,exportPack,importPack} from './lesson-store.js';
import {GRADES,activeStudents,currentProfiles,rosterChanges,materialGrade} from './students.js';
import {APP_URL,REPOSITORY_URL,isOfficialWeb,compareVersions,waitForInstall} from './release.js';
import {createLessons} from './lessons.js';
import {installationPage,beginInstall} from './install.js';
import {VERSION,uid,record,envelope,validateBackup,mergeRecords,pendingRecords,pendingBytes,reminderDue,latestProfiles,seedRecords} from './core.js';
import {openStore,readState,writeState,updateState} from './store.js';
import {prepareDrive,connectDrive,isConnected,driveAccount,disconnectDrive,availableBackups,downloadBackup,syncDrive,configuredClientId,saveDriveClient,restoreBooks} from './drive.js';
const native=Boolean(window.FamilyNative);
const $=(s,root=document)=>root.querySelector(s), main=$('#main');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={home:'<path d="m3 10 9-7 9 7v10H3zM9 20v-7h6v7"/>',library:'<path d="M3 4h7l2 2 2-2h7v15h-7l-2 2-2-2H3zM12 6v15"/>',learners:'<circle cx="8" cy="7" r="3"/><path d="M2 21v-4a6 6 0 0 1 12 0v4M17 4a3 3 0 0 1 0 6M18 13a5 5 0 0 1 4 5v3"/>',create:'<path d="M4 20h16M5 15 16 4l4 4L9 19H5zM13 7l4 4"/>',sync:'<path d="M3 10a9 9 0 0 1 15-6l3 3M21 2v5h-5M21 14a9 9 0 0 1-15 6l-3-3M3 22v-5h5"/>',settings:'<circle cx="12" cy="12" r="3"/><path d="m9 3-1 3-3 1-2 5 2 5 3 1 1 3h6l1-3 3-1 2-5-2-5-3-1-1-3z"/>'};
icons.subjects=icons.library;
icons['learning-progress']=icons.learners;
const icon=name=>`<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
icons.teachers=icons.library;icons.students=icons.learners;
const nav=[['teachers','Teachers'],['subjects','Subjects'],['students','Students'],['settings','Settings']];
let pageScope=new AbortController();
let state,registration,busy=false,writeQueue=Promise.resolve(),dirty=false,installPrompt,driveReady=false,driveError='',registrationPromise,updatePending=false,renderedHash=location.hash,pendingWrites=0;
const channel='BroadcastChannel'in window?new BroadcastChannel('family-learning-state'):null;
const defaults={thresholdMB:20,thresholdHours:24,snoozeUntil:0};
const lessons=createLessons({main,getState:()=>state,mutate,toast,dialog,closeDialog,onError:notice});
function date(value){return value?new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'Not yet';}
function bytes(value){return value<1048576?`${Math.max(0,Math.round(value/1024))} KB`:`${(value/1048576).toFixed(1)} MB`;}
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,6500);}
let modalScroll;
function unlockPage(){
 if($('#dialog').open || !modalScroll)return;
 const {x,y,route}=modalScroll;
 modalScroll=null;
 document.documentElement.classList.remove('popup-open');
 document.body.style.removeProperty('--popup-offset');
 if(location.hash===route)window.scrollTo(x,y);
}
function dialog(html){
 const modal=$('#dialog'), content=$('#dialog-content');
 const body=document.createElement('div');
 body.className='popup-scroll';body.innerHTML=html;
 const header=body.querySelector(':scope > .guide-heading');
 content.replaceChildren(...(header?[header]:[]),body);
 if(!modal.open){
  if(!modalScroll)modalScroll={x:window.scrollX,y:window.scrollY,route:location.hash};
  document.body.style.setProperty('--popup-offset',-modalScroll.y+'px');
  document.documentElement.classList.add('popup-open');
  modal.showModal();
 }
 body.scrollTop=0;
}
$('#dialog').addEventListener('close',unlockPage);
function closeDialog(){$('#dialog').close();unlockPage();if(!$('#editor')&&!$('#work-form'))dirty=false;}
function notice(title,message){dialog(`<h2>${escape(title)}</h2><p>${escape(message)}</p><button class="btn primary" data-close>Got it</button>`);}
function confirmAction(title,message,action){dialog(`<h2>${escape(title)}</h2><p>${escape(message)}</p><div class="actions"><button class="btn primary" id="confirm-action">Continue</button><button class="btn" data-close>Cancel</button></div>`);$('#confirm-action').onclick=async()=>{closeDialog();try{await action();}catch(e){notice('Could not complete this',e.message);}};}
async function mutate(fn){
 const task=async()=>{
  const before=JSON.stringify(profiles().map(p=>[p.childId,p.name]));
  state=await updateState(fn,state);channel?.postMessage('changed');updateStatus();
  if(before!==JSON.stringify(profiles().map(p=>[p.childId,p.name])))scheduleStudentFolders();
 };
 pendingWrites++;writeQueue=writeQueue.then(task,task);try{await writeQueue;}finally{pendingWrites--;}
}
async function add(r){await mutate(next=>next.records=mergeRecords(next.records,[r]));}
function profiles(){return activeStudents(state.records);}
function courses(){return state.records.filter(r=>r.kind==='course');}
function course(id){return state.records.find(r=>r.kind==='course'&&r.id===id);}
function assignments(childId){return state.records.filter(r=>r.kind==='assignment'&&(!childId||r.childId===childId));}
function submissions(id){return state.records.filter(r=>r.kind==='submission'&&(!id||r.assignmentId===id));}
function updateStatus(){if(!state)return;const count=pendingRecords(state.records,state.syncedIds).length;$('#backup-badge').textContent=count?`${count} changes · device only`:(state.lastSync?'Drive backup verified':'Saved on this device');$('#connection').textContent=navigator.onLine?(isConnected()?'Google Drive connected':'Online · saved on device'):'Offline · saved on device';}
async function refreshDrive(){try{driveReady=await prepareDrive(true);driveError='';}catch(e){driveReady=false;driveError=e.message;}updateStatus();if(busy||dirty)return;if(isSyncPage())syncPage();if(location.hash==='#settings/drive')driveSettings();if(location.hash==='#settings')updateDriveShortcut();}
function pendingSummary(){const names={profile:'Learner profile changes',course:'Teaching materials',assignment:'Lesson assignments',submission:'Work records',lesson_stop:'Saved stopping points',chapter_result:'Chapter scores',material_profile:'Material grade settings'};const counts={};for(const r of pendingRecords(state.records,state.syncedIds))counts[r.kind]=(counts[r.kind]||0)+1;return Object.entries(counts).map(([kind,count])=>`<li>${escape(names[kind]||kind)}: <strong>${count}</strong></li>`).join('');}

const heading=(title,sub,action='')=>`<div class="page-heading"><div><h1>${escape(title)}</h1><p class="muted">${escape(sub)}</p></div>${action}</div>`;
const person=(p,i=0)=>`<div class="person"><span class="avatar ${i%2?'blue':''}">${escape(p.name[0]||'?')}</span><div><h3>${escape(p.name)}</h3><p class="muted">${escape(p.level)}</p></div></div>`;
function courseCard(c) {
 return rowLink('#book/'+encodeURIComponent(c.id),c.title,[c.subject,c.grade || c.level].filter(Boolean).join(' · '));
}
function assignmentRow(a){const c=course(a.courseId),attempts=submissions(a.id);return `<div class="row"><div><div class="row-title">${escape(c?.title||'Material')}</div><p class="muted">${escape(a.goal||'Complete the lesson')}${a.due?' · '+escape(a.due):''}</p><span class="badge ${attempts.length?'':'subtle'}">${attempts.length?`${attempts.length} work record${attempts.length===1?'':'s'}`:'Ready to begin'}</span></div><a class="btn small" href="#assignment/${encodeURIComponent(a.id)}">${attempts.length?'View work':'Open'}</a></div>`;}
function teachers(view){return teacherDesk(main,view,{courses:courses(),dialog,onError:notice,signal:pageScope.signal});}
function home(){return teachers();}
let portfolioTail=Promise.resolve();
function namedStudents(){
 return profiles().filter(p=>!p.seed || !/^Student [0-9]+$/.test(p.name));
}
function scheduleStudentFolders(){
 if(!isConnected())return;
 const family=state.workspaceId,account=driveAccount();
 portfolioTail=portfolioTail.catch(()=>{}).then(async()=>{
  if(!isConnected() || family!==state.workspaceId || account!==driveAccount())return;
  await syncStudentEvidence(family,namedStudents());
 }).catch(error=>toast('Student files are waiting for Drive. '+error.message));
}
document.addEventListener('family-drive-connected',scheduleStudentFolders);
function evidence(id){
 const student=profiles().find(p=>p.childId===id);if(!student)return missing();
 return evidencePage(main,state.workspaceId,student,{signal:pageScope.signal});
}
async function grades(id){
 const student=profiles().find(p=>p.childId===id);if(!student)return missing();
 const scope=pageScope,books=await listPacks();if(scope.signal.aborted)return;
 const rows=[];
 for(const r of state.records){
  if(r.kind==='chapter_result' && r.childId===id && r.earned!=null && r.total>0){
   const m=books.find(b=>b.id===r.materialId),ch=m?.chapters.find(c=>c.id===r.chapterId);
   rows.push({date:r.createdAt,title:ch?.title || r.chapterId,detail:m?.title || r.materialId,score:r.earned,total:r.total});
  }
  if(r.kind==='submission' && r.score!=null && r.score!=='' && Number(r.possible)>0){
   const a=assignments(id).find(a=>a.id===r.assignmentId);
   if(a)rows.push({date:r.createdAt,title:course(a.courseId)?.title || 'Assignment',detail:a.goal,score:r.score,total:r.possible});
  }
 }
 const scans=await listEvidence(state.workspaceId,id);let remoteMessage='';
 const scores=new Map(scans.map(s=>[s.id,s]));
 if(isConnected()){
  try{for(const f of await studentEvidenceFiles(state.workspaceId,id)){
   const p=f.appProperties;
   if(!scores.has(p.evidence))scores.set(p.evidence,{title:f.name,date:p.date,score:p.score,possible:p.possible,category:p.category});
  }}catch(e){remoteMessage='Could not load additional scan scores from Drive. '+e.message;}
 }
 if(scope.signal.aborted)return;
 for(const scan of scores.values()){
  if(Number(scan.possible)>0 && scan.score!=null)rows.push({date:scan.date+'T12:00:00',title:scan.title,detail:scan.category,score:scan.score,total:scan.possible});
 }
 rows.sort((a,b)=>b.date.localeCompare(a.date));
 main.innerHTML=heading(student.name+' · Grades',student.grade || student.level)+(remoteMessage?'<p role="status">'+escape(remoteMessage)+'</p>':'')+'<div class="stack">'+
  (rows.map(r=>'<article class="card"><strong>'+escape(r.title)+'</strong><p>'+escape(r.detail)+'</p><p>'+escape(r.score)+' / '+escape(r.total)+' · '+Math.round(100*r.score/r.total)+'% · '+escape(date(r.date))+'</p></article>').join('') || '<p>No scored work recorded for this student yet.</p>')+'</div>';
}
const downloadLink=document.createElement('a');
downloadLink.href='#downloads';downloadLink.className='current-download';downloadLink.hidden=true;
const transferText=document.createElement('span'),transferBar=document.createElement('progress');
downloadLink.append(transferText,transferBar);document.querySelector('.topbar').append(downloadLink);
function downloadStatus(){
 downloadLink.hidden=!downloadJob.running || location.hash.startsWith('#downloads');
 if(downloadJob.running)transferDisplay(transferBar,transferText,downloadJob.label,downloadJob.done,downloadJob.total);
}
downloadEvents.addEventListener('change',downloadStatus);
function library(){main.innerHTML=heading('Teaching library','Create your own lessons, practice questions and answer keys, then assign them to a student.','<a class="btn primary" href="#create">+ Create material</a>')+`<div class="search-line"><input id="search" aria-label="Search materials" placeholder="Search by title, subject, or level…"></div><div id="course-list" class="screen-menu">${courses().map(courseCard).join('')||'<p class="empty">Create a teaching material to start your library.</p>'}</div>`;$('#search').oninput=e=>{const term=e.target.value.toLowerCase();$('#course-list').innerHTML=courses().filter(c=>`${c.title} ${c.subject} ${c.level}`.toLowerCase().includes(term)).map(courseCard).join('')||'<div class="empty">No matching materials. Try another word or create your own.</div>';};}
function learners() {
 main.innerHTML = heading('Students','Choose a student to view their profile, grades and work.') + '<div class="screen-menu">' +
   profiles().map(p => rowLink('#learner/'+encodeURIComponent(p.childId), p.name, p.grade || p.level)).join('')+rowLink('#settings/students','Manage student profiles')+'</div>';
}
function learner(id) {
 const p = profiles().find(person => person.childId === id);
 if (!p) return missing();
 const tasks = assignments(id);
 main.innerHTML = heading(p.name,p.grade || p.level) + '<div class="screen-menu">'+
   rowLink('#learning-progress/'+encodeURIComponent(id),'Learning progress')+
   rowLink('#grades/'+encodeURIComponent(id),'Grades and scores')+
   rowLink('#evidence/'+encodeURIComponent(id),'Scan and view evidence','Exams, quizzes, workbooks and art')+
   '<button class="screen-row" data-profile="'+escape(id)+'">Edit student profile <span>›</span></button></div>'+
   '<h2 class="screen-group-title">Assigned lessons</h2><div class="screen-menu">'+
   (tasks.map(a => rowLink('#assignment/'+encodeURIComponent(a.id),course(a.courseId)?.title || 'Lesson',a.goal)).join('') ||
   rowLink('#library','Choose a lesson to assign'))+'</div>';
}
function book(id,view){const c=course(id);if(!c)return missing();
 if (!['student','teacher','practice'].includes(view)) {
  const base='#book/'+encodeURIComponent(id)+'/';
  main.innerHTML=heading(c.title,c.subject)+'<div class="screen-menu">'+
    rowLink(base+'student','Student lesson')+rowLink(base+'teacher','Teaching guide')+
    rowLink(base+'practice','Practice and answers')+
    '<button class="screen-row" data-assign="'+escape(id)+'">Assign lesson <span>›</span></button>'+
    rowLink('#edit/'+encodeURIComponent(id),'Create revised edition')+'</div>';
  return;
 }
 main.innerHTML=heading(c.title,`${c.subject} · ${c.level}`,`<button class="btn primary" data-assign="${escape(c.id)}">Assign lesson</button>`)+`<article class="card reading"><div class="eyebrow">${view==='student'?'STUDENT EDITION':'PARENT EDITION'} · ${c.seed?'ILLUSTRATIVE SAMPLE':'FAMILY RESOURCE'}</div><h2>${escape(c.title)}</h2><div class="prose">${escape(c[view])}</div>${view==='practice'?`<section><h3>Answer key · Parent use</h3><div class="prose">${escape(c.answers)}</div></section>`:''}<section><h3>Sources & notes</h3><p class="muted prose">${escape(c.sources||'No references added.')}</p></section></article><div class="actions" style="margin:20px auto;max-width:760px"><button class="btn" data-print>Print this edition</button><a class="btn" href="#edit/${encodeURIComponent(c.id)}">Create revised edition</a></div>`;}
function editor(id){const c=course(id)||{title:'',subject:'',level:'',student:'',teacher:'',practice:'',answers:'',sources:''};main.innerHTML=heading(id?'Revise material':'Create material','Choose a section to edit, then save.')+`<form id="editor" class="stack"><div class="card form-grid"><label>Title<input name="title" required maxlength="150" value="${escape(c.title)}" placeholder="For example: Discovering fractions"></label><label>Subject<input name="subject" required maxlength="80" value="${escape(c.subject)}" placeholder="Mathematics, language, science…"></label><label>Grade<select name="grade">${GRADES.map(g=>`<option ${c.grade===g?'selected':''}>${g}</option>`).join('')}</select></label><label>Learning level<input name="level" required maxlength="80" value="${escape(c.level)}" placeholder="Choose a level appropriate to your children"></label><div class="note">A shared resource contains teaching content. Each child’s assignments and work are recorded separately.</div></div><div class="card stack"><h2>The student’s page</h2><label>Explanation, examples, and activities<textarea name="student" required maxlength="100000" rows="8" placeholder="What should your child learn? Explain it clearly, show an example, then offer something to try.">${escape(c.student)}</textarea></label></div><div class="card stack"><h2>Your teaching guide</h2><label>Objectives, preparation, teaching steps, and extra support<textarea name="teacher" required maxlength="100000" rows="7">${escape(c.teacher)}</textarea></label><div class="form-grid"><label>Practice or quiz questions<textarea name="practice" maxlength="100000" rows="5">${escape(c.practice)}</textarea></label><label>Answer key and marking guidance<textarea name="answers" maxlength="100000" rows="5">${escape(c.answers)}</textarea></label></div><label>References and resource permissions<textarea name="sources" maxlength="30000" rows="3" placeholder="Add source titles, links, and reuse permissions. AI research is not connected in this edition.">${escape(c.sources)}</textarea></label></div><div class="actions"><button class="btn primary" type="submit">Save ${id?'new edition':'shared material'}</button><a class="btn" href="#library">Cancel</a><span class="muted">Saved on this device until you back up or sync.</span></div></form>`;const form=$('#editor');
 const [details,student,teacher]=form.querySelectorAll(':scope > .card');
 const practice=document.createElement('section');
 practice.className='card stack';
 practice.append(teacher.querySelector('.form-grid'),teacher.querySelector('label:has([name="sources"])'));
 teacher.after(practice);
 const menu=screenMenu(form,[
  {key:'details',label:'Title, subject and grade',node:details},
  {key:'student',label:'Student lesson',node:student},
  {key:'teacher',label:'Teaching guide',node:teacher},
  {key:'practice',label:'Practice, answers and sources',node:practice}
 ]);
 revealInvalid(form,menu);
 $('#editor').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{const fields=Object.fromEntries(new FormData(e.target));const r=record('course',{...fields,...(id?{revises:id}:{})});await add(r);dirty=false;location.hash=`book/${r.id}`;toast('Material saved on this device.');}catch(error){notice('Could not save',error.message);}finally{button.disabled=false;}};}
function assign(id){const c=course(id);if(!c)return;dialog(`<h2>Assign this lesson</h2><p>${escape(c.title)}</p><form id="assign-form" class="stack"><label>Child<select name="childId">${profiles().map(p=>`<option value="${escape(p.childId)}">${escape(p.name)}</option>`).join('')}</select></label><label>Individual goal<input name="goal" required maxlength="300" placeholder="For example: Explain the idea without help"></label><label>Planned date (optional)<input name="due" type="date"></label><div class="actions"><button class="btn primary" type="submit">Add to learning plan</button><button class="btn" type="button" data-close>Cancel</button></div></form>`);$('#assign-form').onsubmit=async e=>{e.preventDefault();e.submitter.disabled=true;try{const fields=Object.fromEntries(new FormData(e.target));await add(record('assignment',{...fields,courseId:id}));closeDialog();location.hash=`learner/${fields.childId}`;render();toast('Assigned with a fresh, individual learning record.');}catch(error){notice('Could not assign',error.message);}};}
function editProfile(id){const p=profiles().find(p=>p.childId===id);dialog(`<h2>Learner profile</h2><form id="profile-form" class="stack"><label>Name or nickname<input name="name" required maxlength="60" value="${escape(p.name)}"></label><label>Current learning level<input name="level" required maxlength="100" value="${escape(p.level)}"></label><div class="actions"><button class="btn primary" type="submit">Save profile</button><button class="btn" type="button" data-close>Cancel</button></div></form>`);$('#profile-form').onsubmit=async e=>{e.preventDefault();e.submitter.disabled=true;try{await add(record('profile',{childId:id,active:p.active!==false,grade:p.grade||'Kindergarten',...Object.fromEntries(new FormData(e.target))}));closeDialog();render();toast('Learner profile saved.');}catch(error){notice('Could not save',error.message);}};}
function workForm(id){const a=assignments().find(a=>a.id===id);if(!a)return missing();const c=course(a.courseId),p=profiles().find(p=>p.childId===a.childId),work=submissions(id);main.innerHTML=heading(c.title,`${p.name} · ${a.goal}`,`<a class="btn" href="#book/${escape(c.id)}">Open material</a>`)+`<div class="grid"><div class="stack"><article class="card"><span class="badge">Assigned edition</span><h2 style="margin-top:16px">Student activity</h2><div class="prose">${escape(c.student)}</div><h3 style="margin-top:24px">Practice</h3><div class="prose">${escape(c.practice)}</div></article><form id="work-form" class="card stack"><h2>Record this child’s work</h2><label>Answers, observations, or project notes<textarea name="work" required maxlength="100000" rows="5" placeholder="Write the response or describe the activity…"></textarea></label><label>Worksheet photo (optional, up to 10 MB)<input name="photo" class="file-input" type="file" accept="image/jpeg,image/png,image/webp"></label><div class="form-grid"><label>Score earned (optional)<input name="score" type="number" min="0" step="any"></label><label>Possible score<input name="possible" type="number" min="0.01" step="any"></label></div><label>Understanding<select name="understanding"><option>Not assessed yet</option><option>Needs support</option><option>Developing</option><option>Demonstrated independently</option></select></label><label>Parent feedback<textarea name="feedback" maxlength="30000" rows="3"></textarea></label><button class="btn primary" type="submit">Save work record</button><small>A new attempt is saved each time. Earlier work stays intact.</small></form></div><aside class="stack" style="align-content:start"><h2>Learning history</h2>${work.slice().reverse().map(s=>`<article class="card"><div class="card-head"><span class="badge">${escape(s.understanding)}</span><small>${escape(date(s.createdAt))}</small></div><div class="prose">${escape(s.work)}</div>${s.photo?`<img class="photo" src="${escape(s.photo)}" alt="Saved worksheet for ${escape(p.name)}">`:''}${s.score!==''&&s.score!==undefined?`<p style="margin-top:14px">Score: <strong>${escape(s.score)} / ${escape(s.possible)}</strong></p>`:''}${s.feedback?`<div class="note green" style="margin-top:14px">${escape(s.feedback)}</div>`:''}</article>`).join('')||'<div class="empty">No work submitted yet. This record belongs only to this child.</div>'}</aside></div>`;const workBody=main.querySelector(':scope > .grid');
 const activity=workBody.querySelector('article');
 const workEntry=$('#work-form');
 const historyList=workBody.querySelector('aside');
 workBody.replaceChildren(activity,workEntry,historyList);
 workBody.className='stack';
 screenMenu(workBody,[{key:'activity',label:'Student activity',node:activity},{key:'record',label:'Record work',node:workEntry},
  {key:'history',label:'Learning history',node:historyList}]);
 $('#work-form').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{const f=new FormData(e.target);if((f.get('score')==='')!==(f.get('possible')===''))throw new Error('Enter both the earned and possible score, or leave both blank.');if(f.get('score')!==''&&Number(f.get('score'))>Number(f.get('possible')))throw new Error('The earned score cannot exceed the possible score.');const file=f.get('photo');let photo='';if(file?.size){if(file.size>10*1024*1024)throw new Error('Choose a photo smaller than 10 MB.');if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Choose a JPEG, PNG, or WebP photo.');photo=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(new Error('The photo could not be read.'));r.readAsDataURL(file);});}await add(record('submission',{assignmentId:id,work:f.get('work'),score:f.get('score'),possible:f.get('possible'),understanding:f.get('understanding'),feedback:f.get('feedback'),photo}));dirty=false;render();toast('Work saved on this device.');checkReminder();}catch(error){notice('Could not save work',error.message);}finally{button.disabled=false;}};}
function isSyncPage(){return ['#sync','#settings/backup'].includes(location.hash);}
function syncPage(){const pending=pendingRecords(state.records,state.syncedIds);main.innerHTML=settingsBack()+heading('Backup and sync','Save student progress and offline books in your family’s Google Drive.')+`<div class="grid"><article class="card stack"><div class="card-head"><h2>Google Drive</h2><span class="badge">${isConnected()?'Connected':driveReady?'Ready to connect':'App owner setup needed'}</span></div><p>${state.lastSync?'Last verified backup: '+escape(date(state.lastSync)):'No verified Google Drive backup yet.'}</p>${driveError?`<div class="note" role="alert">${escape(driveError)}</div>`:''}<p class="muted">${driveReady?'Connect the account that holds your books. Google asks to read Drive files and to save backups created by Family Learning.':'The app owner is setting up Google Drive. Use Export backup to save a copy to your device.'}</p><div class="actions">${driveReady?`<button class="btn primary" id="sync-now" ${busy?'disabled':''}>${isConnected()?'Sync now':'Connect Google Drive'}</button><button class="btn" id="restore-drive" ${busy?'disabled':''}>Restore from Drive</button>`:'<a class="btn primary" href="#settings/drive">Google Drive settings</a><button class="btn" id="retry-drive">Retry connection setup</button>'}${isConnected()?'<button class="btn" id="disconnect">Disconnect</button>':''}</div><progress class="download-progress" id="sync-bar" aria-label="Drive transfer" hidden></progress><div id="sync-progress" role="status" aria-live="polite"></div><p class="muted">Sync runs when you press Sync now. Failed uploads leave your records on this device and available to retry.</p></article><article class="card stack"><h2>Waiting for a Drive backup</h2><p>${pending.length} changes · ${bytes(pendingBytes(state.records,state.syncedIds))}</p><ul>${pendingSummary()||'<li>No new learning records waiting.</li>'}</ul><p class="muted">Only records confirmed in a verified Drive upload are marked backed up.</p></article><article class="card stack"><h2>Export or import a backup</h2><p>Includes all students’ profiles, materials you created, assignments, scores, stopping points, and settings.</p><div class="actions"><button class="btn primary" id="export">${native?'Save backup to files / Drive':'Export backup'}</button><button class="btn" id="import">Import backup</button></div><p class="muted">Last export: ${escape(date(state.lastExport))}. Save the downloaded JSON file to your Google Drive folder.</p><p class="note">Purchased workbooks and card images stay in separate lesson pack ZIPs. Use Sync now to include books in your Drive recovery copy. Exporting a file does not confirm that it reached Drive.</p></article><article class="card stack"><h2>Lesson packs in your Drive</h2><p>Sync now saves installed lesson packs in your Drive. Restore from Drive installs the books included in the selected family backup.</p><div class="actions"><button class="btn" id="list-drive-packs">Go to Downloads</button></div><p class="muted">Connect Google Drive first. The app creates its own materials folder automatically. Each household uses its own Drive; sharing this website does not share anyone’s records or purchased books.</p><div id="pack-drive-status" role="status"></div><div id="drive-pack-list" class="stack"></div></article><article class="card stack"><h2>Use another device</h2><ol><li>Open the same <a href="${APP_URL}">GitHub website</a>.</li><li>Import your JSON backup, or connect Google Drive and choose Restore from Drive before entering new records. Use your own household’s Google account.</li><li>Choose a recovery copy. Its saved books install automatically for offline use.</li><li>Use Sync now to combine later work, or export/import updated JSON backups.</li></ol></article></div>`;
 const syncBody=main.querySelector(':scope > .grid');
 const syncCards=Array.from(syncBody.children);
 syncBody.className='stack';
 screenMenu(syncBody,syncCards.map((node,i)=>({key:['sync','pending','files','packs','device'][i],label:node.querySelector('h2').textContent,node})));
 if($('#sync-now'))$('#sync-now').onclick=()=>runDrive(false);if($('#restore-drive'))$('#restore-drive').onclick=()=>runDrive(true);if($('#retry-drive'))$('#retry-drive').onclick=async()=>{const b=$('#retry-drive');b.disabled=true;b.textContent='Checking…';await refreshDrive();};$('#list-drive-packs').onclick=()=>{location.hash='downloads';};$('#export').onclick=exportBackup;$('#import').onclick=importBackup;if($('#disconnect'))$('#disconnect').onclick=()=>{if(!busy){disconnectDrive();render();}};}

const bookLibrary={
 list:async()=> (await listPacks()).map(m=>({...m,grade:materialGrade(state.records,m)})),
 read:exportPack, install:importPack
};
function driveProgress(label,n,total){
 const bar=$('#sync-bar'), out=$('#sync-progress');
 if(bar && out)transferDisplay(bar,out,label,n,total);
}
function studentSettings(){
 const host=$('#student-settings');if($('#active-student-count'))$('#active-student-count').textContent=profiles().length+' active students';let rows=profiles().map(p=>({childId:p.childId,name:p.name,grade:p.grade||'Kindergarten'}));
 const archived=currentProfiles(state.records).filter(p=>p.active===false);
 host.innerHTML=`<h2>Students and grade levels</h2><p>Choose how many students you teach. Their names appear automatically in lessons, chapter assessments, assignments, and progress.</p><form id="students-form" class="stack"><label>Number of students<input id="student-count" type="number" min="1" max="100" step="1" value="${rows.length||1}" required></label><button class="btn" id="adjust-students" type="button">Adjust student list</button><div id="student-rows" class="stack"></div><p class="muted">Reducing the list archives students instead of deleting their scores. Rename an existing student only when correcting their name; add a new student for a different person.</p><p id="student-error" role="alert"></p><button class="btn primary" type="submit">Save students</button></form>${archived.length?`<details><summary>Archived students (${archived.length})</summary><div class="stack">${archived.map(p=>`<div>${escape(p.name)} · ${escape(p.grade||p.level)} <button class="btn small" data-reactivate="${escape(p.childId)}">Restore student</button></div>`).join('')}</div></details>`:''}`;
 const readRows=()=>{rows=rows.map((r,i)=>({...r,name:$('#student-name-'+i).value,grade:$('#student-grade-'+i).value}));};
 const draw=()=>{$('#student-rows').innerHTML=rows.map((r,i)=>`<div class="form-grid"><label>Student ${i+1} name<input id="student-name-${i}" required maxlength="60" value="${escape(r.name)}"></label><label>Student ${i+1} grade<select id="student-grade-${i}">${GRADES.map(g=>`<option ${g===r.grade?'selected':''}>${g}</option>`).join('')}</select></label></div>`).join('');};const originalDraw=draw;
 function showStudentRows() {
  originalDraw();
  const host=$('#student-rows'), forms=Array.from(host.children);
  const chooser=document.createElement('select');
  rows.forEach((r,i)=>chooser.add(new Option(r.name || 'Student '+(i+1),i)));
  const label=document.createElement('label');label.textContent='Choose student';label.append(chooser);host.prepend(label);
  const switchRow=()=>forms.forEach((node,i)=>node.hidden=i!==chooser.selectedIndex);
  const firstIncomplete=rows.findIndex(r=>!r.name);chooser.selectedIndex=firstIncomplete>=0?firstIncomplete:0;
  chooser.onchange=switchRow;switchRow();
  forms.forEach((node,i)=>node.addEventListener('invalid',()=>{if($('#students-form').querySelector(':invalid')&&node.contains($('#students-form').querySelector(':invalid'))){chooser.selectedIndex=i;switchRow();}},true));
 }
 showStudentRows();
 $('#adjust-students').onclick=()=>{const count=Number($('#student-count').value);if(!Number.isInteger(count)||count<1||count>100){$('#student-error').textContent='Choose a whole number from 1 to 100.';return;}readRows();while(rows.length<count)rows.push({name:'',grade:'Kindergarten'});rows=rows.slice(0,count);showStudentRows();dirty=true;$('#student-error').textContent='Review the names, then save the student list.';};
 $('#students-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{if(Number($('#student-count').value)!==rows.length)throw new Error('Click Adjust student list, fill in the names, then Save students.');readRows();await mutate(s=>{s.records.push(...rosterChanges(s.records,rows,record,uid));});dirty=false;studentSettings();toast('Students saved. Assessments now use this student list.');}catch(error){$('#student-error').textContent=error.message;}finally{b.disabled=false;}};
 host.querySelectorAll('[data-reactivate]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await mutate(s=>{const p=currentProfiles(s.records).find(p=>p.childId===b.dataset.reactivate);if(!p)return;if(activeStudents(s.records).length>=100)throw new Error('This edition supports up to 100 active students.');s.records.push(record('profile',{childId:p.childId,name:p.name,grade:p.grade||'Kindergarten',level:p.level||'Kindergarten',active:true}));});studentSettings();toast('Student restored with their earlier records.');}catch(error){notice('Could not restore student',error.message);}});
}
const settingsBack=(parent='settings',label='Settings')=>`<a class="settings-back" href="#${parent}">← ${label}</a>`;
function updateDriveShortcut() {
 const entry = document.getElementById('family-drive-entry');
 if (!entry) return;
 const connected = isConnected();
 const canConnect = driveReady && !connected;
 const title = canConnect ? 'Connect Google Drive' : 'Google Drive';
 const detail = connected ? 'Connected' : canConnect ? 'Choose your Google account' : 'Connection and backups';
 const content = `<span class="settings-icon">${icon('sync')}</span><span class="settings-label"><strong>${title}</strong><small>${detail}</small></span><span class="settings-chevron" aria-hidden="true">›</span>`;
 if (canConnect) {
  entry.innerHTML = `<button type="button" class="settings-row drive-shortcut">${content}</button>`;
  entry.firstElementChild.onclick = connectFamilyDrive;
 } else {
  entry.innerHTML = `<a href="#settings/drive" class="settings-row">${content}</a>`;
 }
}

async function connectFamilyDrive(event) {
 if (busy) return;
 const button = event.currentTarget;
 const startPage = location.hash;
 busy = true;
 button.disabled = true;
 try {
  if (!navigator.onLine) throw new Error('Connect to the internet and try again.');
  // Request consent directly during the tap so mobile browsers can open the account chooser.
  await connectDrive({chooseAccount:isConnected() || location.hash==='#settings/drive'});
  driveError = '';
  toast('Google Drive connected.');
 } catch (error) {
  driveError = error.message;
 } finally {
  busy = false;
  button.disabled = false;
  updateStatus();
  if (startPage === '#settings' && location.hash === startPage) location.hash = 'settings/drive';
  else if (location.hash === '#settings/drive') driveSettings();
  else if (location.hash === '#settings') updateDriveShortcut();
 }
}

function driveSettings() {
 const panel = document.getElementById('drive-connection');
 if (!panel) return;
 const connected = isConnected();
 const ready = connected || driveReady;
 let message = 'Google Drive is waiting for the app owner to finish setup. Your family can keep using this device.';
 if (!navigator.onLine) message = 'Connect to the internet to use Google Drive.';
 else if (configuredClientId() && !ready) message = 'Google sign-in could not load. Check your internet connection and try again.';
 else if (ready) message = connected ? 'Connected to '+escape(driveAccount())+'. Open Backup and restore to save or recover your family’s records and books.' : 'Choose your Google account and allow Family Learning to find and download your lesson packs and save backups in your Drive.';
 panel.innerHTML = `<p>${message}</p>
  ${driveError ? `<p class="note" role="alert">${escape(driveError)}</p>` : ''}
  ${ready ? `<button class="btn primary" type="button" id="settings-connect-drive">${connected ? 'Choose another Google account' : 'Connect Google Drive'}</button>` : '<button class="btn" type="button" id="retry-family-drive">Check Google Drive connection</button>'}
  ${connected ? '<span class="badge">Connected</span>' : ''}
  <a class="settings-row" href="#settings/backup"><span><strong>Backup and restore</strong><small>Save or recover your family’s records and lesson packs</small></span><span aria-hidden="true">›</span></a>
  ${connected ? '<button class="btn" type="button" id="settings-disconnect-drive">Disconnect this device</button>' : ''}
  <details><summary>App owner setup</summary><div class="setup-links"><a class="btn" href="#settings/drive-setup">Step-by-step connection guide</a><a class="btn" href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noopener noreferrer">Find the Google client ID</a><a class="btn" href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noopener noreferrer">Open Google Drive API</a></div></details>`;
 const connect = panel.querySelector('#settings-connect-drive');
 if (connect) connect.onclick = connectFamilyDrive;
 const retry = panel.querySelector('#retry-family-drive');
 if (retry) retry.onclick = async () => {
  if (busy) return;
  retry.disabled = true;
  retry.textContent = 'Checking…';
  await refreshDrive();
  if (!driveReady && !driveError && panel.isConnected) toast('Owner setup is still pending.');
 };
 const disconnect = panel.querySelector('#settings-disconnect-drive');
 if (disconnect) disconnect.onclick = () => {
  if (busy) return;
  disconnectDrive();
  driveSettings();
  updateStatus();
  toast('Disconnected on this device.');
 };
}
function driveSetup(){
 main.innerHTML=settingsBack('settings/drive','Google Drive')+heading('Google Drive setup guide','Follow these steps in order. Each step tells you what to check.')+driveGuide(configuredClientId(),escape);
 const guide=main.querySelector('.setup-guide');
 const sections=Array.from(guide.children);
 const jump=$('#setup-jump');
 if(jump)jump.closest('label').remove();
 const guideMenu=screenMenu(guide,sections.map((node,i)=>({node,key:'step-'+i,label:node.querySelector('h2,summary')?.textContent || 'Help'})));
 for(let i=0;i<sections.length-1;i++){
   const next=document.createElement('button');next.type='button';next.className='btn';next.textContent='Next';
   next.onclick=()=>guideMenu.show('step-'+(i+1),true);sections[i].append(next);
 }
 document.querySelectorAll('[data-setup-copy]').forEach(button=>button.onclick=async()=>{try{await navigator.clipboard.writeText(button.dataset.setupCopy);toast('Copied. Paste it into the matching Google field.');}catch{toast('Copy is unavailable. Select and copy the address shown above the button.');}});
 $('#drive-settings').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;const b=e.submitter,out=$('#drive-settings-status');b.disabled=true;out.textContent='Saving…';try{driveReady=await saveDriveClient(new FormData(e.target).get('clientId'));driveError='';dirty=false;out.textContent=driveReady?'Saved. Return to Google Drive to connect.':'Override cleared. The website still needs Google sign-in setup.';}catch(error){driveReady=false;driveError=error.message;out.textContent=error.message;}finally{busy=false;b.disabled=false;}};
}
function settings(section){
 const row=(path,title,detail,ico)=>`<a class="settings-row" href="#${path}"><span class="settings-icon">${icon(ico)}</span><span class="settings-label"><strong>${title}</strong><small>${detail}</small></span><span class="settings-chevron" aria-hidden="true">›</span></a>`;
 if(!section){
  main.innerHTML=heading('Settings','Choose what you want to manage.')+`<div class="settings-menu"><section class="settings-group" aria-label="Materials"><h2>Materials</h2><div class="settings-list">${row('downloads','Downloads','Get lesson packs by grade and subject','subjects')}${row('library','Teaching library','Write lessons and assign them to a student','create')}</div></section><section class="settings-group" aria-label="Family"><h2>Family</h2><div class="settings-list">${row('settings/students','Students and grades',profiles().length+' active students','learners')}${row('learners','Learning plans','Assignments and records for each child','library')}</div></section><section class="settings-group" aria-label="Backup"><h2>Backup</h2><div class="settings-list"><div id="family-drive-entry"></div>${row('settings/backup','Backup and restore','Sync, export, import and lesson packs','library')}${row('settings/reminders','Backup reminders','Choose when to be reminded','settings')}</div></section><section class="settings-group" aria-label="App"><h2>App</h2><div class="settings-list">${row('settings/updates','App updates','Web edition '+VERSION,'sync')}${row('settings/offline','Offline and installation','Home-screen access and device storage','home')}${row('settings/about','About Family Learning','Website and app information','settings')}</div></section></div>`;updateDriveShortcut();return;
 }
 if(section==='backup')return syncPage();
 if(section==='drive-setup')return driveSetup();
 const titles={students:'Students and grades',drive:'Google Drive',reminders:'Backup reminders',updates:'App updates',offline:'Offline and installation',about:'About Family Learning'};
 if(!titles[section])return settings();
 main.innerHTML=settingsBack()+heading(titles[section],'')+'<div id="settings-detail" class="settings-detail"></div>';
 const detail=$('#settings-detail');
 if(section==='students'){detail.innerHTML='<div id="student-settings" class="card stack"></div>';studentSettings();}
 if(section==='drive'){detail.innerHTML='<article id="drive-connection" class="card stack"></article>';driveSettings();}
 if(section==='reminders'){
  detail.innerHTML=`<form id="settings-form" class="card stack"><p>Show a reminder inside the app when either limit is reached.</p><label>Unsynced data (MB)<input name="thresholdMB" type="number" min="1" max="500" required value="${state.settings.thresholdMB}"></label><label>Time since pending changes (hours)<input name="thresholdHours" type="number" min="1" max="720" required value="${state.settings.thresholdHours}"></label><button class="btn primary" type="submit">Save reminders</button><small>Reminders do not upload your records.</small></form>`;
  $('#settings-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;const f=new FormData(e.target);try{await mutate(s=>{s.settings.thresholdMB=Number(f.get('thresholdMB'));s.settings.thresholdHours=Number(f.get('thresholdHours'));s.settings.snoozeUntil=0;});dirty=false;toast('Reminder settings saved.');}catch(error){notice('Settings were not saved',error.message);}finally{b.disabled=false;}};
 }
 if(section==='updates'){
  detail.innerHTML=`<article class="card stack"><span class="badge">Web edition ${VERSION}</span><p>Check for a newer edition, then apply it when you are ready. Saved learning records stay on this device.</p><button class="btn primary" id="check-update">Check for updates</button><div id="update-state" role="status" aria-live="polite"></div><p class="muted">The archived Android APK is version 0.1.2. Website updates do not replace that installed APK.</p></article>`;$('#check-update').onclick=checkUpdate;
 }
 if(section==='offline'){
  detail.innerHTML=`<article class="card stack"><p id="offline-status"></p><button class="btn" id="keep-offline">Keep data on this device</button><a class="btn primary" href="#install">Installation choices</a><p class="muted">Keep a backup of your records even when offline storage is available.</p></article>`;
  $('#keep-offline').onclick=async()=>{try{const ok=await navigator.storage?.persist?.();toast(ok?'Persistent storage granted. Keep making backups.':'This browser controls storage retention. Continue making backups.');}catch(e){notice('Offline storage',e.message);}};updateOfflineStatus();
 }
 if(section==='about')detail.innerHTML=`<article class="card stack"><h2>Family Learning</h2><p>Web edition ${VERSION} · ${profiles().length} active students</p><a href="${APP_URL}">Official website</a><a href="${REPOSITORY_URL}" target="_blank" rel="noopener">Source repository</a><p class="muted">Shared materials and separate learning records for each student. Background sync is off. This edition is a parent workspace; individual child sign-in is not available.</p></article>`;
}
function updateOfflineStatus(){const out=$('#offline-status');if(out)out.textContent=native?'This app is bundled on your device for offline use.':registration?.active?'Ready for offline use in this browser. Saved work stays on this device.':'Offline startup is not confirmed yet. Open the app online and check again.';}
async function exportBackup(){try{await writeQueue;state=await readState();const data=envelope(state.workspaceId,state.records,state.deviceId,state.settings);validateBackup(data);if(native){window.FamilyNative.saveBackup(JSON.stringify(data),`Family-Learning-${new Date().toISOString().slice(0,10)}.json`);return;}const blob=new Blob([JSON.stringify(data)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`Family-Learning-${new Date().toISOString().slice(0,10)}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);await mutate(s=>s.lastExport=new Date().toISOString());toast('Backup download started. Save that file to Drive for recovery.');render();}catch(error){notice('Export did not complete',error.message);}}
function importBackup(){if(native){window.FamilyNative.openBackup();return;}const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.hidden=true;document.body.append(input);input.addEventListener('cancel',()=>input.remove(),{once:true});input.onchange=async()=>{const file=input.files[0];input.remove();try{if(!file)return;if(file.size>100*1024*1024)throw new Error('This version supports recovery files up to 100 MB.');const data=validateBackup(JSON.parse(await file.text()));previewRestore(data,false);}catch(error){notice('Backup not imported',error.message);}};input.click();}
function previewRestore(data,fromDrive){
 const same=data.workspaceId===state.workspaceId;
 if(!same && state.records.some(r=>!r.seed)){
  return notice('Different family backup','This device already has work from another family space. Restore into a fresh browser profile or device.');
 }
 const counts=data.records.length+' records'+(fromDrive?' and '+(data.books?.length || 0)+' books':'');
 const message=counts+' from '+date(data.exportedAt)+'. '+(same?'Existing records will be combined.':'This opens the saved family on this device.');
 confirmAction('Restore this backup?',message,async()=>{
  if(busy)return;
  busy=true;
  try{
   await mutate(s=>{
    const matching=s.workspaceId===data.workspaceId;
    if(!matching && s.records.some(r=>!r.seed))throw new Error('The family space changed while the backup was open.');
    s.records=matching?mergeRecords(s.records,data.records):data.records;
    if(data.settings)s.settings={...s.settings,...data.settings};
    s.workspaceId=data.workspaceId;
    if(!matching)s.syncedIds=[];
    if(fromDrive)s.syncedIds=[...new Set([...s.syncedIds,...data.records.map(r=>r.id)])];
   });
   if(fromDrive){
    try{await restoreBooks(data.books,bookLibrary,driveProgress);}
    catch(error){throw new Error('Family records restored. To finish installing the books, choose Restore from Drive again. '+error.message);}
    await mutate(s=>{if(s.workspaceId===data.workspaceId)s.lastSync=new Date().toISOString();});
   }
   location.hash='learners';render();toast('Recovery copy restored.');
  }finally{busy=false;if(isSyncPage())syncPage();}
 });
}
async function runDrive(restore){
 if(busy)return;
 if(!driveReady){location.hash='settings/drive';return;}
 busy=true;
 try{
  if(!navigator.onLine)throw new Error('Connect to the internet before syncing.');
  if(!isConnected())await connectDrive();
  if(restore){
   const files=await availableBackups();
   if(!files.length)return notice('No backups found','This Google account has no Family Learning backups yet.');
   dialog('<h2>Choose a recovery copy</h2><div class="stack">'+files.slice(0,30).map(f=>
    '<button class="btn" data-restore-id="'+escape(f.id)+'">'+escape(date(f.createdTime))+'</button>'
   ).join('')+'<button class="btn" data-close>Cancel</button></div>');
   document.querySelectorAll('[data-restore-id]').forEach(button=>button.onclick=async()=>{
    if(busy)return;
    busy=true;closeDialog();
    try{
     const file=files.find(f=>f.id===button.dataset.restoreId);
     previewRestore(await downloadBackup(file.id,driveProgress,file.size),true);
    }catch(error){notice('Could not restore',error.message);}
    finally{busy=false;}
   });
   return;
  }
  await writeQueue;state=await readState();
  const workspace=state.workspaceId;
  await syncStudentEvidence(workspace,namedStudents());
  const result=await syncDrive(structuredClone(state),driveProgress,bookLibrary);
  await mutate(s=>{
   if(s.workspaceId!==workspace)throw new Error('The family space changed during sync. The uploaded backup is safe.');
   s.records=mergeRecords(s.records,result.records);
   s.syncedIds=[...new Set([...s.syncedIds,...result.syncedIds])];s.lastSync=result.at;
  });
  render();toast('Saved to Google Drive and verified.');
 }catch(error){notice('Sync did not complete',error.message);}
 finally{busy=false;if(isSyncPage())syncPage();}
}
async function checkUpdate(){
 if(native){window.FamilyNative.openUpdates();return;}
 const button=$('#check-update'),output=$('#update-state');button.disabled=true;output.textContent='Checking GitHub for an update…';
 try{
  if(!isOfficialWeb(location.href)&&!['localhost','127.0.0.1'].includes(location.hostname)){output.innerHTML=`This is a separate copy of the app. Export your records in Sync, then <a href="${APP_URL}">open the official GitHub website</a> and import your backup.`;return;}
  if(!navigator.onLine)throw new Error('Connect to the internet to check for updates.');
  const response=await fetch(new URL(`version.json?check=${Date.now()}`,isOfficialWeb(location.href)?APP_URL:location.href),{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('GitHub could not provide update information. Your saved records are unchanged.');
  const latest=await response.json();const comparison=compareVersions(latest.version,VERSION);
  if(comparison<0)throw new Error('GitHub is still finishing publication. Keep this newer edition and check again shortly.');
  await registrationPromise;
  if(!registration){output.innerHTML=`Published web version: ${escape(latest.version)}. <button class="btn" id="reload-app">Reload website</button>`;$('#reload-app').onclick=async()=>{await writeQueue;location.reload();};return;}
  await registration.update();await waitForInstall(registration.installing);
  if(registration.waiting){output.innerHTML=`Version ${escape(latest.version)} is ready. <button class="btn small" id="apply-update">Apply update</button>`;$('#apply-update').onclick=async()=>{const worker=registration.waiting;if(!worker)return checkUpdate();if(dirty||busy)return notice('Finish your current work','Save your draft and wait for sync to finish before applying this update.');$('#apply-update').disabled=true;output.firstChild.textContent='Applying update… ';await writeQueue;updatePending=true;worker.postMessage({type:'APPLY_UPDATE'});};}
  else output.textContent=comparison===0?`You are using the latest web edition (${VERSION}) from GitHub.`:`Version ${latest.version} is published. Its offline files are still downloading; check again shortly.`;
 }catch(error){output.textContent=error.name==='TimeoutError'?'The update check timed out. Retry when your connection is stable.':error.message;}finally{button.disabled=false;}
}

function fallbackRoute() {
 const [page,id,child] = location.hash.slice(1).split('/');
 if (page==='settings') return id==='drive-setup' ? '#settings/drive' : '#settings';
 if (page==='book' && child) return '#book/'+id;
 if (page==='lesson') return '#level/'+id;
 if (page==='grades' || page==='evidence')return '#learner/'+id;
 if(page==='teachers' && id)return '#teachers';
 if (page==='learner') return '#students';
 if (page==='assignment') return '#learners';
 if (page==='install') return '#settings/offline';
 if (page==='learning-progress' && id) return '#learning-progress';
 if (['book','create','edit'].includes(page)) return '#library';
 if (['downloads','library'].includes(page)) return '#settings';
 if (['level','subject'].includes(page)) return '#subjects';
 return '#home';
}
function updateBackButton() {
 const root=['','#home','#teachers','#students','#subjects','#settings'].includes(location.hash);
 const back=document.getElementById('app-back');
 back.hidden=root && !activePanel();
}
document.addEventListener('family-screen',updateBackButton);
window.addEventListener('popstate',()=>{ if(location.hash===renderedHash){restorePanel();updateBackButton();} });
document.getElementById('app-back').onclick=()=>{
 if(activePanel() || history.state?.flFrom){history.back();return;}
 location.hash=fallbackRoute();
};
function missing(){main.innerHTML=heading('This item is not available.','It may belong to another family backup.')+'<a class="btn" href="#home">Return home</a>';}
function render(){if(!state)return;renderedHash=location.hash;pageScope.abort();pageScope=new AbortController();downloadStatus();lessons.reset();dirty=false;const [first,raw,chapterId,cardId]=location.hash.slice(1).split('?')[0].split('/');const route=first || 'home';let id;try{id=raw?decodeURIComponent(raw):undefined;}catch{return missing();}$('#navigation').innerHTML=nav.map(([key,label])=>`<a href="#${key}" ${key===route||(key==='subjects'&&['subject','level','lesson'].includes(route))||(key==='students'&&['learners','learner','assignment','grades','evidence','learning-progress'].includes(route) || key==='teachers'&&['home','library','book','create','edit'].includes(route))||(key==='settings'&&['sync','install','downloads'].includes(route))?'aria-current="page"':''}>${icon(key)}<span>${label}</span></a>`).join('');const result=({home,teachers:()=>teachers(id),students:learners,evidence:()=>evidence(id),grades:()=>grades(id),downloads:()=>lessons.downloads(),subjects:()=>lessons.subjects(),subject:()=>lessons.subject(id),level:()=>lessons.level(id,chapterId),lesson:()=>lessons.player(id,chapterId,cardId),'learning-progress':()=>lessons.progress(id),library,learners,learner:()=>learner(id),book:()=>book(id,chapterId),create:()=>editor(),edit:()=>editor(id),assignment:()=>workForm(id),sync:syncPage,settings:()=>settings(id),install:()=>installationPage(main,{native,version:VERSION,prompt:installPrompt})}[route]||home)();result?.catch?.(error=>notice('Could not open lessons',error.message));updateBackButton();updateStatus();if(!native&&location.hostname.endsWith('.chatgpt.site'))main.insertAdjacentHTML('afterbegin',`<div class="note"><strong>This is the older website.</strong> Export your backup in Sync, then <a href="${APP_URL}">open Family Learning on GitHub</a> and import it. Your records here stay intact.</div>`);window.scrollTo(0,0);}
async function checkReminder(){if(state&&reminderDue(state.records,state.syncedIds,state.settings)&&!$('#dialog').open){dialog(`<h2>Your work needs a backup.</h2><p>${pendingRecords(state.records,state.syncedIds).length} changes (${bytes(pendingBytes(state.records,state.syncedIds))}) are not verified in Google Drive.</p><p class="muted">Last verified sync: ${escape(date(state.lastSync))}</p><div class="actions"><button class="btn primary" id="go-sync">Open Sync</button><button class="btn" id="snooze">Remind me in an hour</button></div>`);$('#go-sync').onclick=()=>{closeDialog();location.hash='settings/backup';};$('#snooze').onclick=async()=>{await mutate(s=>s.settings.snoozeUntil=Date.now()+3600000);closeDialog();};}}
document.addEventListener('click',event=>{const target=event.target.closest('button,a');if(!target)return;if(target.hasAttribute('data-close'))closeDialog();if(target.dataset.assign)assign(target.dataset.assign);if(target.dataset.profile)editProfile(target.dataset.profile);if(target.dataset.bookView)book(target.dataset.book,target.dataset.bookView);if(target.hasAttribute('data-print')){if(native)window.FamilyNative.printPage();else window.print();}if(target.matches('a[href^="#"]')&&dirty){event.preventDefault();const href=target.getAttribute('href');confirmAction('Leave this unsaved draft?','The changes on this form have not been saved. Continue only if you want to discard them.',()=>{dirty=false;location.hash=href;});}});
document.addEventListener('input',e=>{if(e.target.closest('#editor,#work-form,#settings-form,#drive-settings,#profile-form,#assign-form,#lesson-results,#students-form'))dirty=true;});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
window.addEventListener('hashchange',async event=>{
 if(!history.state?.flEntry) history.replaceState({...history.state,flEntry:true,flFrom:new URL(event.oldURL).hash || '#home'},'');
 if(pendingWrites){try{await writeQueue;}catch{}}if(dirty){const destination=location.hash;history.replaceState(null,'',renderedHash||'#home');confirmAction('Leave this unsaved draft?','Save your changes first, or continue to discard this draft.',()=>{dirty=false;location.hash=destination;});}else render();});window.addEventListener('online',()=>{updateStatus();refreshDrive();});window.addEventListener('offline',updateStatus);
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;if(location.hash==='#install')installationPage(main,{native,version:VERSION,prompt:installPrompt});});
channel?.addEventListener('message',async()=>{state=await readState();updateStatus();if(!dirty&&!$('#dialog').open&&!busy)render();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkReminder();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#dialog').open)closeDialog();});
async function start(){try{await openStore();state=await readState();if(!state){state={workspaceId:uid(),deviceId:uid(),records:seedRecords().filter(r=>r.kind==='profile').map((p,i)=>({...p,name:'Student '+(i+1),grade:'Kindergarten',level:'Kindergarten'})),settings:{...defaults},syncedIds:[],lastSync:null,lastExport:null};state=await updateState(s=>s,state);if(!location.hash)history.replaceState(null,'','#teachers');}history.replaceState({...history.state,flEntry:true},'');render();checkReminder();setInterval(checkReminder,60000);if(!native&&'serviceWorker'in navigator){let hadController=Boolean(navigator.serviceWorker.controller);navigator.serviceWorker.addEventListener('controllerchange',()=>{if((hadController||updatePending)&&!dirty&&!busy&&!downloadJob.running)location.reload();hadController=true;});registrationPromise=navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(reg=>{registration=reg;updateOfflineStatus();}).catch(error=>{const out=$('#offline-status');if(out)out.textContent='Offline setup failed: '+error.message;});}if(!native&&navigator.onLine)refreshDrive();}catch(error){main.innerHTML=heading('Your classroom could not open.','Nothing has been marked saved.')+`<div class="note">${escape(error.message)} Please enable browser storage and try again.</div>`;}}
window.nativeBackupFinished=async result=>{if(result==='saved'){await mutate(s=>s.lastExport=new Date().toISOString());toast('Backup saved to the location you selected.');if(isSyncPage())render();}else if(result==='failed')notice('Backup was not saved','Please try again and choose an available folder.');};
window.nativeImportBackup=text=>{try{previewRestore(validateBackup(JSON.parse(text)),false);}catch(error){notice('Could not import',error.message);}};
window.nativeImportFailed=message=>notice('Could not open backup',message);
start();

