import {downloadJob,downloadEvents,startDownloads,reportDownload} from './download-job.js';
import {readPackResponse,transferDisplay} from './pack-transfer.js';
import {importPack,listPacks} from './lesson-store.js';
import {GRADES, materialGrade} from './students.js';
import {SUBJECTS} from './learning-core.js';
import * as driveApi from './drive.js';
const {isConnected, availableLessonPacks, downloadLessonPack} = driveApi;

function validPackageUrl(value) {
  try {
    const url = new URL(value, location.href);
    return url.protocol === 'https:' || (url.protocol === 'http:' && url.origin === location.origin);
  } catch { return false; }
}

const validId = value => typeof value === 'string' && /^[a-z0-9-]+$/.test(value);
// Personal shortcuts stay in this browser. ZIP data is requested only after a Download tap.
// Only descriptive metadata is public. Each licensed workbook stays in its owner's Drive.
const privateBooks = [
  {id:'k5-phonics-a', title:'Phonics A', subject:'Phonics', filename:'Phonics-A-Lesson-Pack.zip'},
  {id:'k5-phonics-b', title:'Phonics B', subject:'Phonics', filename:'Phonics-B-Lesson-Pack.zip', grades:['Grade 1','Grade 2']},
  {id:'k5-phonics-c', title:'Phonics C', subject:'Phonics', filename:'Phonics-C-Lesson-Pack.zip', grades:['Grade 2','Grade 3']},
  {id:'k5-numbers-and-counting-to-10', title:'Numbers and Counting to 10', subject:'Math', filename:'Numbers-And-Counting-To-10-Lesson-Pack.zip', grades:['Kindergarten']},
  {id:'k5-numbers-and-counting-to-100', title:'Numbers and Counting to 100', subject:'Math', filename:'Numbers-And-Counting-To-100-Lesson-Pack.zip', grades:['Kindergarten']},
  {id:'k5-addition-and-subtraction', title:'Addition and Subtraction', subject:'Math', filename:'Addition-And-Subtraction-Lesson-Pack.zip', grades:['Kindergarten']},
  {id:'k5-shapes-and-geometry', title:'Shapes and Geometry', subject:'Math', filename:'Shapes-And-Geometry-Lesson-Pack.zip', grades:['Kindergarten']},
  {id:'k5-measurement-time-and-money', title:'Measurement, Time and Money', subject:'Math', filename:'Measurement-Time-And-Money-Lesson-Pack.zip', grades:['Kindergarten']},
  {id:'k5-reading-comprehension-level-a', title:'Reading Comprehension Level A', subject:'Reading Comprehension', filename:'Reading-Comprehension-Level-A-Lesson-Pack.zip', grades:['Kindergarten']},
  {id:'k5-reading-comprehension-level-b', title:'Reading Comprehension Level B', subject:'Reading Comprehension', filename:'Reading-Comprehension-Level-B-Lesson-Pack.zip', grades:['Kindergarten']},
  {id:'k5-reading-comprehension-level-c', title:'Reading Comprehension Level C', subject:'Reading Comprehension', filename:'Reading-Comprehension-Level-C-Lesson-Pack.zip', grades:['Kindergarten']},
  {id:'k5-phonics-flashcards', title:'Phonics Flashcards', subject:'Phonics', filename:'Phonics-Flashcards-Lesson-Pack.zip'}
];
privateBooks.push(...[
  {
    "id": "nsr-volume-1",
    "title": "Volume 1 - The Natural World and Life",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "filename": "Natural-Science-Volume-1-Lesson-Pack.zip",
    "description": "Natural Science Ready - System 365. Secondary science lessons, printable assessments and per-lesson teaching plans."
  },
  {
    "id": "nsr-volume-2",
    "title": "Volume 2 - Matter and Materials",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "filename": "Natural-Science-Volume-2-Lesson-Pack.zip",
    "description": "Natural Science Ready - System 365. Secondary science lessons, printable assessments and per-lesson teaching plans."
  },
  {
    "id": "nsr-volume-3",
    "title": "Volume 3 - Energy, Forces and Motion",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "filename": "Natural-Science-Volume-3-Lesson-Pack.zip",
    "description": "Natural Science Ready - System 365. Secondary science lessons, printable assessments and per-lesson teaching plans."
  },
  {
    "id": "nsr-volume-4",
    "title": "Volume 4 - Living Systems and Organisms",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "filename": "Natural-Science-Volume-4-Lesson-Pack.zip",
    "description": "Natural Science Ready - System 365. Secondary science lessons, printable assessments and per-lesson teaching plans."
  },
  {
    "id": "nsr-volume-5",
    "title": "Volume 5 - Earth, Weather and Space",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "filename": "Natural-Science-Volume-5-Lesson-Pack.zip",
    "description": "Natural Science Ready - System 365. Secondary science lessons, printable assessments and per-lesson teaching plans."
  },
  {
    "id": "nsr-volume-6",
    "title": "Volume 6 - Ecosystems, Environment and Sustainability",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "filename": "Natural-Science-Volume-6-Lesson-Pack.zip",
    "description": "Natural Science Ready - System 365. Secondary science lessons, printable assessments and per-lesson teaching plans."
  },
  {
    "id": "nsr-bonus-1",
    "title": "Bonus 1 - Natural Science Misconception Rescue Kit",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "filename": "Natural-Science-Bonus-1-Lesson-Pack.zip",
    "description": "Natural Science Ready - System 365. Printable teacher support and assessment resources, with a guide for each resource."
  },
  {
    "id": "nsr-bonus-2",
    "title": "Bonus 2 - Natural Science Differentiation Toolkit",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "filename": "Natural-Science-Bonus-2-Lesson-Pack.zip",
    "description": "Natural Science Ready - System 365. Printable teacher support and assessment resources, with a guide for each resource."
  },
  {
    "id": "nsr-bonus-3",
    "title": "Bonus 3 - Natural Science Assessment Builder",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "filename": "Natural-Science-Bonus-3-Lesson-Pack.zip",
    "description": "Natural Science Ready - System 365. Printable teacher support and assessment resources, with a guide for each resource."
  },
  {
    "id": "nsr-bonus-4",
    "title": "Bonus 4 - Early Finisher and Science Challenge Vault",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "filename": "Natural-Science-Bonus-4-Lesson-Pack.zip",
    "description": "Natural Science Ready - System 365. Printable teacher support and assessment resources, with a guide for each resource."
  },
  {
    "id": "nsr-bonus-5",
    "title": "Bonus 5 - Student Progress and Intervention System",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "filename": "Natural-Science-Bonus-5-Lesson-Pack.zip",
    "description": "Natural Science Ready - System 365. Printable teacher support and assessment resources, with a guide for each resource."
  }
]);
privateBooks.forEach(book=>{book.collection=book.id.startsWith('nsr-') ? 'Natural Science Ready - System 365' : 'K5 Learning';});
privateBooks.push(...[
  {
    "id": "science-diagrams-human-body-health-1",
    "title": "Science Diagrams - Human Body and Health - Part 1",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "collection": "Science Diagrams (English)",
    "filename": "Science-Diagrams-Human-Body-Health-Part-1-Lesson-Pack.zip",
    "description": "Private science diagrams, per-lesson teaching plans, printable resources and parent accuracy notes."
  },
  {
    "id": "science-diagrams-human-body-health-2",
    "title": "Science Diagrams - Human Body and Health - Part 2",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "collection": "Science Diagrams (English)",
    "filename": "Science-Diagrams-Human-Body-Health-Part-2-Lesson-Pack.zip",
    "description": "Private science diagrams, per-lesson teaching plans, printable resources and parent accuracy notes."
  },
  {
    "id": "science-diagrams-human-body-health-3",
    "title": "Science Diagrams - Human Body and Health - Part 3",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "collection": "Science Diagrams (English)",
    "filename": "Science-Diagrams-Human-Body-Health-Part-3-Lesson-Pack.zip",
    "description": "Private science diagrams, per-lesson teaching plans, printable resources and parent accuracy notes."
  },
  {
    "id": "science-diagrams-cells-genetics-1",
    "title": "Science Diagrams - Cells and Genetics - Part 1",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "collection": "Science Diagrams (English)",
    "filename": "Science-Diagrams-Cells-Genetics-Part-1-Lesson-Pack.zip",
    "description": "Private science diagrams, per-lesson teaching plans, printable resources and parent accuracy notes."
  },
  {
    "id": "science-diagrams-cells-genetics-2",
    "title": "Science Diagrams - Cells and Genetics - Part 2",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "collection": "Science Diagrams (English)",
    "filename": "Science-Diagrams-Cells-Genetics-Part-2-Lesson-Pack.zip",
    "description": "Private science diagrams, per-lesson teaching plans, printable resources and parent accuracy notes."
  },
  {
    "id": "science-diagrams-cells-genetics-3",
    "title": "Science Diagrams - Cells and Genetics - Part 3",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "collection": "Science Diagrams (English)",
    "filename": "Science-Diagrams-Cells-Genetics-Part-3-Lesson-Pack.zip",
    "description": "Private science diagrams, per-lesson teaching plans, printable resources and parent accuracy notes."
  },
  {
    "id": "science-diagrams-plants-animals-life-1",
    "title": "Science Diagrams - Plants, Animals and Life - Part 1",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "collection": "Science Diagrams (English)",
    "filename": "Science-Diagrams-Plants-Animals-Life-Part-1-Lesson-Pack.zip",
    "description": "Private science diagrams, per-lesson teaching plans, printable resources and parent accuracy notes."
  },
  {
    "id": "science-diagrams-plants-animals-life-2",
    "title": "Science Diagrams - Plants, Animals and Life - Part 2",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "collection": "Science Diagrams (English)",
    "filename": "Science-Diagrams-Plants-Animals-Life-Part-2-Lesson-Pack.zip",
    "description": "Private science diagrams, per-lesson teaching plans, printable resources and parent accuracy notes."
  },
  {
    "id": "science-diagrams-plants-animals-life-3",
    "title": "Science Diagrams - Plants, Animals and Life - Part 3",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "collection": "Science Diagrams (English)",
    "filename": "Science-Diagrams-Plants-Animals-Life-Part-3-Lesson-Pack.zip",
    "description": "Private science diagrams, per-lesson teaching plans, printable resources and parent accuracy notes."
  },
  {
    "id": "science-diagrams-ecology-environment-1",
    "title": "Science Diagrams - Ecology and Environment - Part 1",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "collection": "Science Diagrams (English)",
    "filename": "Science-Diagrams-Ecology-Environment-Part-1-Lesson-Pack.zip",
    "description": "Private science diagrams, per-lesson teaching plans, printable resources and parent accuracy notes."
  },
  {
    "id": "science-diagrams-ecology-environment-2",
    "title": "Science Diagrams - Ecology and Environment - Part 2",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "collection": "Science Diagrams (English)",
    "filename": "Science-Diagrams-Ecology-Environment-Part-2-Lesson-Pack.zip",
    "description": "Private science diagrams, per-lesson teaching plans, printable resources and parent accuracy notes."
  },
  {
    "id": "science-diagrams-space-1",
    "title": "Science Diagrams - Space and Astronomy - Part 1",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "collection": "Science Diagrams (English)",
    "filename": "Science-Diagrams-Space-Part-1-Lesson-Pack.zip",
    "description": "Private science diagrams, per-lesson teaching plans, printable resources and parent accuracy notes."
  },
  {
    "id": "science-diagrams-space-2",
    "title": "Science Diagrams - Space and Astronomy - Part 2",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "collection": "Science Diagrams (English)",
    "filename": "Science-Diagrams-Space-Part-2-Lesson-Pack.zip",
    "description": "Private science diagrams, per-lesson teaching plans, printable resources and parent accuracy notes."
  },
  {
    "id": "science-diagrams-earth-rocks-1",
    "title": "Science Diagrams - Earth and Rocks - Part 1",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "collection": "Science Diagrams (English)",
    "filename": "Science-Diagrams-Earth-Rocks-Part-1-Lesson-Pack.zip",
    "description": "Private science diagrams, per-lesson teaching plans, printable resources and parent accuracy notes."
  },
  {
    "id": "science-diagrams-earth-rocks-2",
    "title": "Science Diagrams - Earth and Rocks - Part 2",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "collection": "Science Diagrams (English)",
    "filename": "Science-Diagrams-Earth-Rocks-Part-2-Lesson-Pack.zip",
    "description": "Private science diagrams, per-lesson teaching plans, printable resources and parent accuracy notes."
  },
  {
    "id": "science-diagrams-weather-water-climate-1",
    "title": "Science Diagrams - Weather, Water and Climate - Part 1",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "collection": "Science Diagrams (English)",
    "filename": "Science-Diagrams-Weather-Water-Climate-Part-1-Lesson-Pack.zip",
    "description": "Private science diagrams, per-lesson teaching plans, printable resources and parent accuracy notes."
  },
  {
    "id": "science-diagrams-weather-water-climate-2",
    "title": "Science Diagrams - Weather, Water and Climate - Part 2",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "collection": "Science Diagrams (English)",
    "filename": "Science-Diagrams-Weather-Water-Climate-Part-2-Lesson-Pack.zip",
    "description": "Private science diagrams, per-lesson teaching plans, printable resources and parent accuracy notes."
  },
  {
    "id": "science-diagrams-matter-chemistry-1",
    "title": "Science Diagrams - Matter and Chemistry - Part 1",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "collection": "Science Diagrams (English)",
    "filename": "Science-Diagrams-Matter-Chemistry-Part-1-Lesson-Pack.zip",
    "description": "Private science diagrams, per-lesson teaching plans, printable resources and parent accuracy notes."
  },
  {
    "id": "science-diagrams-matter-chemistry-2",
    "title": "Science Diagrams - Matter and Chemistry - Part 2",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "collection": "Science Diagrams (English)",
    "filename": "Science-Diagrams-Matter-Chemistry-Part-2-Lesson-Pack.zip",
    "description": "Private science diagrams, per-lesson teaching plans, printable resources and parent accuracy notes."
  },
  {
    "id": "science-diagrams-matter-chemistry-3",
    "title": "Science Diagrams - Matter and Chemistry - Part 3",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "collection": "Science Diagrams (English)",
    "filename": "Science-Diagrams-Matter-Chemistry-Part-3-Lesson-Pack.zip",
    "description": "Private science diagrams, per-lesson teaching plans, printable resources and parent accuracy notes."
  },
  {
    "id": "science-diagrams-forces-energy-1",
    "title": "Science Diagrams - Forces, Energy and Physics - Part 1",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "collection": "Science Diagrams (English)",
    "filename": "Science-Diagrams-Forces-Energy-Part-1-Lesson-Pack.zip",
    "description": "Private science diagrams, per-lesson teaching plans, printable resources and parent accuracy notes."
  },
  {
    "id": "science-diagrams-forces-energy-2",
    "title": "Science Diagrams - Forces, Energy and Physics - Part 2",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "collection": "Science Diagrams (English)",
    "filename": "Science-Diagrams-Forces-Energy-Part-2-Lesson-Pack.zip",
    "description": "Private science diagrams, per-lesson teaching plans, printable resources and parent accuracy notes."
  },
  {
    "id": "science-diagrams-forces-energy-3",
    "title": "Science Diagrams - Forces, Energy and Physics - Part 3",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "collection": "Science Diagrams (English)",
    "filename": "Science-Diagrams-Forces-Energy-Part-3-Lesson-Pack.zip",
    "description": "Private science diagrams, per-lesson teaching plans, printable resources and parent accuracy notes."
  },
  {
    "id": "science-diagrams-forces-energy-4",
    "title": "Science Diagrams - Forces, Energy and Physics - Part 4",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "collection": "Science Diagrams (English)",
    "filename": "Science-Diagrams-Forces-Energy-Part-4-Lesson-Pack.zip",
    "description": "Private science diagrams, per-lesson teaching plans, printable resources and parent accuracy notes."
  },
  {
    "id": "science-diagrams-bonus-1",
    "title": "Science Diagrams Bonus - Classroom Science Dynamics and Challenges",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "collection": "Science Diagrams (English)",
    "filename": "Science-Diagrams-Bonus-1-Lesson-Pack.zip",
    "description": "Private science diagrams, per-lesson teaching plans, printable resources and parent accuracy notes."
  },
  {
    "id": "science-diagrams-bonus-2",
    "title": "Science Diagrams Bonus - Printable Science Games and Activities",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "collection": "Science Diagrams (English)",
    "filename": "Science-Diagrams-Bonus-2-Lesson-Pack.zip",
    "description": "Private science diagrams, per-lesson teaching plans, printable resources and parent accuracy notes."
  },
  {
    "id": "science-diagrams-bonus-3",
    "title": "Science Diagrams Bonus - Science Assessments and Tests - Printable Classroom Assessment Pack",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "collection": "Science Diagrams (English)",
    "filename": "Science-Diagrams-Bonus-3-Lesson-Pack.zip",
    "description": "Private science diagrams, per-lesson teaching plans, printable resources and parent accuracy notes."
  },
  {
    "id": "science-diagrams-bonus-4",
    "title": "Science Diagrams Bonus - Science Quizzes and Trivia, Part 1 - Human Body, Earth and Space",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "collection": "Science Diagrams (English)",
    "filename": "Science-Diagrams-Bonus-4-Lesson-Pack.zip",
    "description": "Private science diagrams, per-lesson teaching plans, printable resources and parent accuracy notes."
  },
  {
    "id": "science-diagrams-bonus-5",
    "title": "Science Diagrams Bonus - Science Quizzes and Trivia, Part 2 - Quizzes 11 to 50",
    "subject": "Science",
    "grades": [
      "Other"
    ],
    "collection": "Science Diagrams (English)",
    "filename": "Science-Diagrams-Bonus-5-Lesson-Pack.zip",
    "description": "Private science diagrams, per-lesson teaching plans, printable resources and parent accuracy notes."
  }
]);
const retiredSamples = new Set(['family-making-ten','family-observing-leaves']);
const privateKey = 'family-learning-personal-pack-links';
function privateLinks() {
  try { return JSON.parse(localStorage.getItem(privateKey) || '[]').filter(validPrivate); }
  catch { return []; }
}
function validPrivate(item) {
  return item && validId(item.id) && typeof item.file === 'string' && /^[a-zA-Z0-9_-]{12,128}$/.test(item.file) &&
    SUBJECTS.includes(item.subject) && typeof item.title === 'string' && item.title.length > 0 && item.title.length <= 140;
}
export function rememberDownloadLink(hash) {
  if (!hash.startsWith('#downloads?')) return;
  const params = new URLSearchParams(hash.slice(hash.indexOf('?')+1));
  const item = {id:params.get('pack'), file:params.get('file'), title:params.get('name'), subject:params.get('subject')};
  if (!validPrivate(item)) return;
  const items = privateLinks().filter(existing => existing.id !== item.id);
  try { localStorage.setItem(privateKey,JSON.stringify([...items.slice(-49),item])); } catch { return; }
  return item;
}
async function publishedMaterials() {
  const response = await fetch('./catalog.json', {cache:'no-store', signal:AbortSignal.timeout(12000)});
  if (!response.ok) throw new Error('Catalog unavailable');
  const catalog = await response.json();
  if (catalog.version !== 1 || !Array.isArray(catalog.packages)) throw new Error('Invalid catalog');
  return catalog.packages.filter(item => item && validId(item.id) && GRADES.includes(item.grade) &&
    SUBJECTS.includes(item.subject) && typeof item.title === 'string' && typeof item.url === 'string' &&
    item.url.trim() && validPackageUrl(item.url));
}

