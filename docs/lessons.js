import {rowLink,screenMenu} from './screens.js';
import {GRADES,activeStudents,materialGrade} from './students.js';
import { record, latestProfiles } from './core.js';
import { SUBJECTS, latestStop, chapterProgress } from './learning-core.js';
import { getPack, listPacks, importPack } from './lesson-store.js';
import {mountDownloads,rememberDownloadLink} from './package-catalog.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const button = (id, label, primary = false) => '<button class="btn' + (primary ? ' primary' : '') + '" id="' + id + '">' + label + '</button>';
const date = value => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export function createLessons({ main, getState, mutate, toast, dialog, closeDialog, onError }) {
  let controller;
  let activePack;
  let pictureUrl;
  let routeVersion = 0;
  const query = selector => main.querySelector(selector);
  const people = () => activeStudents(getState().records);
  let gradeFilter='All grades';
  try {
    const saved = localStorage.getItem('family-learning-subject-grade');
    if ([...GRADES,'Unassigned'].includes(saved)) gradeFilter = saved;
  } catch {}
  function selectGrade(value) {
    gradeFilter = value;
    try { localStorage.setItem('family-learning-subject-grade', value); } catch {}
  }
  const grades=()=>['All grades',...GRADES,'Unassigned'];
  const gradeControl=()=>'<label class="chapter-search">Grade level<select id="grade-filter">'+grades().map(g=>'<option'+(g===gradeFilter?' selected':'')+'>'+g+'</option>').join('')+'</select></label>';
  const matchesGrade=p=>gradeFilter==='All grades'||materialGrade(getState().records,p)===gradeFilter;
  const target = () => getState().settings.masteryTarget ?? 80;

  function reset() {
    controller?.abort();
    controller = new AbortController();
    if (pictureUrl) URL.revokeObjectURL(pictureUrl);
    pictureUrl = null;
    document.body.classList.remove('lesson-presentation');
    routeVersion++;
    return routeVersion;
  }
  function listen(element, type, handler) {
    element?.addEventListener(type, handler, { signal: controller.signal });
  }
  function title(text, subtitle) {
    return '<div class="page-heading"><div><h1>' + escape(text) + '</h1><p class="muted">' + escape(subtitle) + '</p></div></div>';
  }
  function loading() { main.innerHTML = '<p role="status">Opening the lesson collection…</p>'; }
  function result(childId, materialId, chapterId) {
    return chapterProgress(getState().records, childId, materialId, chapterId, target());
  }
  function installPanel() {
    return '<p class="empty">Get this lesson pack in Settings → Downloads.</p>';
  }
  function materialPanel(packs, name, selectedId, refresh) {
    const panel = main.querySelector('.subject-materials');
    mountDownloads(panel, {grade:gradeFilter, subject:name, records:getState().records, installed:packs, selectedId, refresh})
      .catch(error => { if (panel.isConnected) panel.textContent = 'Could not open materials. ' + error.message; });
  }
  let downloadSubject = '';
  async function downloads(selectedId) {
    const linked=rememberDownloadLink(location.hash);
    if(linked) {
      downloadSubject=linked.subject; selectGrade('All grades'); selectedId=linked.id;
      history.replaceState(history.state,'','#downloads');
    }
    const version = reset();
    loading();
    const packs = await listPacks();
    if (version !== routeVersion) return;
    main.innerHTML = title('Downloads','Choose a subject and a material to save on this device.') +
      '<div class="download-filters">' + gradeControl() +
      '<label>Subject<select id="download-subject"><option value="">All subjects</option>' +
      SUBJECTS.map(name => '<option' + (downloadSubject === name ? ' selected' : '') + '>' + escape(name) + '</option>').join('') +
      '</select></label></div><section class="card stack subject-materials" aria-label="Available materials"></section>';
    listen(query('#grade-filter'),'change',event => { selectGrade(event.target.value); downloads(); });
    listen(query('#download-subject'),'change',event => { downloadSubject=event.target.value; downloads(); });
    materialPanel(packs, downloadSubject || undefined, selectedId, downloads);
  }
  async function subjects() {
    const version = reset();
    loading();
    const packs = await listPacks();
    if (version !== routeVersion) return;
    main.innerHTML = title('Subjects','') + gradeControl() + '<div class="screen-menu">' +
      SUBJECTS.map(name => {
        const count = packs.filter(p => p.subject === name && matchesGrade(p)).length;
        return rowLink('#subject/'+encodeURIComponent(name),name,count+' ready on this device');
      }).join('') + '</div>';
    listen(query('#grade-filter'),'change',event => { selectGrade(event.target.value); subjects(); });
  }
  async function subject(name) {
    const version = reset();
    loading();
    const packs = await listPacks();
    if (version !== routeVersion) return;
    const matching = packs.filter(p => p.subject === name && matchesGrade(p));
    const aliases = {Mathematics:'Math','Reading comprehension':'Reading Comprehension',Phonetics:'Phonics','Nature study':'Science'};
    const resources = getState().records.filter(r => r.kind === 'course' &&
      (aliases[r.subject] || r.subject).toLowerCase() === name?.toLowerCase() &&
      (gradeFilter === 'All grades' || (r.grade || 'Unassigned') === gradeFilter));
    main.innerHTML = title(name,'')+gradeControl() + '<div class="screen-menu">' +
      matching.map(p => rowLink('#level/'+encodeURIComponent(p.id),p.title,'Ready on this device · '+p.chapters.length+' chapters')).join('') +
      resources.map(r => rowLink('#book/'+encodeURIComponent(r.id),r.title,'Teaching material')).join('')+
      (!matching.length && !resources.length ? '<p class="empty">Get a lesson pack in Settings → Downloads. It will appear here once saved.</p>' : '')+'</div>';
    listen(query('#grade-filter'),'change',event => { selectGrade(event.target.value); subject(name); });
  }
  async function level(id) {
    const version = reset();
    loading();
    const loaded = await getPack(id);
    if (version !== routeVersion) return;
    activePack = loaded;
    if (!activePack) {
      main.innerHTML = title('Lesson pack needed', 'Import this material before opening its cards.') + installPanel();

      return;
    }
    const m = activePack.manifest;
    const stop = latestStop(getState().records, id);
    const savedChapter = m.chapters.find(c => c.id === stop?.chapterId);
    const savedCard = savedChapter?.cards.find(c => c.id === stop?.cardId);
    const resume = savedCard ? '#lesson/' + id + '/' + savedChapter.id + '/' + savedCard.id :
      '#lesson/' + id + '/' + m.chapters[0].id;
    main.innerHTML = title(m.title, m.level + ' · ' + materialGrade(getState().records,m)) +
      '<div class="screen-menu">'+rowLink(resume,savedCard?'Continue lesson':'Start lesson',savedChapter?.title || m.chapters[0].title)+'</div>'+
      '<div id="level-options"><section id="chapter-screen" class="card stack"><h2>Choose a chapter</h2>'+
      '<label>Find a sound or page<input id="find-chapter" type="search"></label><label>Chapter<select id="chapter-list"></select></label>'+
      '<a class="btn primary" id="teach-chapter">Teach chapter</a></section>'+
      '<section id="material-options" class="card stack"><h2>Material options</h2><label>Grade<select id="material-grade"><option value="">Choose grade</option>'+
      GRADES.map(g=>'<option'+(materialGrade(getState().records,m)===g?' selected':'')+'>'+g+'</option>').join('')+
      '</select></label>'+button('save-material-grade','Save grade')+'</section></div>';
    const chapterSelect=query('#chapter-list'), teach=query('#teach-chapter');
    const selectChapter=()=>{teach.hidden=!chapterSelect.value;teach.href='#lesson/'+m.id+'/'+chapterSelect.value;};
    function filterChapters(term) {
      const page=Number(term);
      const matches=m.chapters.filter(ch=>!term || ch.title.toLowerCase().includes(term) || (page>=ch.startPage && page<=ch.endPage));
      chapterSelect.replaceChildren(...matches.map(ch=>new Option(ch.title+' · pp. '+ch.startPage+'–'+ch.endPage,ch.id)));
      if(!matches.length) chapterSelect.add(new Option('No matching chapters',''));
      selectChapter();
    }
    filterChapters('');
    listen(query('#find-chapter'),'input',event=>filterChapters(event.target.value.trim().toLowerCase()));
    listen(chapterSelect,'change',selectChapter);
    listen(query('#save-material-grade'),'click',async()=>{
      const grade=query('#material-grade').value;
      if(!GRADES.includes(grade))return toast('Choose a grade first.');
      try { await mutate(s=>s.records.push(record('material_profile',{materialId:id,grade}))); toast('Material grade saved.'); }
      catch(error){onError('Grade could not save',error.message);}
    });
    screenMenu(query('#level-options'),[{key:'chapters',label:'Choose chapter',node:query('#chapter-screen')},
      {key:'options',label:'Material options',node:query('#material-options')}]);
  }
  function openWorkbook(page) {
    const blob = activePack?.assets['workbook.pdf'];
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    window.open(url + '#page=' + page, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 600000);
  }
  async function player(materialId, chapterId, cardId) {
    const version = reset();
    loading();
    const loaded = activePack?.id === materialId ? activePack : await getPack(materialId);
    if (version !== routeVersion) return;
    activePack = loaded;
    if (!activePack) { await level(materialId); return; }
    const m = activePack.manifest;
    const chapter = m.chapters.find(c => c.id === chapterId);
    if (!chapter) { location.hash = '#level/' + materialId; return; }
    let index = Math.max(0, chapter.cards.findIndex(c => c.id === cardId));
    document.body.classList.add('lesson-presentation');
    main.innerHTML = '<section class="presentation" aria-label="Lesson presentation"><div class="presentation-toolbar">' +
      '<a class="btn" href="#level/' + materialId + '">← Chapters</a><div class="presentation-title"><strong>' +
      escape(chapter.title) + '</strong><small>'+escape(m.title)+'</small></div>' + button('teacher-guide', 'Teacher’s guide') +
      '</div><div class="card-reference"><span id="page-ref"></span><label>Card <select id="card-picker" aria-label="Choose lesson card">' +
      chapter.cards.map((c, i) => '<option value="' + i + '">' + (i + 1) + ' · p. ' + c.page + ' · ' + escape(c.label) + '</option>').join('') +
      '</select></label></div><div class="teaching-card" id="teaching-card" tabindex="0" aria-label="Teaching card"></div>' +
      '<div class="presentation-controls">' + button('previous-card', '← Previous') + '<span id="card-count" role="status" aria-live="polite"></span>' +
      button('next-card', 'Next →') + '</div><div class="presentation-save"><span id="saved-stop" class="muted"></span>' +
      '<div class="actions">' + button('present-fullscreen', 'Full screen') + button('end-lesson', 'End lesson here', true) +
      '</div></div></section>';
    function display() {
      const card = chapter.cards[index];
      if (pictureUrl) URL.revokeObjectURL(pictureUrl);
      pictureUrl = card.image ? URL.createObjectURL(activePack.assets[card.image]) : null;
      query('#teaching-card').innerHTML = pictureUrl ? '<img src="' + pictureUrl + '" alt="' +
        escape(card.label + ' from '+m.title+', workbook page ' + card.page) + '" draggable="false">' :
        '<div class="word-card">' + escape(card.text) + '</div>';
      query('#page-ref').textContent = 'Workbook page ' + card.page + ' · ' + card.label;
      query('#card-count').textContent = (index + 1) + ' of ' + chapter.cards.length;
      query('#card-picker').value = index;
      query('#previous-card').disabled = index === 0;
      query('#next-card').disabled = index === chapter.cards.length - 1;
      const saved = latestStop(getState().records, materialId);
      query('#saved-stop').textContent = saved?.cardId === card.id ? 'Saved stopping point · ' + date(saved.createdAt) : '';
      // This URL supports browsing back to a card. Only End lesson here writes a learning record.
      history.replaceState(history.state, '', '#lesson/' + materialId + '/' + chapter.id + '/' + card.id);
    }
    function step(amount) {
      index = Math.max(0, Math.min(chapter.cards.length - 1, index + amount));
      display();
    }
    display();
    listen(query('#previous-card'), 'click', () => step(-1));
    listen(query('#next-card'), 'click', () => step(1));
    listen(query('#card-picker'), 'change', e => { index = Number(e.target.value); display(); });
    listen(document, 'keydown', e => {
      if (document.querySelector('dialog[open]') || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    });
    let touch;
    listen(query('#teaching-card'), 'touchstart', e => {
      touch = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
    });
    listen(query('#teaching-card'), 'touchend', e => {
      if (!touch || !e.changedTouches[0]) return;
      const dx = e.changedTouches[0].clientX - touch.x, dy = e.changedTouches[0].clientY - touch.y;
      if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
      touch = null;
    });
    listen(query('#present-fullscreen'), 'click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
        else toast('The teaching view already fills the available screen. Rotate your iPad for a wider view.');
      } catch { toast('Full screen is unavailable in this browser.'); }
    });
    listen(query('#teacher-guide'), 'click', () => {
      const card = chapter.cards[index];
      dialog('<div class="guide-heading"><h2>Teacher’s guide</h2><button class="btn" data-close>Close</button></div><h3>' +
        escape(chapter.title) + '</h3><p class="muted">Workbook page ' + card.page + ' · Card ' + (index + 1) +
        '</p><p>' + escape(card.guide) + '</p><div class="note green">Give each child their own turn. Record a score such as 4 out of 5 based on the work you actually checked.</div>' +
        '<div class="actions lesson-secondary">' + button('show-workbook', 'Open workbook for printing') +
        button('chapter-score', 'Record chapter scores') + '</div><p class="muted lesson-secondary">Your workbook is included in this private pack. Keep materials within their permitted use.</p>');
      document.querySelector('#show-workbook').onclick = () => openWorkbook(card.pdfPage);
      document.querySelector('#chapter-score').onclick = () => endLesson(m, chapter, card, false, display);
    });
    listen(query('#end-lesson'), 'click', () => endLesson(m, chapter, chapter.cards[index], true, display));
  }
  function endLesson(material, chapter, card, saveStop, afterSave) {
    const last = chapter.cards.at(-1).id === card.id;
    dialog('<div class="guide-heading"><h2>' + (saveStop ? 'End lesson here' : 'Chapter scores') +
      '</h2><button class="btn" data-close>Cancel</button></div><p>' + escape(chapter.title) + ' · Workbook page ' +
      card.page + '</p><form id="lesson-results" class="stack">' + people().map((p, i) => {
        const previous = result(p.childId, material.id, chapter.id);
        return '<fieldset class="child-result"><legend>' + escape(p.name) + '</legend>' +
          '<label class="check-label"><input type="checkbox" name="attended-' + i + '" checked> Took part in this lesson</label>' +
          '<div class="form-grid"><label>Correct answers<input type="number" name="earned-' + i + '" min="0" step="1" inputmode="numeric"></label>' +
          '<label>Total questions<input type="number" name="total-' + i + '" min="1" step="1" inputmode="numeric"></label></div>' +
          '<p class="score-preview" id="score-preview-' + i + '">Score can be recorded later</p>' +
          '<label class="check-label"><input type="checkbox" name="complete-' + i + '"' +
          (previous.latest?.complete ? ' checked' : '') + '> Chapter activities completed</label>' +
          '<label>Notes (optional)<input name="notes-' + i + '" maxlength="1000" placeholder="For example, needs help with the middle sound"></label>' +
          (previous.latest ? '<small>Previous result · ' + previous.status + (previous.percentage !== null ? ' · ' + previous.percentage + '%' : '') + '</small>' : '') +
          '</fieldset>';
      }).join('') + '<p class="muted">' + (last ? 'You are on this chapter’s last card. ' : '') +
      'A completed chapter with a score of at least ' + target() + '% is marked mastered. Each child is assessed separately.</p>' +
      '<p id="result-error" class="form-error" role="alert"></p><button class="btn primary" type="submit">' +
      (saveStop ? 'Save stopping point and results' : 'Save chapter results') + '</button></form>');
    const form = document.querySelector('#lesson-results');
    const studentForms=Array.from(form.querySelectorAll('.child-result'));
    if(studentForms.length>1){
      const label=document.createElement('label'),select=document.createElement('select');
      label.textContent='Choose a student to score';label.append(select);form.prepend(label);
      people().forEach((p,i)=>select.add(new Option(p.name,i)));
      const showStudent=()=>studentForms.forEach((node,i)=>node.hidden=i!==select.selectedIndex);
      select.onchange=showStudent;showStudent();
      studentForms.forEach((node,i)=>node.addEventListener('invalid',()=>{select.selectedIndex=i;showStudent();},true));
    }
    form.oninput = () => {
      people().forEach((p, i) => {
        const earned = form.elements['earned-' + i].value, total = form.elements['total-' + i].value;
        document.querySelector('#score-preview-' + i).textContent = earned !== '' && Number(total) > 0 ?
          Math.round(Number(earned) / Number(total) * 100) + '%' : 'Score can be recorded later';
      });
    };
    form.onsubmit = async e => {
      e.preventDefault();
      const submit = e.submitter;
      submit.disabled = true;
      try {
        const records = [], childIds = [];
        for (const [i, p] of people().entries()) {
          if (!form.elements['attended-' + i].checked) continue;
          childIds.push(p.childId);
          const earnedText = form.elements['earned-' + i].value;
          const totalText = form.elements['total-' + i].value;
          if ((earnedText === '') !== (totalText === '')) throw new Error('Enter both score fields for ' + p.name + ', or leave both empty.');
          const earned = earnedText === '' ? null : Number(earnedText);
          const total = totalText === '' ? null : Number(totalText);
          if (total !== null && (!Number.isInteger(earned) || !Number.isInteger(total) || total <= 0 || earned < 0 || earned > total)) {
            throw new Error('Check the score for ' + p.name + '. Correct answers must be between zero and the total.');
          }
          const complete = form.elements['complete-' + i].checked;
          const notes = form.elements['notes-' + i].value.trim();
          const previous = result(p.childId, material.id, chapter.id).latest;
          // A bookmark-only save must preserve a previously recorded assessment.
          if (earned !== null || notes || !previous || complete !== Boolean(previous?.complete)) {
            records.push(record('chapter_result', {
              materialId: material.id, chapterId: chapter.id, childId: p.childId,
              earned: earned ?? previous?.earned ?? null, total: total ?? previous?.total ?? null, complete, notes: notes || previous?.notes || '', page: card.page
            }));
          }
        }
        if (!childIds.length) throw new Error('Select at least one child who took part.');
        if (!saveStop && !records.length) throw new Error('Enter a score, a note, or change the chapter completion checkbox.');
        if (saveStop) records.push(record('lesson_stop', {
          materialId: material.id, chapterId: chapter.id, cardId: card.id, page: card.page, childIds
        }));
        await mutate(s => { s.records.push(...records); });
        closeDialog();
        afterSave?.();
        toast('Saved on this device. Export a backup to keep a separate copy.');
      } catch (error) { document.querySelector('#result-error').textContent = error.message; }
      finally { submit.disabled = false; }
    };
  }
  async function progress(selectedChild) {
    const version = reset();
    loading();
    const packs = await listPacks();
    if (version !== routeVersion) return;
    const ps = people();
    if (!selectedChild) {
      main.innerHTML=title('Progress','Choose a student to see their results.')+'<div class="screen-menu">'+
        ps.map(p=>rowLink('#learning-progress/'+encodeURIComponent(p.childId),p.name,p.grade || p.level)).join('')+
        rowLink('#learners','Learning plans')+rowLink('#settings/students','Manage students')+'</div>';
      return;
    }
    const child=ps.find(p=>p.childId===selectedChild);
    if(!child){main.innerHTML=title('Student unavailable','')+rowLink('#learning-progress','Choose a student');return;}
    main.innerHTML=title(child.name,'Learning progress')+
      '<div id="progress-screens"><section id="progress-chapters" class="card stack"><h2>Chapter progress</h2>'+
      (packs.length?'<label>Material<select id="progress-material"></select></label><p id="progress-total"></p><label>Chapter<select id="progress-chapter"></select></label><div id="chapter-result"></div>':
      '<p>Get a lesson pack in Settings → Downloads to see chapter progress here.</p>')+'</section>'+
      '<section id="target-screen" class="card stack"><label>Mastery target (%)<input id="mastery-target" type="number" min="1" max="100" value="'+target()+'"></label>'+
      button('save-target','Save target')+'</section></div>';
    if (packs.length) {
      const materials=query('#progress-material'), chapters=query('#progress-chapter');
      materials.replaceChildren(...packs.map(m=>new Option(m.title,m.id)));
      function draw(changed) {
        const m=packs.find(p=>p.id===materials.value);
        if(changed)chapters.replaceChildren(...m.chapters.map(ch=>new Option(ch.title,ch.id)));
        const results=m.chapters.map(ch=>result(child.childId,m.id,ch.id));
        query('#progress-total').textContent=results.filter(r=>r.latest?.complete).length+' of '+m.chapters.length+' covered · '+results.filter(r=>r.mastered).length+' mastered';
        const i=chapters.selectedIndex, ch=m.chapters[i], r=results[i];
        query('#chapter-result').innerHTML='<p>'+escape(r.status)+(r.percentage!==null?' · '+r.percentage+'%':'')+'</p>'+
          rowLink('#lesson/'+m.id+'/'+ch.id,r.mastered?'Review chapter':'Open chapter')+
          (r.attempts.length?'<details><summary>Saved attempts ('+r.attempts.length+')</summary>'+r.attempts.slice().reverse().map(a=>'<p>'+date(a.createdAt)+' · '+(a.total?a.earned+'/'+a.total:'Score pending')+(a.notes?' · '+escape(a.notes):'')+'</p>').join('')+'</details>':'');
      }
      listen(materials,'change',()=>draw(true));listen(chapters,'change',()=>draw(false));draw(true);
    }
    listen(query('#save-target'),'click',async()=>{
      const value=Number(query('#mastery-target').value);
      if(!Number.isInteger(value)||value<1||value>100)return toast('Choose a whole percentage from 1 to 100.');
      try{await mutate(s=>{s.settings.masteryTarget=value;});await progress(selectedChild);toast('Mastery target saved.');}
      catch(error){onError('Target could not save',error.message);}
    });
    screenMenu(query('#progress-screens'),[{key:'results',label:'Chapter progress',node:query('#progress-chapters')},
      {key:'target',label:'Mastery target',node:query('#target-screen')}]);
  }
  return { reset, downloads, subjects, subject, level, player, progress };
}

