import { test, expect } from '@playwright/test';
const poster='/images/hero-papagayo-poster-v1.webp';
async function settings(page: import('@playwright/test').Page) {
  await page.route(/\/rest\/v1\/site_settings/, route=>route.fulfill({ json: [
    { key:'home.hero.media_mode',value:'video' },
    { key:'home.hero.video',value:'/videos/hero-papagayo-desktop-v1.mp4' },
    { key:'home.hero.mobile_video',value:'/videos/hero-papagayo-mobile-v1.mp4' },
    { key:'home.hero.video_poster',value:poster },
  ] }));
}
test('only the right video loads and the poster stays visible while buffering', async ({ page },info)=>{
  await settings(page);
  let release!: ()=>void;
  const gate=new Promise<void>(resolve=>release=resolve);
  const requests:string[]=[];
  await page.route('**/videos/hero-papagayo-*.mp4',async route=>{ requests.push(new URL(route.request().url()).pathname); await gate; await route.continue(); });
  await page.goto('/tests/hero/fixture.html');
  const expected=info.project.name==='mobile' ? '/videos/hero-papagayo-mobile-v1.mp4' : '/videos/hero-papagayo-desktop-v1.mp4';
  await expect(page.locator('#home video')).toHaveCount(1);
  await expect(page.locator('#home video')).toHaveAttribute('src',expected);
  await expect(page.locator(`#home img[src="${poster}"]`)).toBeVisible();
  await expect(page.locator('#home video')).toHaveCSS('opacity','0');
  await expect(page.locator('[aria-label="Cargando video"]')).toHaveCount(0);
  release();
  await expect(page.locator('#home video')).toHaveCSS('opacity','1');
  expect(new Set(requests)).toEqual(new Set([expected]));
  await expect.poll(()=>page.locator('#home video').evaluate((video:HTMLVideoElement)=>video.videoWidth)).toBe(info.project.name==='mobile'?960:1920);
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
test('a broken video keeps its poster and navigation usable',async ({ page })=>{
  await settings(page);
  await page.route('**/videos/hero-papagayo-*.mp4',route=>route.abort());
  await page.goto('/tests/hero/fixture.html');
  await expect(page.locator(`#home img[src="${poster}"]`)).toBeVisible();
  await expect(page.locator('#home video')).toHaveCount(0);
  await expect(page.getByRole('link',{ name:'Book now',exact:true })).toBeVisible();
});
