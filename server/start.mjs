import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createAppServer } from './app.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
if(!process.env.MEDIA_ORIGIN)throw Error('Set MEDIA_ORIGIN to your DNS-only HTTPS media hostname. The production service requires direct signed media and will not proxy uploaded files through Cloudflare.');
const server=await createAppServer({ dataDir:path.resolve(process.env.DATA_DIR||path.join(here,'../data')), clientDir:path.join(here,'../client'), environment:process.env });
server.listen(Number(process.env.PORT||3000),process.env.BIND_ADDRESS||'127.0.0.1',()=>console.log('Prion editor listening on port '+(process.env.PORT||3000)+'; Cloudflare Access verification required.'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
