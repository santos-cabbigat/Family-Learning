import {importPack,listPacks} from './lesson-store.js';

const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const grades = ['Kindergarten','Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6'];
const subjects = ['Phonics','Math','Grammar','Writing','Reading Comprehension','Science'];
function check(entry) {
  return entry && /^[a-z0-9-]+$/.test(entry.id) &&
    grades.includes(entry.grade) && subjects.includes(entry.subject) &&
    typeof entry.title === 'string' && entry.title.length < 150 &&
    typeof entry.url === 'string' && /^https:\/\//.test(entry.url);
}
async function catalog() {
  const response = await fetch('./catalog.json', {cache:'no-store'});
  if (!response.ok) throw new Error('Download catalog unavailable');
  const data = await response.json();
  if (data.version !== 1 || !Array.isArray(data.packages)) throw new Error('Invalid catalog');
  return data.packages.filter(check);
}
export async function mountDownloads(container, refresh) {
  const element = document.createElement('section');
  element.className = 'card stack';
  element.setAttribute('aria-label','Download learning packages');
  container.append(element);
  element.innerHTML = '<h2>Download subjects by grade</h2><p class="muted">Choose a grade, then download only the subjects you need. Installed packages remain on this device for offline learning.</p><p role="status">Checking published subjects…</p>';
  try {
    const [items,installed] = await Promise.all([catalog(),listPacks()]);
    if (!element.isConnected) return;
    const installedIds = new Set(installed.map(p=>p.id));
    const availableGrades = [...new Set([...grades.slice(0,2),...items.map(p=>p.grade)])];
    element.innerHTML = '<h2>Download subjects by grade</h2><p class="muted">Only published materials can be downloaded. Each subject is installed separately and can be studied offline.</p><label>Grade <select id="package-grade">'+availableGrades.map(g=>'<option>'+safe(g)+'</option>').join('')+'</select></label><div id="published-packages"></div>';
    const selector=element.querySelector('#package-grade'), listing=element.querySelector('#published-packages');
    function draw(){
      const selected=items.filter(p=>p.grade===selector.value);
      listing.innerHTML=selected.length ? selected.map(p=>'<div class="settings-row"><span class="settings-label"><strong>'+safe(p.subject)+' — '+safe(p.title)+'</strong><small>'+safe(p.description||'Learning package')+'</small></span><button class="btn" data-package="'+safe(p.id)+'" '+(installedIds.has(p.id)?'disabled':'')+'>'+(installedIds.has(p.id)?'Installed':'Download')+'</button></div>').join('') : '<p class="muted">No public packages have been published for this grade yet. You can still import a Family Learning ZIP from your files.</p>';
    }
    selector.addEventListener('change',draw);
    draw();
    listing.addEventListener('click',async e=>{
      const button=e.target.closest('button[data-package]');if(!button)return;
      const item=items.find(p=>p.id===button.dataset.package);if(!item)return;
      const original=button.textContent;button.disabled=true;button.textContent='Downloading…';
      try {
        const url=new URL(item.url,location.href);
        if(url.origin!==location.origin){
          // Google Drive public share links often do not allow browser CORS downloads.
          // Let the parent save the ZIP with their browser, then use Open lesson pack.
          window.open(item.url,'_blank','noopener,noreferrer');
          button.textContent='Open lesson pack after saving';
          button.disabled=false;
          return;
        }
        const response=await fetch(url.href);
        if(!response.ok)throw new Error('Download unavailable');
        const blob=await response.blob();
        if(blob.size>100*1024*1024)throw new Error('Package is too large');
        const pack=await importPack(new File([blob],item.id+'.zip',{type:'application/zip'}));
        if(pack.id!==item.id)throw new Error('Package ID does not match the catalog');
        installedIds.add(item.id);draw();
        refresh?.();
      } catch(error) {
        button.disabled=false;button.textContent=original;
        alert('Could not install this package: '+error.message);
      }
    });
  } catch(error) {
    element.innerHTML='<h2>Download subjects by grade</h2><p role="alert">Could not check the package library. Your installed offline lessons are unchanged.</p>';
  }
}
