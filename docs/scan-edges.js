/* Bounded document-boundary detection. Runs locally; no photos leave the device.
   Connected paper regions -> convex hull -> four fitted sides. Low-confidence
   scenes return no crop rather than cutting off an uncertain document. */

const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const area=p=>Math.abs(p.reduce((n,a,i)=>{const b=p[(i+1)%p.length];return n+a[0]*b[1]-b[0]*a[1];},0))/2;
function hull(points){points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const lo=[],hi=[];for(const p of points){while(lo.length>1&&cross(lo.at(-2),lo.at(-1),p)<=0)lo.pop();lo.push(p);}for(let i=points.length-1;i>=0;i--){const p=points[i];while(hi.length>1&&cross(hi.at(-2),hi.at(-1),p)<=0)hi.pop();hi.push(p);}lo.pop();hi.pop();return lo.concat(hi);}
function quadFromHull(points){let p=points.slice();while(p.length>4){let best=Infinity,index=-1;for(let i=0;i<p.length;i++){const a=p[(i+p.length-1)%p.length],b=p[i],c=p[(i+1)%p.length],cost=Math.abs(cross(a,b,c));if(cost<best){best=cost;index=i;}}p.splice(index,1);}if(p.length!==4)return null;let first=0;for(let i=1;i<4;i++)if(p[i][0]+p[i][1]<p[first][0]+p[first][1])first=i;return p.slice(first).concat(p.slice(0,first));}
function closePaper(gray,w,h,threshold){
 const binary=Uint8Array.from(gray,v=>v>threshold?1:0),radius=2;
 function box(input,all){const stride=w+1,sum=new Uint32Array(stride*(h+1)),out=new Uint8Array(w*h);for(let y=0;y<h;y++){let row=0;for(let x=0;x<w;x++){row+=input[y*w+x];sum[(y+1)*stride+x+1]=sum[y*stride+x+1]+row;}}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const l=Math.max(0,x-radius),r=Math.min(w,x+radius+1),t=Math.max(0,y-radius),b=Math.min(h,y+radius+1),count=sum[b*stride+r]-sum[t*stride+r]-sum[b*stride+l]+sum[t*stride+l];out[y*w+x]=all?Number(count===(r-l)*(b-t)):Number(count>0);}return out;
 }
 return box(box(binary,false),true);
}
function find({data,width:w,height:h}){
 const none={automatic:false,corners:[[0,0],[1,0],[1,1],[0,1]],confidence:0};if(w<20||h<20||data.length<w*h*4)return none;
 const size=w*h,gray=new Uint8Array(size),hist=new Uint32Array(256);let total=0;
 for(let i=0;i<size;i++){const v=Math.round(data[i*4]*.299+data[i*4+1]*.587+data[i*4+2]*.114);gray[i]=v;hist[v]++;total+=v;}
 let count=0,sum=0,best=0,otsu=128;for(let t=0;t<255;t++){count+=hist[t];sum+=hist[t]*t;if(!count||count===size)continue;const d=sum/count-(total-sum)/(size-count),score=count*(size-count)*d*d;if(score>best){best=score;otsu=t;}}
 const quantile=q=>{let n=0;for(let i=0;i<256;i++){n+=hist[i];if(n>=size*q)return i;}return 255;};
 const low=quantile(.12),high=quantile(.88);if(high-low<9)return none;
 const thresholds=[...new Set([otsu+2,Math.round(low+(high-low)*.35),Math.round(low+(high-low)*.65)])];
 let winner=null;
 for(const threshold of thresholds){
  const mask=closePaper(gray,w,h,threshold),seen=new Uint8Array(size),queue=new Int32Array(size);
  for(let start=0;start<size;start++){
   if(seen[start]||!mask[start])continue;
   let head=0,tail=1,edge=0;queue[0]=start;seen[start]=1;const boundary=[];
   while(head<tail){const n=queue[head++],x=n%w,y=(n/w)|0;let rim=false;
    if(x===0||x===w-1||y===0||y===h-1)edge++;
    for(const k of [x?n-1:-1,x<w-1?n+1:-1,y?n-w:-1,y<h-1?n+w:-1]){if(k<0||!mask[k]){rim=true;continue;}if(!seen[k]){seen[k]=1;queue[tail++]=k;}}
    if(rim)boundary.push([x,y]);
   }
   if(tail<size*.065||tail>size*.94||edge>Math.min(w,h)*.12||boundary.length<12)continue;
   const outline=hull(boundary),q=quadFromHull(outline);if(!q)continue;
   const hullArea=area(outline),quadArea=area(q),fraction=quadArea/size,fit=quadArea/hullArea,fill=tail/quadArea;
   if(fraction<.07||fraction>.93||fit<.91||fill<.55||fill>1.12)continue;
   let ok=true,contrast=0,samples=0;
   const center=q.reduce((a,b)=>[a[0]+b[0]/4,a[1]+b[1]/4],[0,0]);
   for(let i=0;i<4;i++){
    const a=q[i],b=q[(i+1)%4],c=q[(i+2)%4],u=[a[0]-b[0],a[1]-b[1]],v=[c[0]-b[0],c[1]-b[1]];
    const cosine=(u[0]*v[0]+u[1]*v[1])/(Math.hypot(...u)*Math.hypot(...v));
    if(Math.abs(cosine)>.83||Math.hypot(a[0]-b[0],a[1]-b[1])<Math.min(w,h)*.08)ok=false;
    for(let t=1;t<10;t++){const x=a[0]+(b[0]-a[0])*t/10,y=a[1]+(b[1]-a[1])*t/10,dx=center[0]-x,dy=center[1]-y,len=Math.hypot(dx,dy),step=3;
     const at=(xx,yy)=>gray[Math.max(0,Math.min(h-1,Math.round(yy)))*w+Math.max(0,Math.min(w-1,Math.round(xx)))];
     contrast+=at(x+dx/len*step,y+dy/len*step)-at(x-dx/len*step,y-dy/len*step);samples++;
    }
   }
   contrast/=samples;if(!ok||contrast<7)continue;
   const score=fraction*fit*Math.min(1,contrast/35);
   if(!winner||score>winner.score){
    // Leave a small safety margin around the fitted paper, including its edges.
    const corners=q.map(p=>p.map((v,i)=>Math.max(0,Math.min(1,(center[i]+(v-center[i])*1.012)/(i?h-1:w-1)))));
    winner={corners,automatic:true,confidence:Math.min(1,fit*Math.min(1,contrast/24)),score};
   }
  }
 }
 return winner||none;
}
export {find as detectEdges};
