// Teaching plans supplement the licensed source; they never invent a publisher answer key.
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const unique = values => [...new Set(values.filter(Boolean))];
const items = value => Array.isArray(value) ? value.filter(x => typeof x === 'string') : [];

const approaches = {
  Phonics: {
    objectives:['Hear and say the target sound or spelling pattern.','Blend or segment the lesson examples and read unfamiliar examples using the same pattern.'],
    materials:['Letter cards, paper and pencil; a mirror for checking mouth position if helpful.'],
    recall:'Ask the learner to say a familiar sound and blend a previously learned word. Listen before offering a model.',
    model:'Say the target sound clearly without adding an extra “uh”. Point to each grapheme, blend the sounds, then read the whole word. Compare the target vowel with a familiar vowel when needed.',
    guided:'Take turns pointing, saying and blending the printed examples. Gradually remove your model; ask the learner to explain the spelling pattern.',
    practice:'Choose five examples from this lesson. Ask each child to read or segment them independently, then use one in a spoken sentence.',
    misconception:'A letter name is different from its sound. Distinguish short and long vowels by listening and comparing words; avoid guessing from the picture alone.',
    evidence:'Check five sounds or words individually. Award one point for each correct independent response; note sound confusions and whether a prompt was needed.',
    support:'Use two or three examples, large letter cards and oral responses. Repeat the same vowel contrast before adding more letters.',
    extension:'Ask the learner to build or write another word with the same sound pattern and explain the change.'
  },
  Math: {
    objectives:['Represent the lesson idea using objects, a drawing or a number sentence.','Solve the selected questions and explain or check the method.'],
    materials:['Counters or small safe objects, paper, pencils and the manipulatives shown in the lesson.'],
    recall:'Ask the learner to show a familiar number, shape or comparison related to this lesson. Check prerequisite vocabulary.',
    model:'Work through one printed example aloud using real objects first, then a drawing and the written notation. Explain what each symbol or comparison means.',
    guided:'Solve two examples together. Ask “How do you know?” and check by counting, comparing, measuring or reversing the operation as appropriate.',
    practice:'Select five questions on this topic. Give each child a separate turn or sheet, with no answers visible.',
    misconception:'Check one-to-one counting, the meaning of the operation or comparison, and consistent units. A correct guess does not demonstrate a method.',
    evidence:'Score the five selected questions using the included key where supplied. Record the score and a short note about the strategy independently demonstrated.',
    support:'Use a smaller number range, concrete objects and one step at a time. Read instructions aloud without giving the calculation.',
    extension:'Ask for a second method or a new problem with the same structure, and have the learner justify the result.'
  },
  'Reading Comprehension': {
    objectives:['Read or listen to the passage and explain its main events or idea.','Answer questions using a detail or sentence from the passage.'],
    materials:['The passage, its question sheet, paper and a pencil or highlighter.'],
    recall:'Discuss the title and one familiar word. Ask for a prediction and explain that it can change after reading.',
    model:'Read the first section naturally. Model pausing at punctuation and thinking aloud about a detail that supports an answer.',
    guided:'Read the remaining passage together or let the learner read. Revisit unfamiliar vocabulary and ask for a short retelling in order.',
    practice:'Let each learner answer the printed questions independently. Ask them to point to evidence instead of guessing from memory.',
    misconception:'Distinguish a prediction or opinion from information stated in the passage. For an inference, ask which clues support it.',
    evidence:'Use the provided answer key where available. Accept an equivalent response supported by the passage, and note any help with decoding separately from comprehension.',
    support:'Read aloud, explain essential vocabulary and allow oral answers. Ask one question at a time while keeping the passage visible.',
    extension:'Ask the learner to justify an inference, compare characters or create a new question with a supported answer.'
  },
  Science: {
    objectives:['Describe the lesson concept using accurate scientific vocabulary.','Use an observation, diagram or example to explain a scientific claim.'],
    materials:['The lesson diagram or worksheet, paper and pencil; only the safe materials specified in this lesson.'],
    recall:'Ask what the learner has noticed about the topic. Record an initial explanation without treating it as established fact.',
    model:'Explain the core concept with the source diagram. Separate what is observed from an explanation and model one evidence-based answer.',
    guided:'Discuss one diagram or example together. Ask what evidence supports the explanation and how another observation could test it.',
    practice:'Have each learner complete the selected worksheet prompts or record an observation independently.',
    misconception:'Avoid judging whether something is alive from movement alone, confusing a model with the real object, or treating correlation as proof of cause. Address only the misconception relevant to this lesson.',
    evidence:'Check an accurate explanation, a relevant example and supporting evidence. Record what the learner can explain independently and what needs reteaching.',
    support:'Use one concrete example, a labelled diagram and oral responses. For younger children use observation and vocabulary with adult support.',
    extension:'Ask for a prediction with a reason or an investigation that changes one factor while keeping others the same.'
  }
};
const general = {
  objectives:['Explain the lesson idea and demonstrate it in the selected activity.','Complete practice independently and explain an answer.'],
  materials:['The selected lesson, paper and pencil.'],recall:'Ask one question about the previous lesson.',
  model:'Demonstrate one example from the lesson and explain your choices.',guided:'Complete one example together, then reduce prompts.',
  practice:'Ask each learner to complete the selected practice independently.',misconception:'Use the learner’s actual response to identify a misunderstanding and model a corrected example.',
  evidence:'Check the selected work against the lesson instructions and supplied answer key.',support:'Break the activity into smaller steps and accept oral responses where appropriate.',extension:'Ask for a new example and an explanation.'
};

