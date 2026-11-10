import test from 'node:test';
import assert from 'node:assert/strict';
import {seedRecords,envelope} from '../docs/core.js';
let count=0;
async function setup(handler){
 const values=new Map();globalThis.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 globalThis.window={google:{accounts:{oauth2:{hasGrantedAllScopes:()=>true,initTokenClient:({callback})=>({requestAccessToken:()=>callback({access_token:'test-only',expires_in:3600})})}}}};
 globalThis.fetch=async(url,options)=>String(url).includes('config.json')?Response.json({googleClientId:'12345-test.apps.googleusercontent.com'}):String(url).includes('/drive/v3/about?')?Response.json({user:{emailAddress:'family@example.org'}}):handler(String(url),options);
 const drive=await import(`../docs/drive.js?test=${++count}`);await drive.prepareDrive();await drive.connectDrive();return drive;
}
const state=()=>({workspaceId:'family',deviceId:'test-device',records:seedRecords(),settings:{thresholdMB:20,thresholdHours:24,masteryTarget:80}});
test('Drive verifies uploaded backup before returning synced IDs and paginates remote files',async()=>{
 let uploaded,pages=0;const remote=envelope('family',[...seedRecords(),{id:'remote-child',kind:'profile',childId:'older',name:'Remote revision',createdAt:'2026-11-06T01:00:00Z'}],'other');
 const drive=await setup(async(url,opts)=>{
 if(url.includes('/upload/')){const raw=await opts.body.text();uploaded=JSON.parse(raw.split('Content-Type: application/json\r\n\r\n')[1].split('\r\n--')[0]);return Response.json({id:'saved'});}
 if(url.includes('/saved?'))return Response.json(uploaded);
 if(url.includes('/remote?'))return Response.json(remote);
 if(url.includes('application%2Fvnd.google-apps.folder'))return Response.json({files:[{id:'folder',appProperties:{workspace:'family'}}]});
 pages++;return Response.json(pages===1?{files:[{id:'remote',appProperties:{workspace:'family'}}],nextPageToken:'next'}:{files:[]});
 });const result=await drive.syncDrive(state(),()=>{});assert.equal(pages,2);assert.ok(result.syncedIds.includes('remote-child'));assert.equal(uploaded.settings.masteryTarget,80);assert.equal(result.savedId,'saved');
});
test('failed upload does not return success and retry succeeds without altering local state',async()=>{
 let fail=true,uploaded;const local=state(),before=structuredClone(local);const drive=await setup(async(url,opts)=>{
 if(url.includes('/upload/')){if(fail)return Response.json({error:{message:'Storage quota exceeded'}},{status:403});const raw=await opts.body.text();uploaded=JSON.parse(raw.split('Content-Type: application/json\r\n\r\n')[1].split('\r\n--')[0]);return Response.json({id:'saved'});}
 if(url.includes('/saved?'))return Response.json(uploaded);
 return Response.json({files:url.includes('application%2Fvnd.google-apps.folder')?[{id:'folder',appProperties:{workspace:'family'}}]:[]});
 });await assert.rejects(drive.syncDrive(local,()=>{}),/Storage quota exceeded/);assert.deepEqual(local,before);fail=false;assert.equal((await drive.syncDrive(local,()=>{})).savedId,'saved');
});
test('expired authorization disconnects and leaves data pending',async()=>{const drive=await setup(()=>Response.json({error:{}},{status:401}));await assert.rejects(drive.syncDrive(state(),()=>{}),/expired/);assert.equal(drive.isConnected(),false);});
test('verification mismatch prevents claiming success',async()=>{const drive=await setup(async(url)=>{if(url.includes('/upload/'))return Response.json({id:'saved'});if(url.includes('/saved?'))return Response.json(envelope('different',seedRecords(),'d'));return Response.json({files:url.includes('application%2Fvnd.google-apps.folder')?[{id:'folder',appProperties:{workspace:'family'}}]:[]});});await assert.rejects(drive.syncDrive(state(),()=>{}),/mismatched|verified/);});
test('lesson packs upload separately from grades and verify server checksum',async()=>{
 const blob=new Blob(['pack-test-content'],{type:'application/zip'}),checksum=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join('');let payload;
 const drive=await setup(async(url,options)=>{if(url.includes('/upload/')){payload=await options.body.text();return Response.json({id:'pack-saved'});}if(url.includes('/pack-saved?'))return Response.json({sha256Checksum:checksum,size:String(blob.size)});if(url.includes('application%2Fvnd.google-apps.folder'))return Response.json({files:[{id:'materials-folder'}]});return Response.json({files:[]});});
 assert.equal(await drive.uploadLessonPack({id:'a',title:'Test Pack'},blob,()=>{}),'pack-saved');assert.ok(payload.includes('lesson-pack'));assert.ok(payload.includes('pack-test-content'));assert.equal(payload.includes('chapter_result'),false);
});
test('selective lesson download rejects oversized files and returns bytes for valid files',async()=>{let tooLarge=true;const drive=await setup(url=>url.includes('alt=media')?new Response(new Blob(['ZIP bytes'])):Response.json({size:tooLarge?101*1024*1024:9}));await assert.rejects(drive.downloadLessonPack('pack'),/100 MB/);tooLarge=false;assert.equal(await (await drive.downloadLessonPack('pack')).text(),'ZIP bytes');});

