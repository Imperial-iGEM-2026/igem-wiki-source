import { readFile, writeFile } from 'node:fs/promises';
import postcss from 'postcss';
const themes = {};
for (const id of ['regelerate', 'swiss']) {
  let css = await readFile(`template-sources/${id}/style.css`, 'utf8');
  if (id === 'swiss')
    css = css.replace(
      "@import url('diagrams.css');",
      await readFile(`template-sources/${id}/diagrams.css`, 'utf8'),
    );
  const root = postcss.parse(css),
    scope = `[data-template-theme="${id}"]`;
  root.walkRules((rule) => {
    if (rule.parent.type === 'atrule' && /keyframes$/.test(rule.parent.name))
      return;
    rule.selectors = rule.selectors.map((selector) => {
      if (/^(:root|html|body)(?=[\s:.#[]|$)/.test(selector))
        return selector
          .replace(/^(:root|html|body)/, scope)
          .replace(/\bbody\b/g, '');
      return scope + ' ' + selector;
    });
  });
  themes[id] = root.toString();
}
await writeFile('app/template-styles.json', JSON.stringify(themes));
const assembly = await readFile(
  'template-sources/regelerate/script.js',
  'utf8',
);
const story = await readFile(
  'template-sources/regelerate/story-animations.js',
  'utf8',
);
const nav = await readFile('template-sources/regelerate/navigation.js', 'utf8');
const adapt = (s) =>
  s
    .replaceAll('document.querySelector', 'root.querySelector')
    .replaceAll('document.documentElement', 'root')
    .replaceAll('document.addEventListener', 'listen')
    .replaceAll('menu?.addEventListener(', 'listenTo(menu,')
    .replaceAll('g.addEventListener(', 'listenTo(g,')
    .replace(
      "motionPreference.addEventListener('change',syncMotion)",
      "motionPreference.addEventListener('change',syncMotion);cleanups.push(()=>motionPreference.removeEventListener('change',syncMotion))",
    );
await writeFile(
  'app/template-motion.js',
  `// Adapted from the two user-supplied websites; no network or editor access.\nexport function startTemplateMotion(root) {\nlet active=true;const frames=new Set(),cleanups=[],observers=[];\nconst listenTo=(target,type,fn)=>{target?.addEventListener(type,fn);cleanups.push(()=>target?.removeEventListener(type,fn))};const listen=(type,fn)=>listenTo(root,type,fn);\nconst requestAnimationFrame=fn=>{if(!active)return 0;const id=window.requestAnimationFrame(t=>{frames.delete(id);if(active&&root.isConnected)fn(t)});frames.add(id);return id;};\nconst IntersectionObserver=class extends window.IntersectionObserver {constructor(...args){super(...args);observers.push(this)}};\n${adapt(nav)}\nif(root.querySelector('#assembly-diagram')){\n${adapt(assembly)}\n}\nif(root.querySelector('.story-sketch')){\n${adapt(story)}\n}\nreturn ()=>{active=false;frames.forEach(id=>window.cancelAnimationFrame(id));observers.forEach(o=>o.disconnect());cleanups.forEach(fn=>fn())};\n}\n`,
);
