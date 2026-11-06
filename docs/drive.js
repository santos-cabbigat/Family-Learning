import {validateBackup,mergeRecords,envelope,uid} from './core.js';
let token='',expires=0,config,googleLoading;
const API='https://www.googleapis.com/drive/v3/files';
const SCOPE='https://www.googleapis.com/auth/drive.file';
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
export function connectDrive(){
 if(!config?.googleClientId||!window.google?.accounts?.oauth2)throw new Error('Complete Google Drive setup in Settings, then connect again.');
 disconnectDrive();
 return new Promise((resolve,reject)=>{const client=window.google.accounts.oauth2.initTokenClient({client_id:config.googleClientId,scope:SCOPE,callback:response=>{
 if(response.error||!response.access_token)return reject(new Error('Google Drive permission was not granted. Nothing was uploaded.'));
 if(!window.google.accounts.oauth2.hasGrantedAllScopes(response,SCOPE))return reject(new Error('Allow access to files used by Family Learning to enable sync.'));
 token=response.access_token;expires=Date.now()+Number(response.expires_in)*1000;resolve();},error_callback:()=>reject(new Error('Google sign-in was closed or blocked. Try Connect again in Chrome or Safari.'))});client.requestAccessToken({prompt:'select_account'});});
}
export const isConnected=()=>Boolean(token&&Date.now()<expires-60000);
export function disconnectDrive(){token='';expires=0;}
async function request(url,options={}){
 if(!isConnected())throw new Error('Your Google sign-in expired. Reconnect and retry; saved work is still on this device.');
 let response;try{response=await fetch(url,{...options,signal:AbortSignal.timeout(120000),headers:{Authorization:`Bearer ${token}`,...options.headers}});}catch{throw new Error('Google Drive did not respond. Check your internet connection and retry. Nothing is marked synced.');}
 if(!response.ok){if(response.status===401)disconnectDrive();let reason='';try{reason=(await response.json()).error?.message||'';}catch{}
 throw new Error(response.status===401?'Your Google sign-in expired. Reconnect and retry.':`Google Drive could not save (${response.status}). ${reason||'Check permissions, storage space, and connection.'} Nothing is marked synced.`);}
 return response.status===204?null:options.responseType==='blob'?response.blob():response.json();
}
async function listFiles(q){let files=[],pageToken='';do{const params=new URLSearchParams({q,fields:'nextPageToken,files(id,name,createdTime,size,appProperties)',pageSize:'100',orderBy:'createdTime desc'});if(pageToken)params.set('pageToken',pageToken);const result=await request(`${API}?${params}`);files.push(...result.files);pageToken=result.nextPageToken||'';}while(pageToken);return files;}
const appQuery="trashed = false and appProperties has { key='app' and value='family-learning' }";
export async function availableBackups(){return listFiles(appQuery+" and mimeType = 'application/json'");}
export async function downloadBackup(id){return validateBackup(await request(`${API}/${encodeURIComponent(id)}?alt=media`));}
export async function syncDrive(state,progress){
 progress('Checking the family’s saved records…');
 const files=await availableBackups();let records=state.records;
 for(const file of files.filter(f=>f.appProperties?.workspace===state.workspaceId)){progress('Combining saved records from your devices…');const backup=await downloadBackup(file.id);if(backup.workspaceId!==state.workspaceId)throw new Error('A saved file has a mismatched family identity. Sync stopped without replacing your work.');records=mergeRecords(records,backup.records);}
 const data=envelope(state.workspaceId,records,state.deviceId,state.settings);validateBackup(data);
 const folders=await listFiles(`${appQuery} and mimeType = 'application/vnd.google-apps.folder'`);let folder=folders.find(f=>f.appProperties?.workspace===state.workspaceId);
 if(!folder)folder=await request(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Family Learning Backups',mimeType:'application/vnd.google-apps.folder',appProperties:{app:'family-learning',workspace:state.workspaceId}})});
 const metadata={name:`Family-Learning-${new Date().toISOString().replace(/[:.]/g,'-')}.json`,parents:[folder.id],mimeType:'application/json',appProperties:{app:'family-learning',workspace:state.workspaceId}};
 const boundary='family_learning_'+uid();const body=new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,JSON.stringify(metadata),`\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n`,JSON.stringify(data),`\r\n--${boundary}--`],{type:`multipart/related; boundary=${boundary}`});
 progress('Uploading a new recovery copy…');const saved=await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',body});
 progress('Verifying the saved copy…');const verified=await downloadBackup(saved.id);if(JSON.stringify(verified)!==JSON.stringify(data))throw new Error('The uploaded copy could not be verified. Local work is still marked unsynced.');
 return {records,savedId:saved.id,syncedIds:records.map(r=>r.id),at:new Date().toISOString()};
}

export async function availableLessonPacks(){return listFiles(appQuery+" and appProperties has { key='type' and value='lesson-pack' }");}
export async function downloadLessonPack(id){const file=await request(`${API}/${encodeURIComponent(id)}?fields=size`);if(Number(file.size)>100*1024*1024)throw new Error('This pack is larger than the 100 MB limit.');return request(`${API}/${encodeURIComponent(id)}?alt=media`,{responseType:'blob'});}
export async function uploadLessonPack(manifest,blob,progress){
 if(blob.size>100*1024*1024)throw new Error('This pack is larger than the 100 MB limit.');
 const checksum=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join('');
 const existing=(await availableLessonPacks()).find(f=>f.appProperties?.sha256===checksum&&f.appProperties?.material===manifest.id);
 if(existing){progress(manifest.title+' is already backed up.');return existing.id;}
 const folders=await listFiles(appQuery+" and mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='type' and value='materials-folder' }");
 let folder=folders[0];if(!folder)folder=await request(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Family Learning Materials',mimeType:'application/vnd.google-apps.folder',appProperties:{app:'family-learning',type:'materials-folder'}})});
 const metadata={name:manifest.title+' - Lesson Pack.zip',mimeType:'application/zip',parents:[folder.id],appProperties:{app:'family-learning',type:'lesson-pack',material:manifest.id,sha256:checksum}};
 const boundary='family_learning_'+uid();const body=new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,JSON.stringify(metadata),`\r\n--${boundary}\r\nContent-Type: application/zip\r\n\r\n`,blob,`\r\n--${boundary}--`],{type:`multipart/related; boundary=${boundary}`});
 progress('Uploading '+manifest.title+'…');const saved=await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',body});
 progress('Verifying '+manifest.title+'…');const verified=await request(`${API}/${encodeURIComponent(saved.id)}?fields=sha256Checksum,size`);
 if(verified.sha256Checksum!==checksum||Number(verified.size)!==blob.size)throw new Error('The lesson pack upload could not be verified. Retry before relying on this backup.');return saved.id;
}
