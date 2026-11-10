import {readPackResponse,zipDigest} from './pack-transfer.js';
import {validateBackup,mergeRecords,envelope,uid} from './core.js';
let token='',expires=0,config,googleLoading,readGranted=false;
let transfers=0;
export async function duringTransfer(work){
 transfers++;
 try{return await work();}finally{transfers--;}
}
const ACCOUNT_KEY='family-learning-last-drive-account';
export function driveAccount(){try{return localStorage.getItem(ACCOUNT_KEY) || '';}catch{return '';}}
export const canReadSource=()=>isConnected() && readGranted;
const API='https://www.googleapis.com/drive/v3/files';
const SCOPE='https://www.googleapis.com/auth/drive.file';
const READ_SCOPE='https://www.googleapis.com/auth/drive.readonly';
const CLIENT_KEY='family-learning-google-client';
export const validClientId=value=>/^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(value);
export function configuredClientId(){return config?.googleClientId||'';}
export async function driveConfig(refresh=false){
 if(!config||refresh){const response=await fetch('./config.json',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('Connection settings could not load. Retry when online.');const next=await response.json();const saved=localStorage.getItem(CLIENT_KEY);if(saved)next.googleClientId=saved;if(config&&config.googleClientId!==next.googleClientId)disconnectDrive();config=next;}
 return config;
}
export async function saveDriveClient(value){
 const id=value.trim();if(id&&!validClientId(id))throw new Error('Enter a Web application client ID ending in .apps.googleusercontent.com. Do not enter a client secret.');
 disconnectDrive();if(id)localStorage.setItem(CLIENT_KEY,id);else localStorage.removeItem(CLIENT_KEY);
 config=undefined;return prepareDrive();
}
function loadGoogle(){
 if(window.google?.accounts?.oauth2)return Promise.resolve();
 if(googleLoading)return googleLoading;
 googleLoading=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
 const timer=setTimeout(()=>fail(),15000);
 const fail=()=>{clearTimeout(timer);script.remove();googleLoading=undefined;reject(new Error('Google sign-in could not load. Check your connection and retry.'));};
 script.onload=()=>{clearTimeout(timer);if(window.google?.accounts?.oauth2)resolve();else fail();};script.onerror=fail;document.head.append(script);
 });return googleLoading;
}
export async function prepareDrive(refresh=false){const cfg=await driveConfig(refresh);if(!cfg.googleClientId)return false;if(!validClientId(cfg.googleClientId))throw new Error('The Google client ID is invalid. Check Drive setup in Settings.');await loadGoogle();return true;}
export function connectDrive({chooseAccount=false}={}){
 if(transfers)throw new Error('Finish the current transfer before choosing a Google account.');
 const oauth=window.google?.accounts?.oauth2;
 if(!config?.googleClientId || !oauth)throw new Error('Complete Google Drive setup in Settings, then connect again.');
 const hint=chooseAccount?'':driveAccount();
 disconnectDrive(false);
 return new Promise((resolve,reject)=>{
  const client=oauth.initTokenClient({
   client_id:config.googleClientId,scope:SCOPE+' '+READ_SCOPE,include_granted_scopes:false,
   ...(hint?{login_hint:hint}:{}),
   callback:async response=>{
    if(response.error || !response.access_token)return reject(new Error('Google Drive permission was not granted.'));
    if(!oauth.hasGrantedAllScopes(response,SCOPE))return reject(new Error('Allow access to files used by Family Learning to save family backups.'));
    try{
     const account=await request('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)',{},response.access_token);
     const email=account.user?.emailAddress;
     if(!email)throw new Error('Google did not identify the account. Reconnect to choose your family Drive.');
     if(hint && email.toLowerCase()!==hint.toLowerCase())throw new Error('Google returned a different account. Choose your family account in Settings before syncing.');
     try{localStorage.setItem(ACCOUNT_KEY,email);}catch{}
     token=response.access_token;expires=Date.now()+Number(response.expires_in)*1000;
     readGranted=oauth.hasGrantedAllScopes(response,READ_SCOPE);resolve();
    }catch(error){reject(error);}
   },
   error_callback:()=>reject(new Error('Google sign-in was closed or blocked. Try Connect again in Chrome or Safari.'))
  });
  client.requestAccessToken({prompt:hint?'':'select_account'});
 });
}
export const isConnected=()=>Boolean(token && Date.now()<expires-60000);
export function disconnectDrive(forget=true){
 token='';expires=0;readGranted=false;
 if(forget){try{localStorage.removeItem(ACCOUNT_KEY);}catch{}}
}
async function request(url,options={},readToken){
 if(!readToken&&!isConnected())throw new Error('Your Google sign-in expired. Reconnect and retry; saved work is still on this device.');
 let response;try{response=await fetch(url,{...options,signal:AbortSignal.timeout(options.responseType==='pack'?600000:120000),headers:{Authorization:`Bearer ${readToken || token}`,...options.headers}});}catch{throw new Error('Google Drive did not respond. Check your internet connection and retry. Nothing is marked synced.');}
 if(!response.ok){if(response.status===401 && !readToken)disconnectDrive(false);let reason='';try{reason=(await response.json()).error?.message||'';}catch{}
 const message = response.status===401 ? 'Your Google sign-in expired. Reconnect and retry.' :
   'Google Drive request failed ('+response.status+'). '+(reason || 'Check your connection and account permissions.');
 const error = new Error(message);
 error.status = response.status;
 throw error;}
 return response.status===204?null:options.responseType==='pack'?response:response.json();
}
async function listFiles(q,readToken){let files=[],pageToken='';do{const params=new URLSearchParams({q,fields:'nextPageToken,files(id,name,createdTime,size,sha256Checksum,appProperties)',pageSize:'100',orderBy:'createdTime desc'});if(pageToken)params.set('pageToken',pageToken);const result=await request(`${API}?${params}`,{},readToken);files.push(...result.files);pageToken=result.nextPageToken||'';}while(pageToken);return files;}
const appQuery="trashed = false and 'me' in owners and appProperties has { key='app' and value='family-learning' }";
export async function availableBackups(){return listFiles(appQuery+" and mimeType = 'application/json'");}
export async function downloadBackup(id,progress,size){
 if(progress){
  const response=await request(API+'/'+encodeURIComponent(id)+'?alt=media',{responseType:'pack'});
  const blob=await readPackResponse(response,(n,total)=>progress('Reading saved family records',n,total),size);
  return validateBackup(JSON.parse(await blob.text()));
 }
 return validateBackup(await request(`${API}/${encodeURIComponent(id)}?alt=media`));}