export function buildTeachingPlan(material, chapter, card) {
  const strategy = approaches[material.subject] || general;
  const provided = card.teacherPlan || chapter.teacherPlan || {};
  const samples = unique(chapter.cards.map(c => c.text || c.label)).slice(0,6);
  const assessment = card.assessment || chapter.assessment;
  return {
    title:card.lessonTitle || chapter.title,
    collection:material.title, subject:material.subject || 'Learning',
    category:chapter.category || material.category || '',
    page:card.page, duration:provided.duration || '25–35 minutes; shorten or extend for the learner',
    audience:provided.audience || material.level || 'Adapt to the learner’s current skill',
    objectives:items(provided.objectives).length ? items(provided.objectives) : strategy.objectives.map(s => s+' Focus: '+chapter.title+'.'),
    preparation:items(provided.preparation).length ? items(provided.preparation) : [
      'Read the selected lesson and its notes before class. Choose the examples and questions you will use.',
      'Prepare a student copy and keep answer keys out of the learner’s view.',
      'Check what each learner already knows and choose a smaller task if necessary.'
    ],
    materials:items(provided.materials).length ? items(provided.materials) : strategy.materials,
    vocabulary:items(provided.vocabulary),
    priorLearning:provided.priorLearning || strategy.recall,
    explanation:provided.explanation || '',
    steps:Array.isArray(provided.steps) && provided.steps.length ? provided.steps : [
      {title:'Recall and introduce · 3–5 minutes',text:strategy.recall},
      {title:'Model · 5 minutes',text:strategy.model},
      {title:'Guided practice · 7–10 minutes',text:strategy.guided},
      {title:'Independent practice · 5–10 minutes',text:strategy.practice},
      {title:'Review and exit check · 3–5 minutes',text:strategy.evidence}
    ],
    notes:card.guide,
    examples:samples,
    misconception:provided.misconception || strategy.misconception,
    support:provided.support || strategy.support,extension:provided.extension || strategy.extension,
    safety:provided.safety || (material.subject==='Science' ? 'Adult supervision is required. Do not taste unknown substances, collect unknown organisms, use mains electricity or look directly at the Sun. Use only safe, age-appropriate demonstrations.' : ''),
    assessment, marking:provided.marking || strategy.evidence,
    answer:card.answer || card.teacherHint || '',answerImage:card.answerImage,
    followUp:provided.followUp || 'At the next lesson, revisit one item that needed help. Move on when the learner can show the skill independently.',
    source:'Family Learning lesson plan, prepared to accompany your licensed material. Source: '+material.title+', '+chapter.title+', workbook page '+card.page+'.',
    reflection:'After class: What did each learner achieve? Which misconception or question needs reteaching? What will you change next time?'
  };
}
const list = values => '<ul>'+values.map(v=>'<li>'+escapeHtml(v)+'</li>').join('')+'</ul>';
const section = (title,content) => '<section><h3>'+escapeHtml(title)+'</h3>'+content+'</section>';
export function teachingPlanHtml(plan) {
  const e=escapeHtml;
  let html='<article class="teaching-plan"><h1>'+e(plan.title)+'</h1><p class="plan-meta">'+e([plan.collection,plan.category,'Workbook page '+plan.page].filter(Boolean).join(' · '))+'</p>'+
    '<p><strong>Suggested time:</strong> '+e(plan.duration)+'<br><strong>Learning level:</strong> '+e(plan.audience)+'</p>'+
    '<p class="planning-fields">Teacher: ____________________ Date: ____________ Learner(s): ____________________</p>'+
    section('Learning objectives',list(plan.objectives))+section('Before class',list(plan.preparation))+section('Materials',list(plan.materials));
  if(plan.vocabulary.length)html+=section('Key vocabulary',list(plan.vocabulary));
  html+=section('Prior learning', '<p>'+e(plan.priorLearning)+'</p>');
  if(plan.explanation)html+=section('Concept and explanation','<p>'+e(plan.explanation)+'</p>');
  html+=section('Lesson procedure','<ol>'+plan.steps.map(s=>'<li><strong>'+e(s.title)+'</strong><p>'+e(s.text)+'</p></li>').join('')+'</ol>');
  if(plan.notes)html+=section('Notes for this activity','<p>'+e(plan.notes)+'</p>');
  if(plan.examples.length)html+=section('Lesson examples',list(plan.examples));
  html+=section('Misconceptions to check','<p>'+e(plan.misconception)+'</p>')+
    section('Support and extension','<p><strong>Support:</strong> '+e(plan.support)+'</p><p><strong>Extension:</strong> '+e(plan.extension)+'</p>');
  if(plan.safety)html+=section('Safety and supervision','<p>'+e(plan.safety)+'</p>');
  html+=section('Assessment and marking','<p>'+e(plan.marking)+'</p>');
  if(plan.assessment?.questions?.length)html+=section('Assessment answers and marking points','<ol>'+plan.assessment.questions.map(q=>'<li><strong>'+e(q.prompt)+'</strong><p>'+e(q.answer)+'</p></li>').join('')+'</ol>');
  if(plan.answer)html+=section('Answer / teacher hint','<p>'+e(plan.answer)+'</p>');
  if(plan.answerImage)html+='<p>The publisher’s answer image for this activity is available separately using Show answer key.</p>';
  html+=section('Follow-up','<p>'+e(plan.followUp)+'</p>')+section('Teacher reflection','<p>'+e(plan.reflection)+'</p><div class="reflection-lines">__________________________________________________________________<br>__________________________________________________________________</div>')+
    '<p class="plan-source">'+e(plan.source)+'</p></article>';
  return html;
}
export function assessmentHtml(plan, showAnswers=false) {
  const e=escapeHtml;
  const questions=plan.assessment?.questions || [];
  let html='<article class="assessment-sheet"><h1>'+e(plan.title)+(showAnswers?' · Teacher key':' · Assessment')+'</h1><p>'+e(plan.collection)+' · Workbook page '+plan.page+'</p>';
  if(!showAnswers)html+='<p>Name: ______________________________ Date: ______________</p>';
  if(questions.length)html+='<ol>'+questions.map(q=>'<li><p>'+e(q.prompt)+'</p>'+(showAnswers?'<p><strong>Marking points:</strong> '+e(q.answer)+'</p>':'<div class="answer-lines">__________________________________________________________________<br>__________________________________________________________________<br>__________________________________________________________________</div>')+'</li>').join('')+'</ol>';
  else html+='<p>'+e(plan.marking)+'</p><p>Use the selected workbook questions for this assessment. Keep the teacher key separate from the student sheet.</p>';
  return html+'</article>';
}
