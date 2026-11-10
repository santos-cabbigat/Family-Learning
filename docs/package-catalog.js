import {readPackResponse} from './pack-transfer.js';
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
  panel.innerHTML = `<form class="stack material-search">
      <label>Search materials<input type="search" placeholder="e.g. Phonics" autocomplete="off"></label>
      <div><button class="btn" type="submit">Search online</button></div></form>
    <label>Collection<select class="material-collection"><option value="">All collections</option></select></label>
    <label>Available materials<select class="material-select"></select></label>
    <div><button class="btn primary material-action" type="button">Download</button></div>
    <progress class="download-progress" aria-label="Lesson pack download progress" max="100" hidden></progress>
    <section class="material-permission stack" hidden>
      <strong>Download from your Google account</strong>
      <p>Google asks for permission to see and download all your Drive files. Family Learning uses this permission to find and download the selected lesson pack. Choose the account that holds it.</p>
      <div><button class="btn primary material-allow" type="button">Allow and download</button></div>
    </section>
    <p class="material-status muted" role="status" aria-live="polite"></p>
    <div class="material-source muted" role="status"></div>
    <div><button class="btn material-connect" type="button" hidden>Show my Drive backups</button></div>
    <details><summary>Import a file already on this device</summary>
      <label>Lesson pack ZIP<input type="file" accept=".zip,application/zip,application/x-zip-compressed"></label></details>`;
  const get = rule => panel.querySelector(rule);
  const selector = get('.material-select'), action = get('.material-action');
  const collectionSelect = get('.material-collection');
  const search = get('input[type=search]'), form = get('form');
  const status = get('.material-status'), source = get('.material-source');
  const permission = get('.material-permission'), allow = get('.material-allow');
  const connect = get('.material-connect'), fileInput = get('input[type=file]');
  const progress = get('.download-progress');
  function reportBytes(received,total) {
    const mb = (received / 1048576).toFixed(1);
    if (total && received <= total) {
      const percent = Math.floor(received * 100 / total);
      progress.value = percent;
      status.textContent = 'Downloading · '+percent+'% ('+mb+' MB)';
    } else {
      progress.removeAttribute('value');
      status.textContent = 'Downloading · '+mb+' MB received';
    }
  }
  const local = new Set(installed.map(pack => pack.id));
  const materials = new Map();
  const shortcuts = privateLinks().map(item => ({...privateBooks.find(book=>book.id===item.id),...item}));
  let chosenId = selectedId;
  let pendingPrivate;
  let busy = false;
  let loading = false;
  let revision = 0;

  function include(item) {
    const alreadyInstalled = installed.includes(item);
    item = {...privateBooks.find(book=>book.id===item.id),...item};
    if (!validId(item.id) || retiredSamples.has(item.id) || materials.has(item.id)) return;
    if (local.has(item.id) && !alreadyInstalled) return;
    const assigned = materialGrade(records,item);
    const privatePack = item.driveId || item.file || item.filename;
    if (subject && item.subject !== subject && !(privatePack && !item.subject)) return;
    if (assigned === 'Unassigned' && GRADES.includes(grade) && item.grades && !item.grades.includes(grade)) return;
    if (grade !== 'All grades' && assigned !== grade && !(privatePack && assigned === 'Unassigned' && !local.has(item.id))) return;
    materials.set(item.id,{...item,grade:assigned,collection:item.collection || (item.id.startsWith('k5-') ? 'K5 Learning' : 'Other materials')});
  }
  function draw() {
    const query = search.value.trim().toLowerCase().replace(/phonetics?/g,'phonics');
    const selectedCollection=collectionSelect.value;
    collectionSelect.replaceChildren(new Option('All collections',''),...[...new Set([...materials.values()].map(item=>item.collection))].sort().map(name=>new Option(name,name)));
    if([...collectionSelect.options].some(o=>o.value===selectedCollection))collectionSelect.value=selectedCollection;
    collectionSelect.disabled=busy;
    selector.replaceChildren();
    for (const item of materials.values()) {
      if (collectionSelect.value && item.collection !== collectionSelect.value) continue;
      if (![item.title,item.subject,item.grade,item.description,item.collection].join(' ').toLowerCase().includes(query)) continue;
      const label = local.has(item.id) ? 'Ready on this device' : item.driveId ? 'My Drive backup' :
        item.file || item.filename ? 'Requires your private pack' : 'Available';
      selector.add(new Option([item.title,item.subject,item.grade === 'Unassigned' ? item.grades?.join(' / ') : item.grade,label].filter(Boolean).join(' · '),item.id));
    }
    if (Array.from(selector.options).some(option => option.value === chosenId)) selector.value = chosenId;
    const item = materials.get(selector.value);
    if (!item) selector.add(new Option(loading ? 'Searching…' : 'No matching materials',''));
    selector.disabled = busy || !item;
    action.hidden = !item || pendingPrivate?.id === item.id;
    action.disabled = busy;
    action.textContent = local.has(item?.id) ? 'Open material' : 'Download';
    permission.hidden = !pendingPrivate || pendingPrivate.id !== item?.id;
    allow.disabled = busy;
    connect.disabled = busy;
    fileInput.disabled = busy;
    search.disabled = busy;
    for (const filter of panel.parentElement?.querySelectorAll('.download-filters select') || []) filter.disabled = busy;
    form.querySelector('button').disabled = busy || loading;
  }
  function resetChoice() {
    pendingPrivate = undefined;
    status.textContent = '';
    draw();
  }
  collectionSelect.onchange=resetChoice;
  async function searchOnline() {
    const current = ++revision;
    loading = true;
    source.textContent = 'Searching the online catalog…';
    draw();
    const [catalog, backups] = await Promise.allSettled([publishedMaterials(),isConnected() ? availableLessonPacks() : []]);
    if (!panel.isConnected || current !== revision) return;
    materials.clear();
    installed.forEach(include);
    if (backups.status === 'fulfilled') {
      for (const file of backups.value) {
        const p = file.appProperties || {};
        const book=privateBooks.find(item=>item.id===p.material);
        include({...book,id:p.material,title:file.name.replace(/ - Lesson Pack\.zip$/i,''),grade:p.grade,
          subject:p.subject || book?.subject,driveId:file.id});
      }
    }
    if (catalog.status === 'fulfilled') catalog.value.forEach(include);
    [...shortcuts,...privateBooks].forEach(include);
    source.textContent = [catalog.status === 'rejected' && 'Online catalog unavailable. Tap Search online to retry.',
      backups.status === 'rejected' && 'Your Drive backups could not load. Reconnect and search again.'].filter(Boolean).join(' ');
    connect.hidden = isConnected() && backups.status === 'fulfilled';
    loading = false;
    draw();
  }
  async function install(read,item = {}) {
    if (busy) return;
    busy = true;
    draw();
    progress.removeAttribute('value');
    progress.hidden = false;
    status.textContent = 'Downloading '+(item.title || 'lesson pack')+'…';
    try {
      const blob = await read();
      if (!blob) return;
      const assigned = GRADES.includes(item.grade) ? item.grade : GRADES.includes(grade) ? grade : item.grades?.[0];
      progress.removeAttribute('value');
      status.textContent = 'Saving lessons on this device…';
      const pack = await importPack(blob,{id:item.id,subject:item.subject || subject,grade:assigned});
      if (panel.isConnected) await refresh(pack.id);
    } catch (error) {
      status.textContent = error.message || 'Download failed. Try again.';
    } finally { progress.hidden = true; busy = false; if (panel.isConnected) draw(); }
  }
  async function askForRead(item) {
    status.textContent = 'Preparing Google sign-in…';
    if (!await driveApi.prepareDrive()) throw new Error('Google Drive setup is missing in Settings.');
    pendingPrivate = item;
    status.textContent = '';
    return null;
  }
  action.onclick = () => {
    const item = materials.get(selector.value);
    if (!item || busy) return;
    if (local.has(item.id)) { location.hash = 'level/'+encodeURIComponent(item.id); return; }
    if (item.driveId) { install(() => downloadLessonPack(item.driveId,undefined,reportBytes),item); return; }
    if (item.file || item.filename) {
      install(async () => {
        if (isConnected()) {
          const blob = await driveApi.readPrivateMaterial(item,undefined,reportBytes);
          if (blob) return blob;
        }
        return askForRead(item);
      },item);
      return;
    }
    install(async () => {
      const response = await fetch(new URL(item.url,location.href),{credentials:'omit',signal:AbortSignal.timeout(600000)});
      if (!response.ok) throw new Error('This package could not be downloaded. Try Search online again.');
      return readPackResponse(response,reportBytes);
    },item);
  };
  allow.onclick = () => {
    const item = pendingPrivate;
    if (!item || busy) return;
    install(async () => {
      const readToken = await driveApi.authorizeMaterialRead();
      status.textContent = 'Finding '+item.title+' in your Drive…';
      const blob = await driveApi.readPrivateMaterial(item,readToken,reportBytes);
      if (!blob) throw new Error(item.title+' was not found in that Google account. Retry with the account that holds the prepared pack.');
      return blob;
    },item);
  };
  connect.onclick = async () => {
    if (busy) return;
    try {
      busy = true; draw();
      if (!window.google?.accounts?.oauth2 || !driveApi.configuredClientId()) {
        if (!await driveApi.prepareDrive()) throw new Error('Google Drive setup is missing in Settings.');
        status.textContent = 'Google is ready. Tap Show my Drive backups to sign in.';
        return;
      }
      await driveApi.connectDrive();
      status.textContent = '';
      await searchOnline();
    } catch (error) { status.textContent = error.message; }
    finally { busy = false; draw(); }
  };
  fileInput.onchange = () => {
    const file = fileInput.files[0]; fileInput.value = '';
    if (file) install(() => file);
  };
  form.onsubmit = event => { event.preventDefault(); if (!busy) { resetChoice(); searchOnline(); } };
  selector.onchange = () => { chosenId = selector.value; resetChoice(); };
  search.oninput = resetChoice;
  installed.forEach(include);
  [...shortcuts,...privateBooks].forEach(include);
  if (selectedId && local.has(selectedId)) status.textContent = 'Ready on this device. Find this material in Subjects → '+installed.find(p => p.id === selectedId).subject+'.';
  await searchOnline();
}