export function syncDrive(state,progress,library){return duringTransfer(()=>syncFamily(state,progress,library));}
async function syncFamily(state,progress,library){
 progress('Checking the family’s saved records…');
 const files=await availableBackups();let records=state.records;const books=new Map();
 for(const file of files.filter(f=>f.appProperties?.workspace===state.workspaceId)){progress('Combining saved records from your devices…');const backup=await downloadBackup(file.id,progress,file.size);if(backup.workspaceId!==state.workspaceId)throw new Error('A saved file has a mismatched family identity. Sync stopped without replacing your work.');records=mergeRecords(records,backup.records);for(const book of backup.books || []) keepLatest(books,book);}
 const data=envelope(state.workspaceId,records,state.deviceId,state.settings);
 if(library)await syncBooks(books,library,progress);
 if(books.size)data.books=[...books.values()];
 validateBackup(data);
 const folders=await listFiles(`${appQuery} and mimeType = 'application/vnd.google-apps.folder'`);let folder=folders.find(f=>f.appProperties?.workspace===state.workspaceId);
 if(!folder)folder=await request(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Family Learning Backups',mimeType:'application/vnd.google-apps.folder',appProperties:{app:'family-learning',workspace:state.workspaceId}})});
 const metadata={name:`Family-Learning-${new Date().toISOString().replace(/[:.]/g,'-')}.json`,parents:[folder.id],mimeType:'application/json',appProperties:{app:'family-learning',workspace:state.workspaceId}};
 const boundary='family_learning_'+uid();const body=new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,JSON.stringify(metadata),`\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n`,JSON.stringify(data),`\r\n--${boundary}--`],{type:`multipart/related; boundary=${boundary}`});
 progress('Uploading a new recovery copy…');const saved=await uploadBody(body,(n,total)=>progress('Uploading family records',n,total));
 progress('Verifying the saved copy…');const verified=await downloadBackup(saved.id,progress,new Blob([JSON.stringify(data)]).size);if(JSON.stringify(verified)!==JSON.stringify(data))throw new Error('The uploaded copy could not be verified. Local work is still marked unsynced.');
 return {records,savedId:saved.id,syncedIds:records.map(r=>r.id),at:new Date().toISOString()};
}

