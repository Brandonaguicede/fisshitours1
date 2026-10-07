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

// Hero social buttons (Instagram / Facebook). On a phone they are part of the actions block, in normal flow right under "View tours"
// (an absolutely placed block could overlap the buttons above it on short screens); from sm up they keep their corner position over
// the hero. Exactly one copy is displayed at any width.
const heroGeometry = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const box = (el: Element) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; };
  const visible = (el: Element) => el.getClientRects().length > 0;
  const link = (re: RegExp) => [...document.querySelectorAll('#home a, #home button')].find((el) => re.test(el.textContent ?? ''))!;
  const socialLinks = [...document.querySelectorAll('#home a')].filter((el) => /instagram|facebook/i.test(el.getAttribute('aria-label') ?? '') && visible(el));
  const container = document.querySelector('#home > div.relative.grid') as HTMLElement;
  const group = socialLinks[0]?.parentElement as HTMLElement;
  const wa = document.querySelector('a[aria-label="WhatsApp"]')!;
  return {
    view: box(link(/view tours|ver tours/i)), book: box(link(/book now|reservar/i)), social: socialLinks.map(box), whatsapp: box(wa),
    socialPosition: getComputedStyle(group).position, padBottom: parseFloat(getComputedStyle(container).paddingBottom),
    visibleSocialLinks: socialLinks.length, viewportWidth: innerWidth, viewportHeight: innerHeight,
    overflowX: document.documentElement.scrollWidth - innerWidth, pageHeight: document.documentElement.scrollHeight,
  };
});
const rectDistance = (a: { top: number; bottom: number; left: number; right: number }, b: { top: number; bottom: number; left: number; right: number }) =>
  Math.hypot(Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right)), Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom)));
const socialBox = (social: Array<{ top: number; bottom: number; left: number; right: number }>) => ({
  top: Math.min(...social.map((s) => s.top)), bottom: Math.max(...social.map((s) => s.bottom)), left: Math.min(...social.map((s) => s.left)), right: Math.max(...social.map((s) => s.right)),
});
async function openHero(page: import('@playwright/test').Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.route(/\/rest\/v1\/site_settings/, (route) => route.fulfill({ json: [] }));
  await page.goto('/tests/hero/fixture.html');
  await expect(page.getByRole('link', { name: /view tours|ver tours/i })).toBeVisible();
  await page.waitForTimeout(1200); // entrance animation
  return heroGeometry(page);
}

// Page height that must hold at each phone size. 320x568 cannot fit everything (the title wraps to several lines and the buttons stack),
// the others fit the viewport exactly.
const PHONES = [[320, 568, 630], [320, 640, 640], [375, 667, 667], [390, 844, 844]] as const;
for (const [width, height, maxPageHeight] of PHONES) {
  test(`mobile hero ${width}x${height}: socials flow under "View tours" with a clear fixed gap, centred, no overlap, compact`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'sizes are set explicitly; one project is enough');
    const m = await openHero(page, width, height);
    const s = socialBox(m.social);
    expect(m.visibleSocialLinks, 'one copy of the social buttons').toBe(2);
    expect(m.socialPosition, 'in normal flow, not absolute').toBe('static');
    // Clear, constant separation (mt-5 on top of the actions block's gap-3), whatever the viewport height.
    expect(s.top - m.view.bottom).toBeGreaterThanOrEqual(28); expect(s.top - m.view.bottom).toBeLessThanOrEqual(36);
    expect(s.top).toBeGreaterThan(m.view.bottom); // no overlap possible
    // Sizes and alignment are exactly as before.
    expect(Math.round(m.book.height)).toBe(50); expect(Math.round(m.view.height)).toBe(50);
    for (const link of m.social) { expect(Math.round(link.width)).toBe(40); expect(Math.round(link.height)).toBe(40); }
    expect(Math.abs((s.left + s.right) / 2 - m.viewportWidth / 2)).toBeLessThanOrEqual(1);
    // No padding inflated to reserve room for an absolute element: the original-size reserve is enough.
    expect(m.padBottom).toBe(80);
    expect(m.pageHeight, 'hero stays compact').toBeLessThanOrEqual(maxPageHeight);
    expect(m.overflowX).toBeLessThanOrEqual(0);
    // WhatsApp keeps its fixed bottom-right spot and stays clear of the socials.
    expect(Math.round(m.whatsapp.width)).toBe(50);
    expect(Math.round(m.viewportWidth - m.whatsapp.right)).toBe(16); expect(Math.round(m.viewportHeight - m.whatsapp.bottom)).toBe(16);
    expect(rectDistance(m.whatsapp, s)).toBeGreaterThanOrEqual(40);
    console.log(`${width}x${height}: gap ${Math.round(s.top - m.view.bottom)}px, page ${Math.round(m.pageHeight)}px, overflowX ${m.overflowX}, WhatsApp->social ${Math.round(rectDistance(m.whatsapp, s))}px, WhatsApp->View tours ${Math.round(rectDistance(m.whatsapp, m.view))}px`);
  });
}

for (const [width, height] of [[768, 1024], [1440, 900]] as const) {
  test(`tablet/desktop hero ${width}x${height}: socials keep their corner position, the in-flow copy is hidden, sizes unchanged`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'sizes are set explicitly; one project is enough');
    const m = await openHero(page, width, height);
    const s = socialBox(m.social);
    expect(m.visibleSocialLinks, 'one copy of the social buttons').toBe(2);
    await expect(page.getByTestId('hero-social-mobile')).toBeHidden();
    expect(m.socialPosition).toBe('absolute');
    expect(s.left, 'right-aligned, not centred').toBeGreaterThan(m.viewportWidth / 2);
    expect(Math.round(m.viewportHeight - s.bottom), 'same bottom offset as before (bottom-32)').toBe(128);
    expect(s.top - m.view.bottom).toBeGreaterThanOrEqual(90);
    expect(m.padBottom, 'same bottom reserve as before (sm:pb-20)').toBe(80);
    for (const link of m.social) { expect(Math.round(link.width)).toBe(40); expect(Math.round(link.height)).toBe(40); }
    expect(m.overflowX).toBeLessThanOrEqual(0);
    expect(m.pageHeight).toBeLessThanOrEqual(height);
    expect(rectDistance(m.whatsapp, s)).toBeGreaterThanOrEqual(40);
  });
}
