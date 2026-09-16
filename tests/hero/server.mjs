import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
let state={hold:false,broken:false,requests:[],waiters:[]};
const plugin={name:'hero-media-test-server',configureServer(server){
  server.middlewares.use(async(req,res,next)=>{
    const url=new URL(req.url,'http://127.0.0.1');
    if(url.pathname==='/__hero-test/state') {
      if(req.method==='POST') {
        let body='';for await(const chunk of req)body+=chunk;
        for(const resume of state.waiters)resume();
        state={hold:false,broken:false,requests:[],waiters:[],...JSON.parse(body||'{}')};
      }
      res.setHeader('Content-Type','application/json');
      return res.end(JSON.stringify({hold:state.hold,broken:state.broken,requests:state.requests}));
    }
    if(url.pathname==='/__hero-test/release') {
      state.hold=false;for(const resume of state.waiters)resume();state.waiters=[];
      return res.end('released');
    }
    if(!/^\/videos\/(hero-papagayo-.*\.mp4|custom-admin\.mp4)$/.test(url.pathname))return next();
    const current=state;current.requests.push(url.pathname);
    if(current.hold)await new Promise(resolve=>current.waiters.push(resolve));
    if(res.destroyed)return;
    if(current.broken){res.statusCode=404;return res.end('Video unavailable');}
    const filename=url.pathname.endsWith('/custom-admin.mp4')?'hero-papagayo-desktop-v2.mp4':path.basename(url.pathname);
    const file=path.resolve('public/videos',filename);
    const size=fs.statSync(file).size;
    const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
    const start=range?Number(range[1]):0;
    const end=range&&range[2]?Math.min(Number(range[2]),size-1):size-1;
    if(start> end){res.statusCode=416;res.setHeader('Content-Range','bytes */'+size);return res.end();}
    res.statusCode=range?206:200;
    res.setHeader('Content-Type','video/mp4');res.setHeader('Accept-Ranges','bytes');res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Length',end-start+1);
    if(range)res.setHeader('Content-Range','bytes '+start+'-'+end+'/'+size);
    if(req.method==='HEAD')return res.end();
    const stream=fs.createReadStream(file,{start,end});res.on('close',()=>stream.destroy());stream.pipe(res);
  });
}};
const server=await createServer({plugins:[plugin],server:{host:'127.0.0.1',port:5174,strictPort:true}});
await server.listen();
