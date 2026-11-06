export const GRADES=['Kindergarten','Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6','Other'];
export function currentProfiles(records){const map=new Map();for(const r of [...records].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)))if(r.kind==='profile')map.set(r.childId,r);return [...map.values()];}
export const activeStudents=records=>currentProfiles(records).filter(p=>p.active!==false);
// Existing child identities are kept on rename, archive and reactivation, preserving all scores.
export function rosterChanges(records,students,makeRecord,makeId){
 if(!Array.isArray(students)||students.length<1||students.length>100)throw new Error('Choose between 1 and 100 students.');
 const existing=currentProfiles(records),seen=new Set(),changes=[];
 for(const student of students){
  const name=student.name?.trim();if(!name||name.length>60)throw new Error('Enter a name of 1–60 characters for every student.');
  if(!GRADES.includes(student.grade))throw new Error('Choose a grade for every student.');
  const id=student.childId||makeId();if(seen.has(id))throw new Error('The same student was selected twice.');seen.add(id);
  const previous=existing.find(p=>p.childId===id);if(student.childId&&!previous)throw new Error('This student no longer exists. Reload Settings and try again.');
  if(!previous||previous.name!==name||previous.grade!==student.grade||previous.active===false)changes.push(makeRecord('profile',{childId:id,name,grade:student.grade,level:student.grade,active:true}));
 }
 for(const previous of existing)if(previous.active!==false&&!seen.has(previous.childId))changes.push(makeRecord('profile',{childId:previous.childId,name:previous.name,level:previous.level||'',grade:previous.grade||'Kindergarten',active:false}));
 return changes;
}
export function materialGrade(records,manifest){return records.filter(r=>r.kind==='material_profile'&&r.materialId===manifest.id).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)).at(-1)?.grade||manifest.grade||'Unassigned';}