export async function availableLessonPacks(){return listFiles(appQuery+" and appProperties has { key='type' and value='lesson-pack' }");}
// This searches only the files the family's current Drive grant covers.
export async function findLessonZip(filename,readToken) {
 if (typeof filename !== 'string' || !/^[a-zA-Z0-9 ._-]{1,150}\.zip$/i.test(filename)) {
   throw new Error('Invalid lesson ZIP name.');
 }
 const files = await listFiles("trashed = false and name = '" + filename + "'",readToken);
 return files[0]?.id;
}
export async function downloadLessonPack(id,readToken,report) {
 const url = API+'/'+encodeURIComponent(id);
 const file = await request(url+'?fields=size',{},readToken);
 if (Number(file.size)>100*1024*1024) throw new Error('This pack is larger than the 100 MB limit.');
 const response = await request(url+'?alt=media',{responseType:'pack'},readToken);
 return readPackResponse(response,report,file.size);
}
export async function readPrivateMaterial(item, readToken, report) {
 if (item.file) {
   try { return await downloadLessonPack(item.file,readToken,report); }
   catch (error) { if (![403,404].includes(error.status)) throw error; }
 }
 if (item.filename) {
   const id = await findLessonZip(item.filename,readToken);
   if (id) return downloadLessonPack(id,readToken,report);
 }
 return null;
}

// Older snapshots have records only. New snapshots refer to verified, immutable book files.
function keepLatest(books, book) {
 const old=books.get(book.id);
 if(!old || book.revision>old.revision || (book.revision===old.revision && book.fileId>old.fileId))books.set(book.id,book);
}
const uploadURL='https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,createdTime';
async function uploadBody(body,onBytes){
 onBytes(0,body.size);
 if(typeof XMLHttpRequest==='undefined'){
  const saved=await request(uploadURL,{method:'POST',body});
  onBytes(body.size,body.size);return saved;
 }
 if(!isConnected())throw new Error('Reconnect to Google Drive and retry.');
 return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();
  xhr.open('POST',uploadURL);xhr.timeout=600000;
  xhr.setRequestHeader('Authorization','Bearer '+token);
  xhr.upload.onprogress=e=>onBytes(e.loaded,e.lengthComputable?e.total:body.size);
  xhr.onerror=xhr.ontimeout=()=>reject(new Error('The upload was interrupted. Reconnect and retry.'));
  xhr.onload=()=>{
   let result;try{result=JSON.parse(xhr.responseText);}catch{}
   if(xhr.status>=200 && xhr.status<300 && result?.id)return resolve(result);
   if(xhr.status===401)disconnectDrive(false);
   reject(new Error(result?.error?.message || 'Upload failed. Reconnect and retry.'));
  };
  xhr.send(body);
 });
}