export async function mountDownloads(panel, options) {
  // Previous service workers cached lessons.js but fetched this module from the network.
  if (typeof options === 'function') {
    const container = panel;
    const previousRefresh = options;
    const host = document.createElement('section');
    host.className = 'card stack subject-materials';
    container.append(host);
    async function show(selectedId) {
      const installed = await listPacks();
      if (!host.isConnected) return;
      const grade = container.querySelector('#grade-filter')?.value || 'All grades';
      await mountDownloads(host, {grade, installed, records:[], selectedId, refresh:async id => {
        await previousRefresh();
        if (host.isConnected) await show(id);
      }});
    }
    return show();
  }
  const {grade, subject, installed, records, refresh, selectedId} = options;
  const selection=options.selection || new Map();
  const local=new Map(installed.map(m=>[m.id,m]));
  const shortcuts=privateLinks().map(item=>({...privateBooks.find(b=>b.id===item.id),...item}));
  let materials=[], busy=false, loading=false;
  const opened=new Map();
  panel.innerHTML=`<form class="material-search"><label>Search materials<input type="search" placeholder="Book or topic"></label>
      <button class="btn" type="submit">Refresh catalog</button></form>
    <div class="download-filters"><label>Group by<select class="group-by"><option>Subject</option><option>Grade</option></select></label>
      <label>Collection<select class="material-collection"><option value="">All collections</option></select></label></div>
    <div class="material-groups stack"></div>
    <div class="batch-controls stack"><div class="actions"><button class="btn primary material-action">Download selected</button>
      <button class="btn material-clear">Clear selection</button></div>
      <progress class="download-progress" aria-label="Transfer progress" hidden></progress>
      <p class="material-status" role="status"></p></div>
    <p class="material-source muted"></p><div><button class="btn material-connect">Connect Google Drive</button></div>
    <p class="drive-consent muted">Connect the Google account that holds your books. Google asks to read Drive files and save app backups. Downloads stay in Family Learning on this device for offline teaching.</p>
    <details><summary>Import a file already on this device</summary><label>Lesson pack ZIP<input type="file" accept=".zip,application/zip"></label></details>`;
  const get=rule=>panel.querySelector(rule);
  const groupBy=get('.group-by'), collection=get('.material-collection'), groups=get('.material-groups');
  const action=get('.material-action'), clear=get('.material-clear'), status=get('.material-status');
  const bar=get('progress'), connect=get('.material-connect'), fileInput=get('input[type=file]'), search=get('input[type=search]');
  function entry(raw){
    const item={...privateBooks.find(b=>b.id===raw.id),...raw};
    item.grade=materialGrade(records,item);
    item.collection ||= item.id.startsWith('k5-')?'K5 Learning':'Other materials';
    return item;
  }
  function eligible(item){
    if(subject && item.subject && item.subject!==subject)return false;
    if(grade==='All grades' || item.grade===grade)return true;
    return item.grade==='Unassigned' && !local.has(item.id) && grade!=='Unassigned' &&
      (!item.grades?.length || item.grades.includes(grade));
  }
  function setSelected(item,checked){
    if(checked)selection.set(item.id,{...item,grade:GRADES.includes(grade)?grade:item.grade});
    else selection.delete(item.id);
  }
  function controls(){
    const locked=busy || downloadJob.running;
    action.disabled=locked || !selection.size;
    action.textContent='Download selected'+(selection.size?' ('+selection.size+')':'');
    clear.disabled=locked || !selection.size;connect.disabled=locked;
    connect.hidden=isConnected();get('.drive-consent').hidden=isConnected();
    for(const el of panel.querySelectorAll('input,select,.material-groups button'))el.disabled=locked;
    for(const el of panel.parentElement?.querySelectorAll('.download-filters select') || [])el.disabled=locked;
    get('form button').disabled=locked || loading;
  }
  function draw(){
    const query=search.value.toLowerCase().trim().replace(/phonetics?/g,'phonics');
    const buckets=new Map();
    for(const item of materials){
      if(!eligible(item) || collection.value && item.collection!==collection.value)continue;
      if(![item.title,item.collection,item.grade,item.subject,item.description].join(' ').toLowerCase().includes(query))continue;
      const names=groupBy.value==='Subject'?[item.subject || 'Other subjects']:
        item.grade==='Unassigned' && item.grades?.length?item.grades:[item.grade];
      for(const name of names){
        if(groupBy.value==='Grade' && grade!=='All grades' && name!==grade)continue;
        if(!buckets.has(name))buckets.set(name,[]);
        buckets.get(name).push(item);
      }
    }
    groups.replaceChildren();
    for(const [name,items] of buckets){
      const section=document.createElement('details'), summary=document.createElement('summary');
      section.className='material-group';section.open=opened.get(name) ?? (buckets.size===1 || items.some(i=>i.id===selectedId));
      section.ontoggle=()=>opened.set(name,section.open);
      summary.textContent=name+' ('+items.length+')';section.append(summary);
      const available=items.filter(i=>!local.has(i.id));
      if(available.length){
        const button=document.createElement('button');button.className='btn small';
        const checked=available.every(i=>selection.has(i.id));button.textContent=checked?'Clear this group':'Select this group';
        button.onclick=()=>{available.forEach(i=>setSelected(i,!checked));draw();};section.append(button);
      }
      for(const item of items){
        if(local.has(item.id)){
          const link=document.createElement('a');link.className='material-row';link.href='#level/'+encodeURIComponent(item.id);
          link.textContent=item.title+' · Open';section.append(link);continue;
        }
        const row=document.createElement('label'), box=document.createElement('input');row.className='material-row';
        box.type='checkbox';box.checked=selection.has(item.id);box.onchange=()=>{setSelected(item,box.checked);draw();groups.querySelector('[data-book="'+item.id+'"]')?.focus({preventScroll:true});};box.dataset.book=item.id;
        row.append(box,document.createTextNode(item.title));section.append(row);
      }
      groups.append(section);
    }
    if(!buckets.size)groups.textContent=loading?'Loading catalog…':'No matching materials.';
    controls();
  }
  function populate(rows){
    const merged=new Map();
    for(const raw of rows){
      if(validId(raw.id) && !retiredSamples.has(raw.id))merged.set(raw.id,entry({...merged.get(raw.id),...raw}));
    }
    materials=[...merged.values()];
    const previous=collection.value;
    collection.replaceChildren(new Option('All collections',''),...[...new Set(materials.map(i=>i.collection))].sort().map(n=>new Option(n,n)));
    collection.value=previous;draw();
  }
  async function searchOnline(){
    loading=true;controls();
    const [catalog,backups]=await Promise.allSettled([publishedMaterials(),isConnected()?availableLessonPacks():[]]);
    loading=false;if(!panel.isConnected)return;
    const copies=(backups.value || []).slice().reverse().map(f=>({id:f.appProperties?.material,title:f.name.replace(/ - Lesson Pack\.zip$/i,''),driveId:f.id,
      ...(f.appProperties?.grade?{grade:f.appProperties.grade}:{}),...(f.appProperties?.subject?{subject:f.appProperties.subject}:{})}));
    populate([...privateBooks,...(catalog.value || []),...shortcuts,...copies,...local.values()]);
    get('.material-source').textContent=[catalog.status==='rejected'?'Online catalog unavailable.':'',backups.status==='rejected'?'Drive backups could not load. Refresh the catalog to retry.':''].filter(Boolean).join(' ');
  }
  async function read(item,bytes){
    if(item.driveId)return downloadLessonPack(item.driveId,undefined,bytes);
    if(item.file || item.filename){
      const blob=await driveApi.readPrivateMaterial(item,undefined,bytes);
      if(!blob)throw new Error(driveApi.canReadSource()?'Could not find this pack in the connected Drive.':'Choose your Google account in Settings and grant read access to find purchased books.');
      return blob;
    }
    const response=await fetch(new URL(item.url,location.href),{credentials:'omit',signal:AbortSignal.timeout(600000)});
    if(!response.ok)throw new Error('Could not download this pack.');
    return readPackResponse(response,bytes);
  }
  async function connectAccount(){
    if(isConnected())return;
    if(!window.google?.accounts?.oauth2 || !driveApi.configuredClientId()){
      if(!await driveApi.prepareDrive())throw new Error('Google Drive setup is missing in Settings.');
      throw new Error('Google sign-in is ready. Tap again to choose your account.');
    }
    await driveApi.connectDrive();
  }
  function updateTransfer(event){
    if(!panel.isConnected){downloadEvents.removeEventListener('change',updateTransfer);return;}
    if(event?.installed){local.set(event.installed.id,event.installed);draw();}
    if(downloadJob.running)transferDisplay(bar,status,downloadJob.label,downloadJob.done,downloadJob.total);
    else if(downloadJob.label){bar.hidden=true;status.textContent=downloadJob.label;}
    controls();
  }
  downloadEvents.addEventListener('change',updateTransfer,{signal:options.signal});
  action.onclick=()=>{
    if(busy || downloadJob.running || !selection.size)return;
    const queue=[...selection.values()];
    startDownloads(async()=>{
      const failures=[];let saved=0;
      if(queue.some(i=>i.driveId || i.file || i.filename))await connectAccount();
      await driveApi.duringTransfer(async()=>{
        for(const [i,item] of queue.entries()){
          const label='Book '+(i+1)+' of '+queue.length+' · '+item.title;
          reportDownload(label);
          try{
            const blob=await read(item,(n,total)=>reportDownload(label,n,total));
            reportDownload('Saving '+item.title+' for offline use…');
            const assigned=GRADES.includes(item.grade)?item.grade:item.grades?.[0];
            const pack=await importPack(blob,{id:item.id,grade:assigned,subject:item.subject});
            selection.delete(item.id);saved++;reportDownload('Saved '+item.title,undefined,undefined,pack);
          }catch(error){
            failures.push(item.title+' — '+error.message);
            if(!navigator.onLine || error.status===401 || error.name==='QuotaExceededError')break;
          }
        }
      });
      return saved+' of '+queue.length+' books saved on this device.'+(failures.length?' '+failures.join(' · ')+' Remaining books stay selected for retry.':'');
    });
  };
  connect.onclick=async()=>{busy=true;controls();try{await connectAccount();await searchOnline();}catch(e){status.textContent=e.message;}finally{busy=false;draw();}};
  fileInput.onchange=async()=>{
    const file=fileInput.files[0];if(!file || busy)return;
    busy=true;controls();try{
      const pack=await importPack(file,{subject,grade:GRADES.includes(grade)?grade:undefined});selection.delete(pack.id);
      await refresh(pack.id);
    }catch(e){status.textContent=e.message;}finally{busy=false;fileInput.value='';draw();}
  };
  clear.onclick=()=>{selection.clear();draw();};
  groupBy.onchange=collection.onchange=search.oninput=draw;
  get('form').onsubmit=e=>{e.preventDefault();if(!busy && !loading)searchOnline();};
  populate([...privateBooks,...shortcuts,...installed]);
  if(selectedId && !local.has(selectedId)){
    const linked=materials.find(i=>i.id===selectedId);
    if(linked)setSelected(linked,true);
  }
  if(selectedId && local.has(selectedId))status.textContent='Saved on this device.';
  updateTransfer();
  await searchOnline();
}
