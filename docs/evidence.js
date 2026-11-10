import {uid} from './core.js';
import {escapeHtml as esc} from './teaching-plan.js';
import {sourceCanvas,warp,detect,validQuad} from './scan-image.js';
import {readDraft,writeDraft,listEvidence,putEvidence,claimDestination,finalizeScan} from './evidence-store.js';
import {driveAccount,isConnected,connectDrive,prepareDrive,configuredClientId,studentEvidenceFiles,ensureStudentFolders,reserveEvidenceId,uploadEvidence,duringTransfer} from './drive.js';
import {transferDisplay} from './pack-transfer.js';

const categories=['Examination','Quiz','Workbook','Art','Project','Other'];
const full=()=>[[0,0],[1,0],[1,1],[0,1]];
const today=()=>new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
const folderLink=id=>'https://drive.google.com/drive/folders/'+encodeURIComponent(id);
const fileLink=id=>'https://drive.google.com/open?id='+encodeURIComponent(id);
const uploads=new Map();
async function send(item,student,progress){
 if(uploads.has(item.id))return uploads.get(item.id);
 const transfer=()=>duringTransfer(async()=>{
  const email=driveAccount();
  if(!isConnected() || item.account && item.account!==email)throw Error('Connect the Google account chosen for this scan.');
  if(!item.driveId){
   item=await claimDestination(item,email,await reserveEvidenceId());
  }
  await uploadEvidence(item,student,progress);
  item.verified=true;await putEvidence(item);
 });
 const work=globalThis.navigator?.locks?navigator.locks.request('student-evidence-'+item.id,transfer):transfer();
 uploads.set(item.id,work);
 try{await work;}finally{uploads.delete(item.id);}
}
let pdfLibrary;
async function pdfFromPages(pages){
 if(!pdfLibrary)pdfLibrary=import('./vendor/scan/jspdf.umd.min.js').catch(error=>{pdfLibrary=null;throw error;});
 await pdfLibrary;
 const doc=new window.jspdf.jsPDF({unit:'mm',format:'a4',orientation:pages[0].width>pages[0].height?'landscape':'portrait',compress:true});
 for(const [index,page] of pages.entries()){
  if(index)doc.addPage('a4',page.width>page.height?'landscape':'portrait');
  const w=doc.internal.pageSize.getWidth(),h=doc.internal.pageSize.getHeight();
  const factor=Math.min((w-12)/page.width,(h-12)/page.height);
  const pw=page.width*factor,ph=page.height*factor;
  doc.addImage(new Uint8Array(await page.blob.arrayBuffer()),'JPEG',(w-pw)/2,(h-ph)/2,pw,ph);
 }
 return doc.output('blob');
}

