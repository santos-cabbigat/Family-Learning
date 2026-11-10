import {bookRegions} from './book-regions.js';
import {scanWidth} from './scan-detail.js';

const full=[0,0,1000,1000];
const maxPixels=5300000;

// Render type and vector artwork at display resolution. Scans stay within a
// modest enlargement of the pixels actually supplied by the publisher.
export function projectionSize(width,height,areaWidth,areaHeight,density,sourceWidth) {
  const ratio=Math.min(areaWidth/width,areaHeight/height,
    sourceWidth ? sourceWidth/width*Math.max(1.15,1.75/density) : Infinity);
  const cssWidth=Math.max(1,width*ratio),cssHeight=Math.max(1,height*ratio);
  const dpr=Math.min(density||1,3,Math.sqrt(maxPixels/(cssWidth*cssHeight)),4096/Math.max(cssWidth,cssHeight));
  return {cssWidth,cssHeight,width:Math.max(1,Math.round(cssWidth*dpr)),height:Math.max(1,Math.round(cssHeight*dpr))};
}

function tuneEdges(canvas){
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const {width:w,height:h}=canvas;
  if(w<3 || h<3)return;
  const image=ctx.getImageData(0,0,w,h), src=image.data;
  const out=ctx.createImageData(w,h), dest=out.data;
  dest.set(src);
  // A bounded unsharp mask restores edge contrast without hard outlines.
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const i=(y*w+x)*4;
    for(let c=i;c<i+3;c++){
      const detail=src[c]-(src[c-4]+src[c+4]+src[c-4*w]+src[c+4*w])/4;
      dest[c]=src[c]+Math.max(-10,Math.min(10,detail*.42));
    }
  }
  ctx.putImageData(out,0,0);
}

export function createProjector(signal){
  let loadingTask,documentBlob,documentPromise,renderTask,observer,revision=0,resizeTimer;
  function clear(){
    revision++;clearTimeout(resizeTimer);observer?.disconnect();renderTask?.cancel();renderTask=null;
  }
  signal.addEventListener('abort',()=>{clear();loadingTask?.destroy().catch(()=>{});},{once:true});
  async function openPDF(blob){
    if(documentBlob===blob)return documentPromise;
    const previous=loadingTask;
    documentBlob=blob;loadingTask=null;
    documentPromise=(async()=>{
      if(previous)await previous.destroy();
      const pdfjs=await import('./vendor/pdfjs/pdf.min.mjs');
      const bytes=await blob.arrayBuffer();
      if(signal.aborted || documentBlob!==blob)return;
      pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.min.mjs',import.meta.url).href;
      loadingTask=pdfjs.getDocument({data:bytes,isEvalSupported:false,useSystemFonts:true,useWasm:false,stopAtErrors:true});
      return loadingTask.promise;
    })();
    return documentPromise;
  }
  function show(host,pack,card,scienceBox,url){
    clear();
    const generation=revision;
    const valid=()=>!signal.aborted && generation===revision && host.isConnected;
    const source=pack.assets[card.lessonPdf] || pack.assets['workbook.pdf'];
    const pageNumber=pack.assets[card.lessonPdf]?1:(card.pdfPage || card.page);
    const sourceBox=scienceBox || bookRegions[pack.manifest.id]?.[card.id];
    const scan=scanWidth[pack.manifest.id+'/'+card.id] ?? scanWidth[card.id] ?? scanWidth[pack.manifest.id];
    const image=new Image();image.alt=card.label;image.draggable=false;
    host.classList.add('projector-frame');host.replaceChildren(image);
    let paint=0;
    async function draw(){
      if(!valid() || !image.naturalWidth || !host.clientWidth || !host.clientHeight)return;
      const ticket=++paint;
      renderTask?.cancel();renderTask=null;
      const rect=scienceBox || full;
      const [x,y,r,b]=rect;
      const sw=(r-x)*image.naturalWidth/1000,sh=(b-y)*image.naturalHeight/1000;
      const nativeWidth=scan && sourceBox ? scan*(sourceBox[2]-sourceBox[0])/1000 : !sourceBox?sw:0;
      const size=projectionSize(sw,sh,host.clientWidth,host.clientHeight,window.devicePixelRatio || 1,nativeWidth);
      const prepare=()=>{
        const canvas=document.createElement('canvas');
        canvas.width=size.width;canvas.height=size.height;
        canvas.style.width=size.cssWidth+'px';canvas.style.height=size.cssHeight+'px';
        canvas.setAttribute('role','img');canvas.setAttribute('aria-label',card.label);return canvas;
      };
      const preview=prepare(),ctx=preview.getContext('2d',{willReadFrequently:true});
      ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
      ctx.drawImage(image,x*image.naturalWidth/1000,y*image.naturalHeight/1000,sw,sh,0,0,preview.width,preview.height);
      host.replaceChildren(preview);
      if(!sourceBox || !source){
        tuneEdges(preview);return;
      }
      try{
        const doc=await openPDF(source);
        if(!doc || !valid() || ticket!==paint)return;
        const page=await doc.getPage(pageNumber);
        if(!valid() || ticket!==paint)return;
        const unit=page.getViewport({scale:1}), [l,t,right,bottom]=sourceBox;
        const pdfWidth=unit.width*(right-l)/1000, pdfHeight=unit.height*(bottom-t)/1000;
        // Some PDFs explicitly disable interpolation. Draw their scans at native
        // resolution, then resample independently with high-quality smoothing.
        const scale=scan ? scan/unit.width : Math.min(size.width/pdfWidth,size.height/pdfHeight);
        const viewport=page.getViewport({scale}), output=prepare();
        output.width=Math.max(1,Math.ceil(pdfWidth*scale));output.height=Math.max(1,Math.ceil(pdfHeight*scale));
        const task=page.render({canvas:output,viewport,transform:[1,0,0,1,-l*viewport.width/1000,-t*viewport.height/1000]});
        renderTask=task;
        await task.promise;
        if(!valid() || ticket!==paint)return;
        let displayed=output;
        if(scan){
          displayed=prepare();
          const context=displayed.getContext('2d',{willReadFrequently:true});
          context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
          context.drawImage(output,0,0,displayed.width,displayed.height);
          tuneEdges(displayed);
        }
        displayed.dataset.source='original-pdf';
        host.replaceChildren(displayed);
      }catch{
        // Offline packs and older browsers keep the locally installed illustration.
        if(valid() && ticket===paint && preview.isConnected)tuneEdges(preview);
      }
    }
    image.onload=draw;
    image.onerror=()=>{if(valid())host.textContent='This picture could not open. Reopen the lesson pack.';};
    // The whole worksheet is never shown while a cropped source illustration loads.
    if(scienceBox)image.style.visibility='hidden';
    image.src=url;
    observer=new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(draw,120);});
    observer.observe(host);
  }
  return {show,clear};
}
