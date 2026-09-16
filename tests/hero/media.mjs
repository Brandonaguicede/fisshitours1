import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
for(const name of ['desktop','mobile']) {
  const data=fs.readFileSync(`public/videos/hero-papagayo-${name}-v2.mp4`);
  let offset=0; const boxes=[];
  while(offset+8<=data.length) { const size=data.readUInt32BE(offset); boxes.push(data.toString('ascii',offset+4,offset+8)); if(size<8) break; offset+=size; }
  assert.ok(boxes.indexOf('moov')>=0 && boxes.indexOf('moov')<boxes.indexOf('mdat'),`${name} supports fast startup`);
  assert.ok(data.length<(name==='mobile'?7000000:10000000));
  const avc1=data.indexOf(Buffer.from('avc1'),data.indexOf(Buffer.from('stsd')));
  assert.ok(avc1>0);
  assert.equal(data.readUInt16BE(avc1+28),1920);
  assert.equal(data.readUInt16BE(avc1+30),1080);
}
const original='https://pub-1565398a11364fafa0f16b5f55442375.r2.dev/videos%20papagayo%20hero/Timeline%201(53).mov';
const sql=fs.readFileSync('supabase/migrations/202609150003_optimized_hero_video.sql','utf8');
const db=new PGlite();
try {
  await db.exec(`create table site_settings(key text primary key,value text not null,type text,active boolean,updated_at timestamptz default now());`);
  await db.query(`insert into site_settings(key,value) values ('home.hero.video',$1)`,[original]);
  await db.exec(sql);
  assert.equal((await db.query(`select value from site_settings where key='home.hero.mobile_video'`)).rows[0].value,'/videos/hero-papagayo-mobile-v1.mp4');
  await db.exec(`delete from site_settings; insert into site_settings(key,value) values ('home.hero.video','https://example.com/custom.mp4'),('home.hero.video_poster','https://example.com/custom.webp');`);
  await db.exec(sql);
  assert.equal((await db.query(`select value from site_settings where key='home.hero.video'`)).rows[0].value,'https://example.com/custom.mp4');
  await db.exec(`delete from site_settings; insert into site_settings(key,value) values ('home.hero.mobile_video','https://example.com/mobile.mp4'),('home.hero.video_poster','https://example.com/poster.webp');`);
  await db.query(`insert into site_settings(key,value) values ('home.hero.video',$1)`,[original]);
  await db.exec(sql);
  assert.equal((await db.query(`select value from site_settings where key='home.hero.mobile_video'`)).rows[0].value,'https://example.com/mobile.mp4');
  assert.equal((await db.query(`select value from site_settings where key='home.hero.video_poster'`)).rows[0].value,'https://example.com/poster.webp');
  console.log('PASS: video sizes, fast-start MP4 structure and configuration migration preserving custom media.');
} finally { await db.close(); }
