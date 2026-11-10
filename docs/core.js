import {GRADES} from './students.js';
import {validateLearningRecord} from './learning-core.js';
export const SCHEMA=1;
export const VERSION='0.8.0';
export const uid=()=>{if(crypto.randomUUID)return crypto.randomUUID();const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=[...b].map(v=>v.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};
let lastRecordTime=0;
export function record(kind,data){lastRecordTime=Math.max(Date.now(),lastRecordTime+1);return {id:uid(),kind,createdAt:new Date(lastRecordTime).toISOString(),...data};}
export function envelope(workspaceId,records,deviceId,settings){return {app:'family-learning',schema:SCHEMA,workspaceId,deviceId,exportedAt:new Date().toISOString(),records,...(settings?{settings:{thresholdMB:settings.thresholdMB,thresholdHours:settings.thresholdHours,masteryTarget:settings.masteryTarget??80}}:{})};}
export function validateBackup(data){
 if(!data||data.app!=='family-learning'||data.schema!==SCHEMA||(typeof data.workspaceId!=='string'||!data.workspaceId)||!Array.isArray(data.records))throw new Error('This is not a supported Family Learning backup.');
 if(data.records.length>50000)throw new Error('This backup is too large for this version.');
 if(data.books !== undefined){
  const seen=new Set();
  if(!Array.isArray(data.books)||data.books.length>5000)throw new Error('Invalid book inventory in backup.');
  for(const b of data.books){
   if(!b||typeof b.id!=='string'||!/^[a-z0-9-]+$/.test(b.id)||seen.has(b.id)||
     typeof b.fileId!=='string'||!/^[A-Za-z0-9_-]+$/.test(b.fileId)||!(/^[a-f0-9]{64}$/).test(b.sha256)||
     typeof b.title!=='string'||!Number.isFinite(Date.parse(b.revision))||
     (b.grade && !GRADES.includes(b.grade)))throw new Error('Invalid book entry in backup.');
   seen.add(b.id);
  }
 }
 if(data.settings){for(const [key,min,max] of [['thresholdMB',1,500],['thresholdHours',1,720],['masteryTarget',1,100]])if(!Number.isFinite(data.settings[key])||data.settings[key]<min||data.settings[key]>max)throw new Error('Backup settings are invalid.');data.settings={thresholdMB:data.settings.thresholdMB,thresholdHours:data.settings.thresholdHours,masteryTarget:data.settings.masteryTarget};}
 const ids=new Set();for(const r of data.records){if(!r||typeof r.id!=='string'||ids.has(r.id)||!['profile','course','assignment','submission','lesson_stop','chapter_result','material_profile'].includes(r.kind)||!Number.isFinite(Date.parse(r.createdAt)))throw new Error('This backup contains invalid or duplicate records.');ids.add(r.id);
 if(['lesson_stop','chapter_result'].includes(r.kind))validateLearningRecord(r);
 if(r.kind==='material_profile'&&(typeof r.materialId!=='string'||!r.materialId||!GRADES.includes(r.grade)))throw new Error('A material grade is invalid.');
 if(r.kind==='profile'&&(r.active!==undefined&&typeof r.active!=='boolean'||r.grade!==undefined&&!GRADES.includes(r.grade)))throw new Error('A student setting is invalid.');
 if(r.kind==='profile'&&(!r.childId||typeof r.name!=='string'))throw new Error('A learner profile is incomplete.');
 if(r.kind==='course'&&['title','subject','level','student','teacher','practice','answers','sources'].some(k=>typeof r[k]!=='string'))throw new Error('A teaching resource is incomplete.');
 if(r.kind==='assignment'&&(!r.childId||!r.courseId||typeof r.goal!=='string'))throw new Error('An assignment is incomplete.');
 if(r.kind==='submission'&&r.score!==undefined&&r.score!==''){if(!Number.isFinite(Number(r.score))||!Number.isFinite(Number(r.possible))||Number(r.score)<0||Number(r.possible)<=0||Number(r.score)>Number(r.possible))throw new Error('A saved score is invalid.');}
 if(r.kind==='submission'&&(!r.assignmentId||typeof r.work!=='string'||(r.photo&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(r.photo))))throw new Error('A work record is invalid.');
 }
 const courses=new Set(data.records.filter(r=>r.kind==='course').map(r=>r.id)),children=new Set(data.records.filter(r=>r.kind==='profile').map(r=>r.childId)),assignments=new Set(data.records.filter(r=>r.kind==='assignment').map(r=>r.id));
 for(const r of data.records){if(r.kind==='chapter_result'&&!children.has(r.childId))throw new Error('A result is missing its learner.');if(r.kind==='lesson_stop'&&r.childIds.some(id=>!children.has(id)))throw new Error('A lesson is missing its learner.');if(r.kind==='assignment'&&(!courses.has(r.courseId)||!children.has(r.childId)))throw new Error('An assignment is missing its learner or material.');if(r.kind==='submission'&&!assignments.has(r.assignmentId))throw new Error('Work is missing its assignment.');}
 return data;
}
export function mergeRecords(local,remote){const map=new Map(local.map(r=>[r.id,r]));for(const r of remote){const old=map.get(r.id);if(old&&stableJSON(old)!==stableJSON(r))throw new Error('Two different records have the same identity. Both backups have been kept; nothing was overwritten.');map.set(r.id,r);}return [...map.values()].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));}
export function pendingRecords(records,syncedIds){const saved=new Set(syncedIds||[]);return records.filter(r=>!r.seed&&!saved.has(r.id));}
export function pendingBytes(records,syncedIds){return new TextEncoder().encode(JSON.stringify(pendingRecords(records,syncedIds))).length;}
export function reminderDue(records,syncedIds,settings,now=Date.now()){const pending=pendingRecords(records,syncedIds);if(!pending.length||now<(settings.snoozeUntil||0))return false;return pendingBytes(records,syncedIds)>=settings.thresholdMB*1024*1024||now-Math.min(...pending.map(r=>Date.parse(r.createdAt)))>=settings.thresholdHours*3600000;}
export function latestProfiles(records){const map=new Map();for(const r of [...records].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)))if(r.kind==='profile')map.set(r.childId,r);return [...map.values()];}
export function seedRecords(){const common={createdAt:'2026-01-01T00:00:00.000Z',seed:true};return [
 {id:'seed-profile-older',kind:'profile',childId:'older',name:'Older child',level:'Set learning level',...common},
 {id:'seed-profile-younger',kind:'profile',childId:'younger',name:'Younger child',level:'Set learning level',...common},
 {id:'seed-making-ten',kind:'course',title:'Numbers around us',subject:'Mathematics',level:'Early primary · sample',student:'Making ten\n\nPut 6 counters on a table. Add 4 more. Count them together: 6 + 4 = 10.\n\nYou can split ten in different ways. Five and five make ten. Seven and three make ten. The total stays the same.\n\nTry this: put out 8 counters. How many more will make ten?',teacher:'Learning goal: Find two groups that make a total of ten.\n\nPrepare: 10 counters, paper, and a pencil.\n\n1. Check that the child can count ten objects accurately.\n2. Model six counters and four counters. Count the total.\n3. Make seven and three together.\n4. Ask the child to make another pair and explain it.\n\nSupport: Keep counters visible and count together.\nExtension: Ask for every pair that makes ten.\n\nRecord whether the child worked independently or with help.',practice:'1. Complete: 8 + __ = 10.\n2. Complete: 5 + __ = 10.\n3. Show another pair that makes ten. Explain how you know.',answers:'1. 2\n2. 5\n3. Any valid nonnegative pair totalling ten, with a matching explanation.\n\nUse the explanation and observed support to judge understanding; a score alone is not mastery.',sources:'Original illustrative lesson prepared for Family Learning. Review its suitability before assigning it. No curriculum alignment claimed.',...common},
 {id:'seed-nature',kind:'course',title:'A closer look at leaves',subject:'Nature study',level:'Family activity · sample',student:'Go outside with a parent and find two fallen leaves.\n\nLook carefully. What colours and shapes can you see? Gently feel each leaf. Draw what you notice.\n\nTell someone one way the leaves are alike and one way they are different.',teacher:'Learning goal: Observe and describe similarities and differences.\n\nPrepare: Two safe fallen leaves, paper, and coloured pencils.\n\nAsk the child to describe before you offer words. Younger children may talk or point; older children may label a drawing and write sentences.\n\nWash hands afterwards. Avoid unknown or irritating plants.',practice:'Draw the two leaves.\nDescribe one similarity.\nDescribe one difference.',answers:'Answers vary. Look for observations supported by the actual leaves. Accept an oral response, drawing, or written description appropriate to the learner.',sources:'Original illustrative family activity. Parent supervision required.',...common}
 ];}

export function stableJSON(value){if(Array.isArray(value))return '['+value.map(stableJSON).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stableJSON(value[k])).join(',')+'}';return JSON.stringify(value);}

