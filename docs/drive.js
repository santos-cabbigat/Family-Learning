import {validateBackup,mergeRecords,envelope,uid} from './core.js';
let token='',expires=0,config;
const API='https://www.googleapis.com/drive/v3/files';
export async function driveConfig(){if(!config)config=await fetch('./config.json').then(r=>{if(!r.ok)throw new Error('Connection settings are unavailable.');return r.json();});return config;}
function loadGoogle(){if(window.google?.accounts?.oauth2)return Promise.resolve();return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.onload=resolve;script.onerror=()=>reject(new Error('Google sign-in could not load. Check your connection and try again.'));document.head.append(script);});}
export async function prepareDrive(){const cfg=await driveConfig();if(!cfg.googleClientId)return false;await loadGoogle();return true;}
export function connectDrive(){if(!config?.googleClientId)throw new Error('Google Drive setup is not complete for this edition. Your work remains on this device; use Export backup for a separate copy.');return new Promise((resolve,reject)=>{const client=google.accounts.oauth2.initTokenClient({client_id:config.googleClientId,scope:'https://www.googleapis.com/auth/drive.file',callback:response=>{if(response.error)return reject(new Error('Google Drive permission was not granted.'));token=response.access_token;expires=Date.now()+Number(response.expires_in)*1000;resolve();},error_callback:()=>reject(new Error('Google sign-in was closed or blocked. Please try Connect again.'))});client.requestAccessToken({prompt:'select_account'});});}
export const isConnected=()=>Boolean(token&&Date.now()<expires-60000);
export function disconnectDrive(){token='';expires=0;}
async function request(url,options={}){if(!isConnected())throw new Error('Connect to Google Drive again before syncing.');const response=await fetch(url,{...options,headers:{Authorization:`Bearer ${token}`,...options.headers}});if(!response.ok){if(response.status===401)disconnectDrive();throw new Error(`Google Drive could not complete the request (${response.status}). Nothing is marked as synced. Check sign-in, storage space, and connection.`);}return response.status===204?null:response.json();}
async function listFiles(q){let files=[],pageToken='';do{const params=new URLSearchParams({q,fields:'nextPageToken,files(id,name,createdTime,appProperties)',pageSize:'100',orderBy:'createdTime desc'});if(pageToken)params.set('pageToken',pageToken);const result=await request(`${API}?${params}`);files.push(...result.files);pageToken=result.nextPageToken||'';}while(pageToken);return files;}
const appQuery="trashed = false and appProperties has { key='app' and value='family-learning' }";
export async function availableBackups(){return listFiles(appQuery+" and mimeType = 'application/json'");}
export async function downloadBackup(id){return validateBackup(await request(`${API}/${encodeURIComponent(id)}?alt=media`));}
export async function syncDrive(state,progress){
 progress('Checking the family’s saved records…');
 const files=await availableBackups();let records=state.records;
 for(const file of files.filter(f=>f.appProperties?.workspace===state.workspaceId)){progress('Reading saved records and keeping every child’s work…');const backup=await downloadBackup(file.id);if(backup.workspaceId!==state.workspaceId)throw new Error('A saved file has a mismatched family identity. Sync stopped without replacing your work.');records=mergeRecords(records,backup.records);}
 const data=envelope(state.workspaceId,records,state.deviceId);validateBackup(data);
 const folders=await listFiles(`${appQuery} and mimeType = 'application/vnd.google-apps.folder'`);let folder=folders.find(f=>f.appProperties?.workspace===state.workspaceId);
 if(!folder)folder=await request(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Family Learning',mimeType:'application/vnd.google-apps.folder',appProperties:{app:'family-learning',workspace:state.workspaceId}})});
 const metadata={name:`Family-Learning-${new Date().toISOString().replace(/[:.]/g,'-')}.json`,parents:[folder.id],mimeType:'application/json',appProperties:{app:'family-learning',workspace:state.workspaceId}};
 const boundary='family_learning_'+uid();const body=new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,JSON.stringify(metadata),`\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n`,JSON.stringify(data),`\r\n--${boundary}--`],{type:`multipart/related; boundary=${boundary}`});
 progress('Uploading a new recovery copy…');const saved=await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',body});
 progress('Verifying the saved copy…');const verified=await downloadBackup(saved.id);if(JSON.stringify(verified)!==JSON.stringify(data))throw new Error('The uploaded copy could not be verified. Local work is still marked unsynced.');
 return {records,savedId:saved.id,syncedIds:records.map(r=>r.id),at:new Date().toISOString()};
}
