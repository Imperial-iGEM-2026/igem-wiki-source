from pathlib import Path
from html.parser import HTMLParser
import json,re,html,shutil
class Parser(HTMLParser):
 def __init__(self):super().__init__(convert_charrefs=True);self.root={'t':'root','a':{},'c':[]};self.stack=[self.root]
 def handle_starttag(self,t,attrs):
  n={'t':t,'a':dict(attrs),'c':[]};self.stack[-1]['c'].append(n)
  if t not in ['img','br','hr','meta','link','input','source','wbr','area','embed']:self.stack.append(n)
 def handle_startendtag(self,t,a):self.handle_starttag(t,a);self.handle_endtag(t)
 def handle_endtag(self,t):
  for i in range(len(self.stack)-1,0,-1):
   if self.stack[i]['t']==t:self.stack=self.stack[:i];break
 def handle_data(self,s):self.stack[-1]['c'].append(s)
def find(n,t):
 if isinstance(n,str):return None
 if n['t']==t:return n
 for c in n['c']:
  got=find(c,t)
  if got:return got
out={}
for ident,name in [('regelerate','reGELerate · Notebook'),('swiss','reGELerate · Swiss Biotech')]:
 src=Path('template-sources')/ident;dest=Path('public/templates')/ident;dest.mkdir(parents=True,exist_ok=True)
 for f in src.rglob('*'):
  if f.is_file() and f.suffix.lower() in ['.png','.jpg','.jpeg','.webp','.svg']:
   target=dest/f.relative_to(src);target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(f,target)
 data={'id':ident,'name':name,'pages':[],'fields':{}}
 for f in sorted(src.glob('*.html')):
  p=Parser();p.feed(f.read_text(encoding='utf-8'));body=find(p.root,'body');main=find(body,'main');page='home' if f.stem=='index' else f.stem
  counter={}
  def convert(n,prefix):
   if isinstance(n,str):
    if not n.strip():return n
    counter[prefix]=counter.get(prefix,0)+1;k=f'template:{prefix}:text{counter[prefix]}';data['fields'][k]=n;return {'f':k}
   t=n['t']
   if t in ['script','style','iframe','object','embed']:return ''
   attrs={k:(v or '') for k,v in n['a'].items() if not k.startswith('on')}
   for key in ['src','href']:
    if key not in attrs:continue
    v=attrs[key]
    if re.match(r'(?i)(javascript|data:text|vbscript):',v):attrs.pop(key);continue
    if re.match(r'^[\w-]+\.html(?:#.*)?$',v):
     path,sep,frag=v.partition('#');attrs[key]=('/' if path=='index.html' else '/'+path[:-5])+(sep+frag if sep else '')
    elif not re.match(r'^(https?:|mailto:|#|/)',v):attrs[key]='/templates/'+ident+'/'+v
   # SVG is kept as a tree without text editing markers to preserve diagrams.
   def svgcopy(q):
    if isinstance(q,str):return q
    return {'t':q['t'],'a':{k:v or '' for k,v in q['a'].items() if not k.startswith('on')},'c':[svgcopy(c) for c in q['c'] if not isinstance(c,dict) or c['t']!='script']}
   if t=='svg':return svgcopy(n)
   return {'t':t,'a':attrs,'c':[convert(c,prefix) for c in n['c']]}
  layers=[]
  for region,nodes in [('header',[c for c in body['c'] if isinstance(c,dict) and c['t']=='header']),('main',[c for c in main['c'] if isinstance(c,dict)]),('footer',[c for c in body['c'] if isinstance(c,dict) and c['t']=='footer'])]:
   for i,node in enumerate(nodes):
    prefix=region if region!='main' else page
    ast=convert(node,prefix)
    title=find(node,'h1') or find(node,'h2') or find(node,'h3')
    def text(n):return n if isinstance(n,str) else (' ' if n['t']=='br' else ''.join(text(c) for c in n['c']))
    label=region.title() if region!='main' else (text(title)[:70] if title else node['a'].get('class','Section').split(' ')[0].replace('-',' '))
    layers.append({'id':'import-'+region+'-'+str(i),'label':label,'region':region,'ast':ast})
  title=find(p.root,'title');title=('Home' if page=='home' else text(title).split('|')[0].strip())
  data['pages'].append({'slug':page,'title':title,'mainClass':main['a'].get('class',''),'layers':layers})
 out[ident]=data
Path('app/template-data.json').write_text(json.dumps(out,separators=(',',':'),ensure_ascii=False),encoding='utf-8')
print('Imported',[(k,len(v['pages']),len(v['fields'])) for k,v in out.items()])
