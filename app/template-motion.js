import { createMotionLoop } from './motion-loop';
import { startSectionNavigator } from './section-navigator';
import { startPageIndex } from './page-index';
import { startPurpleInteractions } from './purple-interactions';
import { startLucaSponsors } from './luca-sponsors';
// Adapted from the two user-supplied websites; no network or editor access.
export function startTemplateMotion(root) {
const loop=createMotionLoop(root),cleanups=[startLucaSponsors(root),startPurpleInteractions(root),startSectionNavigator(root,{onInteraction:value=>loop.setInteracting(value)}),startPageIndex(root)],observers=[];
const listenTo=(target,type,fn)=>{target?.addEventListener(type,fn);cleanups.push(()=>target?.removeEventListener(type,fn))};const listen=(type,fn)=>listenTo(root,type,fn);
const requestAnimationFrame=fn=>loop.request(fn);
const IntersectionObserver=class extends window.IntersectionObserver {constructor(...args){super(...args);observers.push(this)}};
const menu=root.querySelector('.menu-toggle'),wrapper=root.querySelector('#wiki-menu'),groups=[...root.querySelectorAll('.nav-group')];listenTo(menu,'click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));wrapper.classList.toggle('mobile-open',open)});groups.forEach(g=>listenTo(g,'toggle',()=>{if(g.open)groups.forEach(other=>{if(other!==g)other.open=false})}));listen('click',e=>{if(!e.target.closest('.nav-group'))groups.forEach(g=>g.open=false)});listen('keydown',e=>{if(e.key==='Escape'){const open=groups.find(g=>g.open);groups.forEach(g=>g.open=false);if(open)open.querySelector('summary').focus();else if(menu?.getAttribute('aria-expanded')==='true'){menu.click();menu.focus()}}});

if(root.querySelector('#assembly-diagram')){
const svg=root.querySelector('#assembly-diagram'),ns='http://www.w3.org/2000/svg';
function make(tag,attrs,parent=svg){const e=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);parent.appendChild(e);return e}
// Keep the drawn contours; animated turbulence/displacement filters force costly repaints.
const scene=make('g',{});
const mix=(a,b,t)=>a+(b-a)*t,clamp=t=>Math.max(0,Math.min(1,t)),ease=t=>{t=clamp(t);return t*t*(3-2*t)};
function contour(seed,r){let d='';for(let k=0;k<=16;k++){const a=k/16*Math.PI*2,v=r*(1+.1*Math.sin(k*2.4+seed)+.06*Math.cos(k*4.3+seed));d+=(k?' L':'M')+(Math.cos(a)*v).toFixed(2)+','+(Math.sin(a)*v*.86).toFixed(2)}return d+' Z'}
// Random connected intersection graphs, not a fixed polygon with jittered vertices.
// Binding chronology is illustrative; affinity, valency and kinetics are not simulated.
const CYCLE_MS=60000;
const sessionSeed=Math.floor(Math.random()*2147483647);
let activeCycle=-1,fibreData=[],crosslinks=[],previousSignature='';
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
function intersection(a,b){const u=[Math.cos(a.angle)*a.length,Math.sin(a.angle)*a.length],v=[Math.cos(b.angle)*b.length,Math.sin(b.angle)*b.length],p=[a.center[0]-u[0]/2,a.center[1]-u[1]/2],q=[b.center[0]-v[0]/2,b.center[1]-v[1]/2],d=cross(u,v);if(Math.abs(d)<5000)return null;const w=[q[0]-p[0],q[1]-p[1]],ta=cross(w,v)/d,tb=cross(w,u)/d;if(ta<.12||ta>.88||tb<.12||tb>.88)return null;return {ta,tb,x:p[0]+ta*u[0],y:p[1]+ta*u[1]}}
function setupCycle(cycle){activeCycle=cycle;scene.replaceChildren();let seed=(sessionSeed+cycle*7919)>>>0;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};let geometry,chosen,signature;
 for(let attempt=0;attempt<1000;attempt++){
 const count=5+Math.floor(random()*4);geometry=Array.from({length:count},(_,i)=>({i,center:[220+random()*200,125+random()*95],length:175+random()*135,angle:random()*Math.PI}));
 // Keep the whole projected network within the paper area.
 geometry.forEach(f=>{f.length=Math.min(f.length,2*Math.min(f.center[1]-35,300-f.center[1])/(Math.abs(Math.sin(f.angle))||1))});
 const candidates=[];for(let a=0;a<count;a++)for(let b=a+1;b<count;b++){const hit=intersection(geometry[a],geometry[b]);if(hit)candidates.push({a,b,...hit,key:random()})}candidates.sort((a,b)=>a.key-b.key);
 const parent=Array.from({length:count},(_,i)=>i),root=i=>{while(parent[i]!==i)i=parent[i];return i};chosen=[];
 for(const e of candidates){if(chosen.some(n=>Math.hypot(n.x-e.x,n.y-e.y)<18))continue;const separate=root(e.a)!==root(e.b);if(separate||random()<.3){chosen.push(e);parent[root(e.a)]=root(e.b)}}
 if(chosen.length<count-1||new Set(parent.map((_,i)=>root(i))).size!==1)continue;
 const degree=geometry.map((_,i)=>chosen.filter(e=>e.a===i||e.b===i).length).sort((a,b)=>a-b);signature=count+':'+chosen.length+':'+degree.join(',');if(signature!==previousSignature)break;
 }
 // Sampling is bounded; a new graph must be connected before it is rendered.
 if(!geometry||!chosen||chosen.length<geometry.length-1)throw Error('Unable to construct illustrative network');previousSignature=signature;
 // Interior junctions bind soluble subunits on both future fibres before growth.
 chosen.forEach(e=>{e.early=true});
 // Late arrivals join terminal subunits only; add a short branch at each chosen tip.
 const baseCount=geometry.length;
 for(let k=0;k<2;k++){
 const a=(cycle+k*2)%baseCount,f=geometry[a],ta=k%2;
 const x=f.center[0]+(ta-.5)*f.length*Math.cos(f.angle),y=f.center[1]+(ta-.5)*f.length*Math.sin(f.angle);
 const angle=Math.atan2(170-y,320-x)+(random()-.5)*1.1,length=55+random()*40,b=geometry.length;
 geometry.push({i:b,center:[x+Math.cos(angle)*length/2,y+Math.sin(angle)*length/2],length,angle});
 chosen.push({a,b,ta,tb:0,x,y,early:false});
 }
 fibreData=geometry.map((f,i)=>{const n=Math.round(f.length/11)+1,g=make('g',{'data-fibre':i,opacity:i%3===0?'.65':'.92'},scene),wash=make('path',{class:'fibre-wash'},g),ink=make('path',{class:'fibre-ink'},g);
 const beads=Array.from({length:n},(_,j)=>{const dot=make('g',{},g);make('path',{d:contour(i*7+j,5.6),class:'sketch-wash'},dot);make('path',{d:contour(i*7+j+.3,4.8),class:'sketch-ink'},dot);return dot});
 return {...f,n,g,wash,ink,beads,start:[f.center[0]+(random()-.5)*70,f.center[1]+(random()-.5)*30],startAngle:f.angle+(random()-.5)*.4,delay:random()*1.5};});
 crosslinks=chosen.map((e,i)=>{const f=fibreData[e.a],g=make('g',{'data-node':i},scene);for(let k=0;k<3;k++){const a=k*Math.PI*2/3;make('path',{d:contour(i+k,7),transform:`translate(${Math.cos(a)*5} ${Math.sin(a)*5})`,fill:'#ddba69','fill-opacity':'.55',stroke:'#ad8948','stroke-width':'.8'},g)}
 const heading=random()*Math.PI*2,radius=40+random()*55;
 const start=[Math.max(40,Math.min(600,e.x+Math.cos(heading)*radius)),Math.max(35,Math.min(295,e.y+Math.sin(heading)*radius))];
 // Seeded random-walk samples give reproducible, non-periodic Brownian-like drift.
 const walk=[[0,0,random()*180]];for(let k=1;k<=125;k++){const prev=walk[k-1];walk.push([Math.max(-33,Math.min(33,prev[0]+(random()+random()+random()-1.5)*3.6)),Math.max(-27,Math.min(27,prev[1]+(random()+random()+random()-1.5)*3.6)),prev[2]+(random()-.5)*5])}
 return {...e,g,early:e.early,bead:Math.round(e.ta*(f.n-1)),start,walk,bindTime:2+random()*2,dockTime:36+random()*2,duration:9+random()*3};});
}
function fibrePose(f,t){return {x:f.center[0],y:f.center[1],angle:f.angle}}
function seedSites(f){if(f.sites)return f.sites;const sites=crosslinks.filter(n=>n.early&&(n.a===f.i||n.b===f.i)).map(n=>({j:Math.round((n.a===f.i?n.ta:n.tb)*(f.n-1)),node:n}));return (f.sites=sites.length?sites:[{j:0,node:null}])}
function beadPose(f,j,t){
 const sites=seedSites(f),nearest=(f.nearest??=[])[j]??((f.nearest[j])=sites.reduce((a,b)=>Math.abs(j-a.j)<=Math.abs(j-b.j)?a:b)),distance=Math.abs(j-nearest.j),n=nearest.node;
 const dockedAt=n?n.bindTime+n.duration:10+f.delay;
 let targetX=-f.length/2+j*f.length/(f.n-1),targetY=(j===0||j===f.n-1)?0:Math.sin(j*.8+f.i)*.8;
 if(n&&j>0&&j<f.n-1){const seedX=(n.x-f.center[0])*Math.cos(f.angle)+(n.y-f.center[1])*Math.sin(f.angle);targetX=seedX+(j-nearest.j)*f.length/(f.n-1);}
 // Capture visible subunits early; a short attached seed grows during transport.
 // Longer fibre elongation starts locally as that seed reaches its assembly site.
 const capture=n?1.4+(n.bindTime-2)*.45+(n.a===f.i?0:.65):4+f.delay;
 const joinStart=distance<=2?capture+distance*3.2:Math.max(dockedAt,capture+9.4)+(distance-2)*1.5;
 const duration=3,attached=ease((t-joinStart)/duration);
 function bindingSite(time){let x=targetX,y=targetY;
  if(n){const p=nodePose(n,time),dx=p.x-n.x,dy=p.y-n.y;x+=dx*Math.cos(f.angle)+dy*Math.sin(f.angle);y+=-dx*Math.sin(f.angle)+dy*Math.cos(f.angle);}
  if(n&&distance===0)y+=(n.a===f.i?1:-1)*10;
  return {x,y};
 }
 // Start near the encounter site, not at the distant final network coordinate.
 // These are stable particle positions: no respawn at the capture boundary.
 const source=bindingSite(joinStart),theta=j*2.399+f.i*1.7,radius=19+(j*7+f.i*3)%12;
 const freeAt=time=>({x:source.x+Math.cos(theta)*radius+Math.sin(time*.7+j)*3,y:source.y+Math.sin(theta)*radius+Math.cos(time*.6+f.i+j)*3});
 const free=freeAt(t),bound=bindingSite(t);
 return {x:mix(free.x,bound.x,attached),y:mix(free.y,bound.y,attached),attached,owner:n,settled:t>=dockedAt,joinStart,duration};
}
function beadWorld(f,j,t){const p=fibrePose(f,t),b=beadPose(f,j,t);return {x:p.x+Math.cos(p.angle)*b.x-Math.sin(p.angle)*b.y,y:p.y+Math.sin(p.angle)*b.x+Math.cos(p.angle)*b.y}}
function brownianAt(n,t){const u=Math.max(0,Math.min(n.walk.length-1.001,t/.5)),k=Math.floor(u),p=ease(u-k),a=n.walk[k],b=n.walk[k+1];return {x:mix(a[0],b[0],p),y:mix(a[1],b[1],p),rotation:mix(a[2],b[2],p)}}
function nodePose(n,t){const start=n.early?n.bindTime:n.dockTime,progress=ease((t-start)/n.duration),noise=brownianAt(n,Math.min(t,start+n.duration));return {x:mix(n.start[0],n.x,progress)+noise.x*(1-progress),y:mix(n.start[1],n.y,progress)+noise.y*(1-progress),rotation:noise.rotation}}
const status=make('text',{x:320,y:333,'text-anchor':'middle',class:'assembly-phase'});
function render(ms){const cycle=Math.floor(ms/CYCLE_MS);if(cycle!==activeCycle)setupCycle(cycle);const t=(ms%CYCLE_MS)/1000;scene.style.opacity=ease(t/.8)*(1-ease((t-54)/4));const sway=ease((t-50)/2);scene.setAttribute('transform',`translate(${sway*2*Math.sin(t*.6)} ${sway*2*Math.cos(t*.5)})`);
 status.textContent=t<3?'Free nodes meet soluble subunits':t<10?'Proteins begin to gather around the nodes':t<18?'Bound assemblies develop into fibres':t<34?'Fibres grow from early-bound subunits':t<50?'Late nodes drift toward free fibre ends':t<54?'A connected network—one possible arrangement':'Starting with a new arrangement…';
 fibreData.forEach(f=>{const p=fibrePose(f,t);f.g.setAttribute('transform',`translate(${p.x} ${p.y}) rotate(${p.angle*180/Math.PI})`);const positions=f.beads.map((g,j)=>{const b=beadPose(f,j,t);g.setAttribute('transform',`translate(${b.x} ${b.y})`);return b});let d='';for(let j=1;j<positions.length;j++){const a=positions[j-1],b=positions[j];if(a.attached===1&&b.attached===1&&(a.owner===b.owner||(a.settled&&b.settled)))d+=`M${a.x},${a.y} L${b.x},${b.y} `}f.ink.setAttribute('d',d);f.wash.setAttribute('d',d);f.ink.style.opacity='.5'});

 crosslinks.forEach(n=>{const p=nodePose(n,t);n.g.setAttribute('transform',`translate(${p.x} ${p.y}) rotate(${p.rotation})`)});
}
let assemblyVisible=true;const assemblyVisibility=new IntersectionObserver(entries=>{assemblyVisible=entries[0]?.isIntersecting ?? true});assemblyVisibility.observe(svg);
const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
let paused=motionPreference.matches,elapsed=paused?52000:['notebook-purple','notebook-white'].includes(root.dataset.templateTheme)?24000:0,last=null;
function syncMotion(){paused=motionPreference.matches;root.classList.toggle('motion-off',paused);last=null;if(paused){elapsed=52000;render(elapsed)}}
motionPreference.addEventListener('change',syncMotion);cleanups.push(()=>motionPreference.removeEventListener('change',syncMotion));syncMotion();render(elapsed);
function frame(now){if(last!==null&&!paused&&!document.hidden&&assemblyVisible){elapsed+=Math.min(now-last,80);render(elapsed)}last=now;requestAnimationFrame(frame)}requestAnimationFrame(frame);

}
if(root.querySelector('.story-sketch')){
// Independent illustrated timelines; loops reset under a fade, never by reversing assembly.
(() => {
 const ns='http://www.w3.org/2000/svg',clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>{x=clamp(x);return x*x*(3-2*x)};
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const scenes=[...root.querySelectorAll('.story-sketch')].map((svg,i)=>{
  const art=document.createElementNS(ns,'g');
  [...svg.children].filter(n=>n.tagName!=='title').forEach(n=>art.append(n));
  svg.append(art);
  const queries=new Map();
  return {svg,art,t:0,visible:true,query:s=>{if(!queries.has(s))queries.set(s,[...art.querySelectorAll(s)]);return queries.get(s)}};
 });
 if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>entries.forEach(e=>{const s=scenes.find(s=>s.svg===e.target);if(s)s.visible=e.isIntersecting}),{rootMargin:'80px'});scenes.forEach(s=>observer.observe(s.svg))}
 function pose(el,x,y){el.setAttribute('transform',`translate(${x.toFixed(2)} ${y.toFixed(2)})`)}
 function draw(s,t){
  const period=16,u=t%period;
  s.art.style.opacity=String(ease(u/.7)*(1-ease((u-14.3)/1.3)));
  const join=(selector,repair=false)=>{
   const beads=s.query(selector);
   beads.forEach((el,j)=>{
    // Sequential capture at the growing end; the trajectory stays continuous.
    const p=ease((u-1.2-j*.65)/2.8),style=el.style;
    const dx=parseFloat(style.getPropertyValue('--dx'))||0,dy=parseFloat(style.getPropertyValue('--dy'))||0;
    const drift=(1-p)*Math.sin(u*1.2+j*2)*3;
    pose(el,dx*(1-p)+drift,dy*(1-p)+Math.sin(u*.95+j)*3*(1-p));el.style.opacity='.85';
   });
   s.query(repair?'.repair-link':'.ink-line,.wash-line').forEach(el=>el.style.opacity=String(ease((u-(repair?9.8:11))/1.2)));
  };
  if(s.svg.classList.contains('sketch-seed')){
   const beads=s.query('.seed-subunit');let points=[];
   beads.forEach((el,j)=>{
    const p=j<2?1:ease((u-.4-(j-2)*.72)/1.35),x=+el.dataset.x,y=+el.dataset.y;
    const dx=parseFloat(el.style.getPropertyValue('--dx')),dy=parseFloat(el.style.getPropertyValue('--dy'));
    const sway=Math.sin(u*.65+j*.3)*1.3;
    pose(el,(dx+Math.sin(u*1.1+j*1.7)*4)*(1-p),dy*(1-p)+Math.cos(u*.8+j)*3*(1-p)+sway*p);
    if(p>=.999)points.push([x,y+sway]);
   });
   const d=points.map(([x,y],j)=>`${j?'L':'M'}${x} ${y}`).join(' ');
   s.query('.ink-line,.wash-line').forEach(el=>{el.setAttribute('d',d);el.style.opacity='1'});
  }
  if(s.svg.classList.contains('sketch-repair'))join('.repair-subunit',true);
  s.query('.colony').forEach((el,j)=>{
   const p=ease((u-1-j*.11)/7),x=+(el.getAttribute('cx')||0),y=+(el.getAttribute('cy')||0),k=.25+.75*p;
   el.setAttribute('transform',`translate(${x} ${y}) scale(${k}) translate(${-x} ${-y})`);el.style.opacity=String(.25+.75*p);
  });
  s.query('.gfp-particle').forEach((el,j)=>{
   const p=ease((u-2-j*.055)/7),dx=parseFloat(el.style.getPropertyValue('--dx')),dy=parseFloat(el.style.getPropertyValue('--dy'));
   // Retain diffuse background; foci are not the entire fluorescent signal.
   const capture=j%5!==0?p:0;
   pose(el,dx*capture+Math.sin(u+j)*1.8*(1-capture),dy*capture+Math.cos(u*.7+j)*1.8*(1-capture));el.style.opacity=String(.28+.45*capture);
  });
  s.query('.soluble-band').forEach(el=>{pose(el,0,-75*(1-ease((u-1)/8)));el.style.opacity=String(ease(u-1))});
  s.query('.smear').forEach((el,j)=>{pose(el,0,-12*(1-ease((u-1)/7)));el.style.strokeOpacity=String(ease((u-1-j*.13)/4))});
  const compression=ease((u-2)/3)*(1-ease((u-9)/3));
  s.query('.compress-network').forEach(el=>el.setAttribute('transform',`translate(160 129) scale(${1+.045*compression} ${1-.23*compression}) translate(-160 -129)`));
  s.query('.pressure-arrow').forEach(el=>pose(el,0,19*compression));
  s.query('.cargo').forEach((el,j)=>el.style.opacity=String(.72+.2*Math.sin(u*.8+j)));
  s.query('.release-subunit').forEach((el,j)=>{
   const p=ease((u-3-Math.abs(j-8)*.24)/4),dx=parseFloat(el.style.getPropertyValue('--dx')),dy=parseFloat(el.style.getPropertyValue('--dy'));
   pose(el,dx*p+Math.sin(u+j)*2*p,dy*p+Math.cos(u*.9+j)*2*p);
  });
  s.query('.chaperone').forEach(el=>{const p=ease(u/3)*(1-ease((u-8)/3));pose(el,0,-12+31*p);el.style.opacity=String(.5+.5*p)});
 }
 let last=null;
 function frame(now){const dt=last===null?0:Math.min((now-last)/1000,.08);last=now;const pause=root.classList.contains('motion-off');scenes.forEach(s=>{if(reduced.matches)return;if(s.visible&&!document.hidden&&!pause){s.t+=dt;draw(s,s.t)}});requestAnimationFrame(frame)}
 const preference=()=>{scenes.forEach(s=>draw(s,reduced.matches?12:s.t));};reduced.addEventListener('change',preference);cleanups.push(()=>reduced.removeEventListener('change',preference));
 scenes.forEach(s=>draw(s, reduced.matches?12:.8));requestAnimationFrame(frame);
})();

}
return ()=>{loop.stop();observers.forEach(o=>o.disconnect());cleanups.forEach(fn=>fn())};
}