async function backUpBook(manifest,blob,progress,files,hash){
 if(blob.size>100*1024*1024)throw new Error('This pack is larger than the 100 MB limit.');
 const checksum=hash || await zipDigest(blob);
 const classification={};
 if(manifest.grade && manifest.grade!=='Unassigned')classification.grade=manifest.grade;
 if(manifest.subject)classification.subject=manifest.subject;
 const existing=files.find(f=>f.appProperties?.sha256===checksum && f.appProperties?.material===manifest.id &&
   (!f.sha256Checksum || f.sha256Checksum===checksum));
 let file=existing;
 if(existing){
  if(Object.entries(classification).some(([key,value])=>existing.appProperties?.[key]!==value)){
   await request(API+'/'+encodeURIComponent(existing.id),{method:'PATCH',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({appProperties:{...existing.appProperties,...classification}})});
  }
 }else{
  const folders=await listFiles(appQuery+" and mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='type' and value='materials-folder' }");
  const folder=folders[0] || await request(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Family Learning Materials',mimeType:'application/vnd.google-apps.folder',appProperties:{app:'family-learning',type:'materials-folder'}})});
  const metadata={name:manifest.title+' - Lesson Pack.zip',mimeType:'application/zip',parents:[folder.id],appProperties:{app:'family-learning',type:'lesson-pack',material:manifest.id,sha256:checksum,...classification}};
  const boundary='family_learning_'+uid();
  const body=new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,JSON.stringify(metadata),`\r\n--${boundary}\r\nContent-Type: application/zip\r\n\r\n`,blob,`\r\n--${boundary}--`],{type:`multipart/related; boundary=${boundary}`});
  file=await uploadBody(body,(n,total)=>progress('Uploading '+manifest.title,n,total));
  progress('Verifying '+manifest.title);
  const verified=await request(API+'/'+encodeURIComponent(file.id)+'?fields=sha256Checksum,size');
  if(verified.sha256Checksum!==checksum || Number(verified.size)!==blob.size)throw new Error('Could not verify '+manifest.title+'. Retry the backup.');
 }
 return {id:manifest.id,title:manifest.title,fileId:file.id,sha256:checksum,revision:file.createdTime || '1970-01-01T00:00:00.000Z',...classification};
}
export async function uploadLessonPack(manifest,blob,progress){
 return (await backUpBook(manifest,blob,progress,await availableLessonPacks())).fileId;
}
export function restoreBooks(books,library,progress,installed){return duringTransfer(()=>installSavedBooks(books,library,progress,installed));}
async function installSavedBooks(books,library,progress,installed){
 if(!books?.length)return;
 const local=installed || new Map((await library.list()).map(m=>[m.id,m.zipHash]));
 for(const [index,book] of books.entries()){
  let hash=local.get(book.id);
  if(local.has(book.id) && !hash)hash=await zipDigest(await library.read(book.id));
  if(hash===book.sha256)continue;
  const label='Restoring book '+(index+1)+' of '+books.length+' · '+book.title;
  progress(label);
  const blob=await downloadLessonPack(book.fileId,undefined,(n,total)=>progress(label,n,total));
  if(await zipDigest(blob)!==book.sha256)throw new Error('The saved copy of '+book.title+' failed verification. Retry from a verified backup.');
  progress('Saving '+book.title+' for offline use');
  await library.install(blob,{id:book.id,grade:book.grade,subject:book.subject});
 }
}
async function syncBooks(books,library,progress){
 const manifests=await library.list(), local=new Map();
 const files=manifests.length?await availableLessonPacks():[];
 for(const [i,manifest] of manifests.entries()){
  const report=(label,n,total)=>progress('Book '+(i+1)+' of '+manifests.length+' · '+label,n,total);
  report('Checking '+manifest.title);
  const blob=await library.read(manifest.id);
  const hash=manifest.zipHash || await zipDigest(blob);
  local.set(manifest.id,hash);
  const ref=await backUpBook(manifest,blob,report,files,hash);
  keepLatest(books,ref);
 }
 await restoreBooks([...books.values()],library,progress,local);
}