export function scanScore(earned,total){
 if(earned==='' && total==='')return {};
 const score=Number(earned),possible=Number(total);
 if(earned==='' || total==='' || !Number.isFinite(score) || !Number.isFinite(possible) || possible<=0 || score<0 || score>possible)throw Error('Enter a score from zero to the total possible, or leave both score fields blank.');
 return {score,possible};
}
export async function evidencePage(host,family,student,{signal}){
 host.innerHTML='<div class="page-heading"><div><h1>'+esc(student.name)+' · Evidence</h1><p class="muted">'+esc(student.grade || student.level)+'</p></div></div>'+
  '<div class="card stack"><form class="stack" id="evidence-form"><label>Work title<input name="title" maxlength="100" required placeholder="e.g. Water cycle quiz"></label>'+
  '<div class="form-grid"><label>Work type<select name="category">'+categories.map(s=>'<option>'+s+'</option>').join('')+'</select></label><label>Work date<input name="date" type="date" required></label></div>'+
  '<details><summary>Record a score (optional)</summary><div class="form-grid"><label>Score<input type="number" name="score" step="any" min="0"></label><label>Out of<input type="number" name="possible" step="any" min="0"></label></div></details>'+
  '<div class="actions"><button class="btn primary" type="button" id="capture-work">Scan with camera</button><label class="btn file-control">Choose photos<input type="file" id="evidence-pictures" accept="image/*" multiple></label></div>'+
  '<section id="scan-review" class="stack" hidden></section><div id="evidence-pages" class="stack"></div>'+
  '<button class="btn primary" id="save-evidence" type="submit" disabled>Save assessment PDF</button></form>'+
  '<progress id="evidence-bar" class="download-progress" hidden></progress><p id="evidence-status" role="status"></p></div>'+
  '<section class="card stack"><h2>Saved evidence</h2><div class="actions"><button class="btn" id="evidence-drive"></button><span id="evidence-folder"></span></div><div id="evidence-list" class="stack"></div></section>';
 const el=selector=>host.querySelector(selector),form=el('form'),review=el('#scan-review'),out=el('#evidence-status'),bar=el('#evidence-bar');
 const destinations=el('#evidence-folder'),list=el('#evidence-list'),connect=el('#evidence-drive');
 let draft=await readDraft(family,student.childId) || {id:uid(),title:'',category:'Examination',date:today(),pages:[],pending:[]};
 if(signal.aborted)return;
 let writes=Promise.resolve(),stream,editing=false,locked=false,epoch=0,urls=[],photoUrl,remote=[],folder;
 const status=message=>{if(!signal.aborted)out.textContent=message;};
 const failure=error=>status(error.message || 'Could not complete the scan.');
 const remember=()=>{
  draft.title=form.elements.title.value;draft.category=form.elements.category.value;draft.date=form.elements.date.value;draft.score=form.elements.score.value;draft.possible=form.elements.possible.value;
  const snapshot=structuredClone(draft);
  writes=writes.catch(()=>{}).then(()=>writeDraft(family,student.childId,snapshot));
  return writes;
 };
 const stopCamera=()=>{stream?.getTracks().forEach(track=>track.stop());stream=null;};
 function clearReview(){epoch++;stopCamera();if(photoUrl)URL.revokeObjectURL(photoUrl);photoUrl=null;editing=false;review.replaceChildren();review.hidden=true;}
 function clearPages(){urls.forEach(url=>URL.revokeObjectURL(url));urls=[];}
 signal.addEventListener('abort',()=>{clearReview();clearPages();},{once:true});
 function fields(){
  form.elements.title.value=draft.title;form.elements.category.value=draft.category;form.elements.date.value=draft.date;form.elements.score.value=draft.score ?? '';form.elements.possible.value=draft.possible ?? '';
 }
 function drawPages(){
  if(signal.aborted)return;
  for(const name of ['title','category','date','score','possible'])form.elements[name].disabled=locked;
  clearPages();const pages=el('#evidence-pages');pages.replaceChildren();
  draft.pages.forEach((page,i)=>{
   const row=document.createElement('div');row.className='scan-page-row';
   const img=document.createElement('img');img.alt='Scanned page '+(i+1);img.src=URL.createObjectURL(page.blob);urls.push(img.src);
   const text=document.createElement('strong');text.textContent='Page '+(i+1);row.append(img,text);
   for(const [name,change,disabled] of [
    ['Move up',()=>{[draft.pages[i-1],draft.pages[i]]=[draft.pages[i],draft.pages[i-1]];},!i],
    ['Remove',()=>draft.pages.splice(i,1),false]]){
    const button=document.createElement('button');button.type='button';button.className='btn small';button.textContent=name;button.disabled=locked||editing||disabled;
    button.onclick=async()=>{change();try{await remember();drawPages();}catch(e){failure(e);}};row.append(button);
   }
   pages.append(row);
  });
  el('#save-evidence').disabled=locked||editing||!draft.pages.length||draft.pending.length>0;
  el('#capture-work').disabled=el('#evidence-pictures').disabled=locked||editing;
 }
 async function nextPhoto(){
  if(signal.aborted)return;
  clearReview();
  if(!draft.pending.length){drawPages();return;}
  const pending=draft.pending[0];editing=true;drawPages();review.hidden=false;
  review.innerHTML='<p>Preparing photo…</p>';
  const current=epoch;
  photoUrl=URL.createObjectURL(pending.original);
  let source;
  try{source=await sourceCanvas(photoUrl,pending.rotate || 0);}catch(error){
   if(signal.aborted || current!==epoch)return;
   review.innerHTML='<p>This photo could not be opened. Choose a JPEG or PNG image.</p><button type="button" class="btn">Skip photo</button>';
   review.querySelector('button').onclick=skip;return;
  }
  if(signal.aborted || current!==epoch)return;
  pending.corners ||= detect(source).corners || full();
  review.innerHTML='<h3>Review scan</h3><p>Drag the four corners to the edges of the page.</p><div class="corner-stage"></div><div class="actions"><button type="button" class="btn" data-rotate>Rotate</button><button type="button" class="btn" data-full>Full photo</button><button type="button" class="btn" data-auto>Detect edges</button></div>'+
   '<label class="check-label"><input type="checkbox" data-gray> Black and white</label><div class="actions"><button type="button" class="btn primary" data-keep>Keep page</button><button type="button" class="btn" data-skip>Skip photo</button></div>';
  const stage=review.querySelector('.corner-stage'),preview=document.createElement('canvas');stage.append(preview);
  const scale=Math.min(1,850/Math.max(source.width,source.height));preview.width=Math.max(1,Math.round(source.width*scale));preview.height=Math.max(1,Math.round(source.height*scale));
  const ctx=preview.getContext('2d');const handles=[];
  function paint(){
   ctx.drawImage(source,0,0,preview.width,preview.height);ctx.beginPath();
   pending.corners.forEach(([x,y],i)=>{ctx[i?'lineTo':'moveTo'](x*preview.width,y*preview.height);handles[i].style.left=x*100+'%';handles[i].style.top=y*100+'%';});
   ctx.closePath();ctx.strokeStyle='#00bddd';ctx.lineWidth=3;ctx.stroke();
  }
  pending.corners.forEach((point,i)=>{
   const h=document.createElement('button');h.type='button';h.className='crop-corner';h.setAttribute('aria-label',['Top left','Top right','Bottom right','Bottom left'][i]+' crop corner');stage.append(h);handles.push(h);
   h.onpointerdown=e=>{h.setPointerCapture(e.pointerId);e.preventDefault();};
   h.onpointermove=e=>{if(!h.hasPointerCapture(e.pointerId))return;const rect=preview.getBoundingClientRect();pending.corners[i]=[(e.clientX-rect.left)/rect.width,(e.clientY-rect.top)/rect.height].map(v=>Math.min(1,Math.max(0,v)));paint();};
   h.onpointerup=()=>remember().catch(failure);
   h.onkeydown=e=>{const delta={ArrowUp:[0,-.01],ArrowDown:[0,.01],ArrowLeft:[-.01,0],ArrowRight:[.01,0]}[e.key];if(delta){e.preventDefault();pending.corners[i]=pending.corners[i].map((v,k)=>Math.max(0,Math.min(1,v+delta[k])));paint();remember().catch(failure);}};
  });
  paint();
  const gray=review.querySelector('[data-gray]');gray.checked=!!pending.gray;preview.style.filter=gray.checked?'grayscale(1)':'';
  gray.onchange=()=>{pending.gray=gray.checked;preview.style.filter=gray.checked?'grayscale(1)':'';remember().catch(failure);};
  review.querySelector('[data-rotate]').onclick=async()=>{pending.rotate=((pending.rotate || 0)+90)%360;delete pending.corners;await remember();await nextPhoto();};
  review.querySelector('[data-full]').onclick=()=>{pending.corners=full();paint();remember().catch(failure);};
  review.querySelector('[data-auto]').onclick=()=>{pending.corners=detect(source).corners || full();paint();remember().catch(failure);};
  async function skip(){draft.pending.shift();await remember();await nextPhoto();}
  review.querySelector('[data-skip]').onclick=()=>skip().catch(failure);
  review.querySelector('[data-keep]').onclick=async()=>{
   if(locked)return;
   if(!validQuad(pending.corners)){status('Adjust the corners so their edges do not cross.');return;}
   locked=true;status('Straightening and saving this page…');review.querySelectorAll('button,input').forEach(n=>n.disabled=true);
   try{
    const blob=await warp(source,pending.corners,!!pending.gray);
    const url=URL.createObjectURL(blob);let width,height;
    try{const img=new Image();img.src=url;await img.decode();width=img.naturalWidth;height=img.naturalHeight;}finally{URL.revokeObjectURL(url);}
    draft.pages.push({blob,width,height});draft.pending.shift();await remember();
    status('Page saved on this device. Add another page or save the PDF.');
   }catch(error){failure(error);}finally{locked=false;await nextPhoto();}
  };
 }
 async function queue(files){
  const photos=Array.from(files);if(!photos.length)return;
  draft.pending.push(...photos.map(original=>({original})));await remember();await nextPhoto();
 }
 fields();form.addEventListener('input',e=>{if(['title','category','date','score','possible'].includes(e.target.name))remember().catch(failure);});
 el('#evidence-pictures').onchange=e=>{const images=Array.from(e.target.files);e.target.value='';queue(images).catch(failure);};
 el('#capture-work').onclick=async()=>{
  if(!navigator.mediaDevices?.getUserMedia){nativeCamera();return;}
  clearReview();editing=true;drawPages();review.hidden=false;review.innerHTML='<video playsinline autoplay muted></video><div class="actions"><button type="button" class="btn primary" data-snap disabled>Take photo</button><button type="button" class="btn" data-cancel>Cancel</button></div>';
  const cameraEpoch=epoch,video=review.querySelector('video'),snap=review.querySelector('[data-snap]');
  review.querySelector('[data-cancel]').onclick=()=>{clearReview();drawPages();};
  try{
   const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:2560},height:{ideal:1920}},audio:false});
   if(cameraEpoch!==epoch || signal.aborted){media.getTracks().forEach(t=>t.stop());return;}
   stream=media;video.srcObject=stream;await video.play();snap.disabled=false;
   snap.onclick=async()=>{snap.disabled=true;try{const c=document.createElement('canvas');c.width=video.videoWidth;c.height=video.videoHeight;c.getContext('2d').drawImage(video,0,0);const blob=await new Promise(res=>c.toBlob(res,'image/jpeg',.96));if(!blob)throw Error('Could not capture this photo.');clearReview();await queue([blob]);}catch(e){failure(e);clearReview();drawPages();}};
  }catch(error){
   if(cameraEpoch!==epoch || signal.aborted)return;
   clearReview();drawPages();review.hidden=false;review.innerHTML='<p>Camera preview is unavailable. Use your device camera or choose a photo.</p><button type="button" class="btn">Open device camera</button>';review.querySelector('button').onclick=nativeCamera;
  }
 };
 function nativeCamera(){const input=document.createElement('input');input.type='file';input.accept='image/*';input.capture='environment';input.onchange=()=>queue(input.files).catch(failure);input.click();}
 async function refreshPortfolio(){
  const local=await listEvidence(family,student.childId);
  if(signal.aborted)return;
  list.replaceChildren();const connected=isConnected();
  connect.textContent=connected?'Refresh from Drive':'Connect Google Drive';
  destinations.innerHTML=connected && folder?'<a target="_blank" rel="noopener" href="'+folderLink(folder.id)+'">Open student folder</a>':'';
  const matching=local.filter(v=>!remote.some(f=>f.appProperties?.evidence===v.id));
  const items=[...matching.map(v=>({name:v.filename,date:v.date,item:v})),...remote.map(f=>({name:f.name,date:f.appProperties?.date || '',file:f,item:local.find(v=>v.id===f.appProperties?.evidence)}))].sort((a,b)=>b.date.localeCompare(a.date));
  if(!items.length){list.textContent='No saved evidence for this student yet.';return;}
  for(const row of items){
   const section=document.createElement('div');section.className='card stack';const label=document.createElement('strong');label.textContent=row.name;section.append(label);
   const file=row.file,item=row.item;
   if(item){
    const link=document.createElement('a');link.className='btn';link.href=URL.createObjectURL(item.pdf);link.download=item.filename;link.textContent='Download local PDF';
    signal.addEventListener('abort',()=>URL.revokeObjectURL(link.href),{once:true});section.append(link);
   }
   if(file || connected && item?.verified && item.account===driveAccount()){
    const link=document.createElement('a');link.className='btn';link.href=fileLink(file?.id || item.driveId);link.target='_blank';link.rel='noopener';link.textContent='Open PDF in Drive';section.append(link);
   }
   if(item && !item.verified){
    const b=document.createElement('button');b.className='btn';b.textContent='Save to Google Drive';b.disabled=!connected;
    b.onclick=async()=>{b.disabled=true;try{await send(item,student,(n,total)=>transferDisplay(bar,out,'Saving PDF',n,total));await loadDrive();status('PDF verified in '+student.name+'’s Drive folder.');}catch(e){failure(e);b.disabled=false;}finally{bar.hidden=true;}};section.append(b);
   }list.append(section);
  }
 }
 async function loadDrive(){
  const account=driveAccount();const folders=await ensureStudentFolders(family,[student]);
  const files=await studentEvidenceFiles(family,student.childId);
  if(signal.aborted || account!==driveAccount())return;
  folder=folders[0];remote=files;await refreshPortfolio();
 }
 connect.onclick=async()=>{connect.disabled=true;try{
  if(!isConnected()){
   if(!configuredClientId() || !window.google?.accounts?.oauth2){if(!await prepareDrive())throw Error('Set up Google Drive in Settings.');status('Google is ready. Tap Connect Google Drive to continue.');return;}
   await connectDrive();
  }
  await loadDrive();
 }catch(error){failure(error);}finally{connect.disabled=false;}};
 form.onsubmit=async e=>{
  e.preventDefault();if(locked||editing||!draft.pages.length||draft.pending.length)return;
  locked=true;drawPages();const title=form.elements.title.value.trim();
  try{
   if(!title)throw Error('Enter a title for this work.');
   const grade=scanScore(form.elements.score.value,form.elements.possible.value);
   await remember();const pdf=await pdfFromPages(draft.pages);const item={id:draft.id,family,childId:student.childId,title,category:draft.category,date:draft.date,pdf,
    filename:[draft.date,draft.category,title.replace(/[\\/]/g,'-')].join(' - ')+'.pdf',...grade,account:driveAccount() || '',verified:false};
   await finalizeScan(item);draft={id:uid(),title:'',category:item.category,date:today(),pages:[],pending:[]};fields();
   await refreshPortfolio();status('PDF saved on this device. Connect Drive to save it in the student folder.');
   if(isConnected()){await send(item,student,(n,total)=>transferDisplay(bar,out,'Saving PDF',n,total));await loadDrive();status('PDF verified in '+student.name+'’s Drive folder.');}
  }catch(error){failure(error);}finally{locked=false;bar.hidden=true;drawPages();}
 };
 drawPages();await refreshPortfolio();
 if(isConnected())loadDrive().catch(failure);
 if(draft.pending.length)await nextPhoto();
}

export async function syncStudentEvidence(family,students){
 if(!students.length || !isConnected())return;
 await ensureStudentFolders(family,students);
 for(const student of students){
  const items=await listEvidence(family,student.childId);
  for(const item of items){
   if(!item.verified && (!item.account || item.account===driveAccount()))await send(item,student,()=>{});
  }
 }
}
