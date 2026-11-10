import {regions} from './science-regions.js';
import {volumeQuestions} from './science-prompts.js';

export function scienceSlides(card) {
  const boxes=regions[card.id];
  if(!Array.isArray(boxes))return [];
  const volume=/^nsr-volume-(\d+)-p(\d+)$/.exec(card.id);
  const slides=boxes.map(box=>({box}));
  if(volume){
    const prompt=volumeQuestions[Number(volume[1])-1]?.[Number(volume[2])-3];
    const concept=card.teacherPlan?.explanation;
    // Begin with the illustration. Give children time to reason before showing the explanation.
    if(prompt)slides.push({text:prompt,role:'Discuss'});
    if(concept)slides.push({text:concept,role:'Science idea'});
  }else if(!card.id.includes('bonus')){
    slides.push({role:'Discuss',text:'Use a detail from the diagram to explain '+(card.lessonTitle || card.label).replace(/\.pdf$/i,'')+'.'});
  }
  return slides;
}

export function drawScienceSlide(stage,slide,title,showFigure){
  const frame=document.createElement('article');
  frame.className='science-slide';
  const heading=document.createElement('h2');heading.textContent=title;frame.append(heading);
  if(slide.box){
    const figure=document.createElement('div');
    frame.append(figure);stage.replaceChildren(frame);
    showFigure(figure,slide.box);
  }else{
    const text=document.createElement('p');text.className='science-question';text.textContent=slide.text;
    frame.append(text);stage.replaceChildren(frame);
  }
}