test('published Google configuration can be refreshed without reinstalling and invalidates a changed client session',async()=>{
 const drive=await setup(()=>{throw new Error('Connecting must not call Drive or upload records');});
 assert.equal(drive.isConnected(),true);
 let published='';globalThis.fetch=async url=>String(url).includes('/about?')?Response.json({user:{emailAddress:'family@example.org'}}):Response.json({googleClientId:published});
 assert.equal(await drive.prepareDrive(true),false);assert.equal(drive.isConnected(),false);
 published='67890-published.apps.googleusercontent.com';
 assert.equal(await drive.prepareDrive(true),true);assert.equal(drive.configuredClientId(),published);
 await drive.connectDrive();assert.equal(drive.isConnected(),true);
});
test('cancelled account switching clears the previous account session',async()=>{
 const drive=await setup(()=>{throw new Error('No Drive requests expected');});
 assert.equal(drive.isConnected(),true);
 window.google.accounts.oauth2.initTokenClient=({error_callback})=>({requestAccessToken:()=>error_callback({type:'popup_closed'})});
 await assert.rejects(drive.connectDrive(),/closed or blocked/);assert.equal(drive.isConnected(),false);
});

test('a verified legacy lesson backup gains its grade and subject without uploading the ZIP again', async () => {
  const zip = new Blob(['saved lesson pack']);
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await zip.arrayBuffer()))]
    .map(value => value.toString(16).padStart(2,'0')).join('');
  const prior = { app:'family-learning', type:'lesson-pack', material:'phonics-a', sha256:hash };
  const updates = [];
  const drive = await setup((url, options) => {
    if (options.method === 'PATCH') {
      updates.push(JSON.parse(options.body).appProperties);
      return Response.json({id:'existing'});
    }
    assert.ok(url.includes('pageSize='), 'Only the listing and metadata update are needed');
    return Response.json({files:[{id:'existing',appProperties:prior}]});
  });
  const id = await drive.uploadLessonPack({id:'phonics-a',title:'Phonics A',subject:'Phonics',grade:'Grade 1'},zip,()=>{});
  assert.equal(id,'existing');
  assert.deepEqual(updates,[{...prior,grade:'Grade 1',subject:'Phonics'}]);
});

test('a named personal Phonics ZIP can be found without prior app backup tags', async () => {
  const drive = await setup(url => {
    const parameters = new URL(url).searchParams;
    assert.equal(parameters.get('q'), "trashed = false and name = 'Phonics-A-Lesson-Pack.zip'");
    return Response.json({files:[{id:'accessible-private-file'}]});
  });
  assert.equal(await drive.findLessonZip('Phonics-A-Lesson-Pack.zip'), 'accessible-private-file');
  await assert.rejects(drive.findLessonZip("x' or trashed = true.zip"), /Invalid/);
});

