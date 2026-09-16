import { test, expect } from '@playwright/test';
const poster='/images/hero-papagayo-poster-v2.webp';
test.beforeEach(async({request})=>{await request.post('/__hero-test/state',{data:{}});});
async function settings(page: import('@playwright/test').Page) {
  await page.route(/\/rest\/v1\/site_settings/, route=>route.fulfill({ json: [
    { key:'home.hero.media_mode',value:'video' },
    { key:'home.hero.video',value:'/videos/hero-papagayo-desktop-v1.mp4' },
    { key:'home.hero.mobile_video',value:'/videos/hero-papagayo-mobile-v1.mp4' },
    { key:'home.hero.video_poster',value:'/images/hero-papagayo-poster-v1.webp' },
  ] }));
}
test('only the right video loads and the poster stays visible while buffering', async ({ page, request, browserName },info)=>{
  await settings(page);
  await request.post('/__hero-test/state',{data:{hold:true}});
  await page.goto('/tests/hero/fixture.html');
  const expected=info.project.name.includes('mobile') ? '/videos/hero-papagayo-mobile-v2.mp4' : '/videos/hero-papagayo-desktop-v2.mp4';
  await expect(page.locator('#home video')).toHaveCount(1);
  await expect(page.locator('#home video')).toHaveAttribute('src',expected);
  await expect(page.locator(`#home img[src="${poster}"]`)).toBeVisible();
  await expect(page.locator('#home video')).toHaveCSS('opacity','0');
  await expect(page.locator('[aria-label="Cargando video"]')).toHaveCount(0);
  await request.post('/__hero-test/release');
  await expect(page.locator('#home video')).toHaveCSS('opacity','1');
  const {requests}=await (await request.get('/__hero-test/state')).json();
  expect(new Set(requests)).toEqual(new Set([expected]));
  // The encoded Full HD dimensions are checked in media.mjs. WebKit on Windows
  // reports a different decoder size; verify that it actually has a decoded frame.
  const decodedWidth=()=>page.locator('#home video').evaluate((video:HTMLVideoElement)=>video.videoWidth);
  if(browserName==='webkit')await expect.poll(decodedWidth).toBeGreaterThan(0);
  else await expect.poll(decodedWidth).toBe(1920);
  await expect.poll(()=>page.locator('#home video').evaluate((video:HTMLVideoElement)=>!video.paused && video.currentTime>0)).toBe(true);
  await expect(page.locator('#home video')).toHaveAttribute('muted','');
  await expect(page.locator('#home video')).toHaveAttribute('webkit-playsinline','');
  await expect(page.locator('#home video')).not.toHaveAttribute('controls','');
  await page.screenshot({ path:`tmp/hero-video-tools/hero-${info.project.name}.png`,fullPage:true });
});
test('reduced motion shows a poster without downloading video',async ({ page })=>{
  await page.emulateMedia({ reducedMotion:'reduce' });
  await settings(page);
  const requests:string[]=[];
  page.on('request',request=>{ if(request.resourceType()==='media') requests.push(request.url()); });
  await page.goto('/tests/hero/fixture.html');
  await expect(page.locator(`#home img[src="${poster}"]`)).toBeVisible();
  await expect(page.locator('#home video')).toHaveCount(0);
  expect(requests).toEqual([]);
});
test('a broken video keeps its poster and navigation usable',async ({ page, request })=>{
  await settings(page);
  await request.post('/__hero-test/state',{data:{broken:true}});
  await page.goto('/tests/hero/fixture.html');
  await expect(page.locator(`#home img[src="${poster}"]`)).toBeVisible();
  await expect(page.locator('#home video')).toHaveCount(0);
  await expect(page.getByRole('link',{ name:'Book now',exact:true })).toBeVisible();
});

test('blocked autoplay keeps a poster and resumes on a normal interaction without a Play button',async({page})=>{
  await settings(page);
  await page.addInitScript(()=>{
    Reflect.set(window,'allowHeroAutoplay',false);
    const play=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(){
      if(!Reflect.get(window,'allowHeroAutoplay')) {
        this.autoplay=false;
        this.pause();
        return Promise.reject(new DOMException('Autoplay blocked','NotAllowedError'));
      }
      return play.call(this);
    };
  });
  await page.goto('/tests/hero/fixture.html');
  const video=page.locator('#home video');
  await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.readyState)).toBeGreaterThanOrEqual(2);
  await expect(video).toHaveCSS('opacity','0');
  await expect(page.locator('#home img[src="'+poster+'"]')).toBeVisible();
  await expect(page.getByRole('button',{name:/play/i})).toHaveCount(0);
  await page.evaluate(()=>Reflect.set(window,'allowHeroAutoplay',true));
  await page.keyboard.press('Shift');
  await expect(video).toHaveCSS('opacity','1');
  await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.paused)).toBe(false);
});

test('admin custom video URLs are preserved',async({page})=>{
  await page.route(/\/rest\/v1\/site_settings/,route=>route.fulfill({json:[
    {key:'home.hero.media_mode',value:'video'},
    {key:'home.hero.video',value:'/videos/custom-admin.mp4'},
    {key:'home.hero.mobile_video',value:'/videos/custom-admin.mp4'},
    {key:'home.hero.video_poster',value:poster},
  ]}));
  await page.goto('/tests/hero/fixture.html');
  await expect(page.locator('#home video')).toHaveAttribute('src','/videos/custom-admin.mp4');
  await expect(page.locator('#home video')).toHaveCSS('opacity','1');
});
