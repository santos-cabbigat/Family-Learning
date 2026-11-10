import test from 'node:test';
import assert from 'node:assert/strict';
import {scienceSlides} from '../docs/science-slides.js';
import {regions} from '../docs/science-regions.js';
import {volumeQuestions} from '../docs/science-prompts.js';

test('every science page has bounded projector regions or a dedicated concept and discussion',()=>{
 assert.equal(Object.keys(regions).length,636);
 for(const [id,boxes] of Object.entries(regions)){
  const slides=scienceSlides({id,label:'Lesson',teacherPlan:{explanation:'Idea from the private book'}});
  assert.ok(slides.length>0,id);
  for(const [x,y,r,b] of boxes){
   assert.ok(0<=x && x<r && r<=1000 && 0<=y && y<b && b<=1000,id);
   assert.ok((r-x)*(b-y)<740000,id);
  }
 }
 assert.deepEqual(volumeQuestions.map(q=>q.length),Array(6).fill(38));
 assert.deepEqual(scienceSlides({id:'k5-phonics-a'}),[]);
});

test('projector uses physical display pixels while bounding scan enlargement and canvas memory',async()=>{
 const {projectionSize}=await import('../docs/projector.js');
 const retina=projectionSize(600,400,1200,800,2,0);
 assert.equal(retina.width,2400);assert.equal(retina.height,1600);
 const small=projectionSize(150,100,1200,800,2,100);
 assert.ok(small.cssWidth<=115.01);assert.ok(small.width>=small.cssWidth);
 const external=projectionSize(1600,900,7000,4000,3,0);
 assert.ok(external.width*external.height<5350000);assert.ok(external.width<=4096);
});