test('one account connection handles source books and backups without another prompt',async()=>{
 const reads=[];
 const drive=await setup((url,opts)=>{
  reads.push(opts.headers.Authorization);
  if(new URL(url).searchParams.has('q'))return Response.json({files:[{id:'a-private-pack'}]});
  return url.includes('alt=media')?new Response('lesson bytes'):Response.json({size:12});
 });
 let prompts=0;
 window.google.accounts.oauth2.initTokenClient=opts=>{
  assert.match(opts.scope,/drive\.file/);assert.match(opts.scope,/drive\.readonly/);
  return {requestAccessToken:()=>{prompts++;opts.callback({access_token:'combined',expires_in:3600});}};
 };
 await drive.connectDrive();
 for(const name of ['A','B'])assert.equal(await (await drive.readPrivateMaterial({filename:name+'.zip'})).text(),'lesson bytes');
 await drive.availableBackups();assert.equal(prompts,1);assert.ok(reads.every(t=>t==='Bearer combined'));
});

test('declined consent leaves the device disconnected',async()=>{
 const drive=await setup(()=>assert.fail('No Drive requests expected'));
 window.google.accounts.oauth2.initTokenClient=opts=>({requestAccessToken:()=>opts.callback({error:'access_denied'})});
 await assert.rejects(drive.connectDrive(),/not granted/);assert.equal(drive.isConnected(),false);
});

test('a family snapshot restores missing books, skips matching offline copies, and rejects changed content',async()=>{
 const zip=new Blob(['private book bytes']);
 const {zipDigest}=await import('../docs/pack-transfer.js');
 let corrupted=false, media=0;
 const drive=await setup(url=>{
  if(url.includes('alt=media')){media++;return new Response(corrupted?'wrong book':zip);}
  return Response.json({size:zip.size});
 });
 const book={id:'book-a',fileId:'drive-file',title:'Book A',sha256:await zipDigest(zip),revision:'2026-11-10T00:00:00Z'};
 const installed=[],local=new Map();
 const library={list:async()=>installed,install:async(blob,expected)=>{assert.equal(expected.id,book.id);local.set(book.id,blob);installed.push({id:book.id,zipHash:await zipDigest(blob)});}};
 await drive.restoreBooks([book],library,()=>{});await drive.restoreBooks([book],library,()=>{});
 assert.equal(media,1);assert.equal(await local.get(book.id).text(),'private book bytes');
 installed.length=0;corrupted=true;
 await assert.rejects(drive.restoreBooks([book],library,()=>{}),/failed verification/);
 assert.equal(installed.length,0);
});

test('two devices sync their family’s records and book inventory with verified, reusable ZIP backups',async()=>{
 const files=new Map();let zipUploads=0;
 const {zipDigest}=await import('../docs/pack-transfer.js');
 const drive=await setup(async(url,opts)=>{
  const u=new URL(url), id=u.pathname.split('/').at(-1);
  if(u.pathname.startsWith('/upload/')){
   const raw=await opts.body.text(), parts=raw.split(/\r\n--family_learning_[^\r\n]+/);
   const meta=JSON.parse(parts[0].split('\r\n\r\n')[1]), body=parts[1].split('\r\n\r\n')[1];
   const file={...meta,id:'new-'+files.size,body,createdTime:'2026-11-10T12:00:00.000Z'};
   if(meta.mimeType==='application/zip'){zipUploads++;file.sha256Checksum=await zipDigest(new Blob([body]));}
   files.set(file.id,file);return Response.json({id:file.id,createdTime:file.createdTime});
  }
  if(opts.method==='POST'){
   const file={...JSON.parse(opts.body),id:'folder-'+files.size};files.set(file.id,file);return Response.json(file);
  }
  if(u.searchParams.has('q')){
   const q=u.searchParams.get('q');
   const rows=[...files.values()].filter(f=>
    (!q.includes('application/json')||f.mimeType==='application/json') &&
    (!q.includes('google-apps.folder')||f.mimeType.includes('folder')) &&
    (!q.includes("value='lesson-pack'")||f.appProperties.type==='lesson-pack') &&
    (!q.includes("value='materials-folder'")||f.appProperties.type==='materials-folder'));
   return Response.json({files:rows.map(({body,...meta})=>({...meta,size:body?.length}))});
  }
  const file=files.get(id);
  if(u.searchParams.has('alt'))return new Response(file.body);
  return Response.json({size:file.body.length,sha256Checksum:file.sha256Checksum});
 });
 function device(rows){
  const local=new Map(rows);
  return {list:async()=>[...local.keys()].map(id=>({id,title:id,subject:'Science',grade:'Other'})),
   read:async id=>local.get(id),install:async(blob,ref)=>local.set(ref.id,blob),local};
 }
 const a=device([['sky',new Blob(['stars'])],['sea',new Blob(['water'])]]), b=device([]);
 const original=state();original.records.push({kind:'profile',name:'Learner',id:'new-profile',childId:'learner',createdAt:'2026-11-10T11:00:00Z'});
 const progress=[];const first=await drive.syncDrive(original,(...args)=>progress.push(args),a);
 assert.equal(zipUploads,2);assert.ok(progress.some(([,n,total])=>n===0&&total>0));
 const snapshot=await drive.downloadBackup(first.savedId);assert.equal(snapshot.books.length,2);
 await drive.restoreBooks(snapshot.books,b,()=>{});assert.equal(await b.local.get('sky').text(),'stars');
 b.local.set('land',new Blob(['soil']));
 const later=await drive.syncDrive({...state(),deviceId:'tablet'},()=>{},b);
 assert.ok(later.records.some(r=>r.id==='new-profile'));assert.equal(zipUploads,3);
 await drive.syncDrive(original,()=>{},a);assert.equal(await a.local.get('land').text(),'soil');assert.equal(zipUploads,3);
});

