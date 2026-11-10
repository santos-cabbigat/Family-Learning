// The transfer belongs to the running app. Screens can subscribe at any point.
export const downloadEvents=new EventTarget();
export const downloadJob={running:false,label:'',done:undefined,total:undefined};
export function reportDownload(label,done,total,installed){
 Object.assign(downloadJob,{label,done,total});
 const event=new Event('change');event.installed=installed;downloadEvents.dispatchEvent(event);
}
export async function startDownloads(work){
 if(downloadJob.running)return;
 downloadJob.running=true;reportDownload('Preparing downloads…');
 try{const result=await work();downloadJob.running=false;reportDownload(result);}
 catch(error){downloadJob.running=false;reportDownload(error.message || 'Download interrupted. Retry the remaining books.');}
}
