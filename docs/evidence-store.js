let opening;
async function database(){
 if(!opening)opening=new Promise((resolve,reject)=>{
  const req=indexedDB.open('family-learning-student-evidence',1);
  req.onupgradeneeded=()=>{
   const store=req.result.createObjectStore('items',{keyPath:'id'});store.createIndex('student',['family','childId']);
   req.result.createObjectStore('drafts');
  };
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>{opening=null;reject(req.error);};
 });
 return opening;
}
async function transaction(stores,mode,run){
 const db=await database();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(stores,mode);const req=run(tx);
  tx.oncomplete=()=>resolve(req?.result);
  tx.onabort=tx.onerror=()=>reject(tx.error || Error('Device storage did not save this scan.'));
 });
}
export const readDraft=(family,child)=>transaction('drafts','readonly',tx=>tx.objectStore('drafts').get([family,child]));
export const writeDraft=(family,child,draft)=>transaction('drafts','readwrite',tx=>tx.objectStore('drafts').put(draft,[family,child]));
export const listEvidence=(family,child)=>transaction('items','readonly',tx=>tx.objectStore('items').index('student').getAll([family,child]));
export const putEvidence=item=>transaction('items','readwrite',tx=>tx.objectStore('items').put(item));
export const finalizeScan=item=>transaction(['items','drafts'],'readwrite',tx=>{
 tx.objectStore('items').add(item);tx.objectStore('drafts').delete([item.family,item.childId]);
});

export function claimDestination(item,account,id){
 let selected;
 return transaction('items','readwrite',tx=>{
  const store=tx.objectStore('items'),req=store.get(item.id);
  req.onsuccess=()=>{
   const current=req.result;
   if(!current || current.family!==item.family || current.childId!==item.childId || current.account && current.account!==account){tx.abort();return;}
   selected=current.driveId?current:{...current,account,driveId:id};
   if(!current.driveId)store.put(selected);
  };
 }).then(()=>selected);
}