test('reconnect reuses the last verified account hint; explicit switching opens the chooser',async()=>{
 const drive=await setup(()=>assert.fail('No book transfers expected'));
 const seen=[];
 window.google.accounts.oauth2.initTokenClient=opts=>({requestAccessToken:request=>{
   seen.push([opts.login_hint,request.prompt]);
   opts.callback({access_token:'renewed',expires_in:3600});
 }});
 await drive.connectDrive();await drive.connectDrive({chooseAccount:true});
 assert.deepEqual(seen,[['family@example.org',''],[undefined,'select_account']]);
 drive.disconnectDrive();assert.equal(drive.driveAccount(),'');
});

test('student folders stay separate by stable child ID, survive renaming and retry verified scan uploads',async()=>{
 const folders=[],copies=new Map();const {zipDigest}=await import('../docs/pack-transfer.js');
 const pdf=new Blob(['sample assessment PDF']);const hash=await zipDigest(pdf);let writes=0;
 const drive=await setup(async(url,opts)=>{
  const u=new URL(url),q=u.searchParams.get('q'),id=u.pathname.split('/').at(-1);
  if(q){
   let rows=[...folders,...copies.values()];
   for(const [,k,v] of q.matchAll(/key='(\w+)' and value='([^']+)'/g))rows=rows.filter(f=>f.appProperties?.[k]===v);
   return Response.json({files:rows});
  }
  if(u.pathname.includes('/upload/')){
   const raw=await opts.body.text(),m=JSON.parse(raw.split('\r\n\r\n')[1].split('\r\n--')[0]);
   writes++;copies.set(m.id,{...m,size:pdf.size,sha256Checksum:hash});
   return Response.json({id:m.id});
  }
  if(opts.method==='POST'){const meta=JSON.parse(opts.body),f={...meta,id:'folder-'+folders.length};folders.push(f);return Response.json(f);}
  if(opts.method==='PATCH'){Object.assign(folders.find(f=>f.id===id),JSON.parse(opts.body));return Response.json({id});}
  if(id==='generateIds')return Response.json({ids:['reserved-id']});
  return copies.has(id)?Response.json(copies.get(id)):Response.json({error:{message:'Missing'}},{status:404});
 });
 const first={childId:'a',name:'Sam'},second={childId:'b',name:'Sam'};
 const [one,two]=await drive.ensureStudentFolders('family',[first,second]);assert.notEqual(one.id,two.id);assert.deepEqual(one.parents,two.parents);
 first.name='Samuel';assert.equal((await drive.ensureStudentFolders('family',[first]))[0].id,one.id);assert.equal(folders.length,3);
 const item={id:'example',account:'family@example.org',driveId:await drive.reserveEvidenceId(),family:'family',pdf,filename:'Exam.pdf',category:'Examination',date:'2026-11-10'};
 await drive.uploadEvidence(item,first);await drive.uploadEvidence(item,first);assert.equal(writes,1);
 assert.deepEqual((await drive.studentEvidenceFiles('family','a')).map(f=>f.id),['reserved-id']);
 assert.deepEqual(await drive.studentEvidenceFiles('family','b'),[]);
 copies.get('reserved-id').sha256Checksum='bad';await assert.rejects(drive.uploadEvidence(item,first),/verify/);
});
