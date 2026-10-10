// Independent illustrated timelines; loops reset under a fade, never by reversing assembly.
(() => {
 const ns='http://www.w3.org/2000/svg',clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>{x=clamp(x);return x*x*(3-2*x)};
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const scenes=[...document.querySelectorAll('.story-sketch')].map((svg,i)=>{
  const defs=document.createElementNS(ns,'defs');
  defs.innerHTML=`<filter id="paper-ink-${i}" x="-8%" y="-8%" width="116%" height="116%"><feTurbulence type="fractalNoise" baseFrequency=".045" numOctaves="2" seed="${i+4}" result="grain"/><feDisplacementMap in="SourceGraphic" in2="grain" scale=".7" xChannelSelector="R" yChannelSelector="G"/></filter>`;
  const art=document.createElementNS(ns,'g');
  [...svg.children].filter(n=>n.tagName!=='title').forEach(n=>art.append(n));
  art.setAttribute('filter',`url(#paper-ink-${i})`);svg.append(defs,art);
  return {svg,art,t:0,visible:true,query:s=>[...art.querySelectorAll(s)]};
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
 function frame(now){const dt=last===null?0:Math.min((now-last)/1000,.08);last=now;const pause=document.documentElement.classList.contains('motion-off');scenes.forEach(s=>{if(reduced.matches){draw(s,12);return}if(s.visible&&!document.hidden&&!pause){s.t+=dt;draw(s,s.t)}});requestAnimationFrame(frame)}
 scenes.forEach(s=>draw(s, reduced.matches?12:.8));requestAnimationFrame(frame);
})();
