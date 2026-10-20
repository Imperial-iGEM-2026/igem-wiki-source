import { safeLink } from './link-url';
/** Plain saved text supports Markdown links; scripts and HTML are never executed. */
export function LinkedText({text}: {text:string}) {
  const pattern = /(`+)[\s\S]*?\1|\\\[[^\n]*?\]\([^\n]*?\)|\[((?:\\.|[^\]\\\n])+)\]\(([^\s]+?)\)/g;
  const parts = []; let start = 0;
  for (const match of text.matchAll(pattern)) {
    if (!match[2] || !safeLink(match[3])) continue;
    parts.push(text.slice(start,match.index));
    parts.push(<a key={match.index} href={match[3]} data-text-link>{match[2].replace(/\\([[\]\\])/g,'$1')}</a>);
    start=match.index!+match[0].length;
  }
  parts.push(text.slice(start)); return <>{parts}</>;
}
export function insertTextLink(value: string, start: number, end: number, href: string) {
  if (end <= start || start < 0 || end > value.length || /[\r\n]/.test(value.slice(start,end)) || !safeLink(href)) return value;
  const label=value.slice(start,end).replace(/([[\]\\])/g,'\\$1');
  return value.slice(0,start)+'['+label+']('+href.replace(/\(/g,'%28').replace(/\)/g,'%29')+')'+value.slice(end);
}
