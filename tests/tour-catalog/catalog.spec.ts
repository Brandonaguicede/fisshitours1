import { test, expect, type Page } from '@playwright/test';

async function mockCatalog(page: Page) {
  const boats = ['a','b','c'].map((id) => ({id,slug:id,name:'Boat '+id.toUpperCase(),max_guests:id==='b'?8:10,
    image_url:'/images/papagayo-logo.png',active:true,length:'32 feet',engine:'Yamaha',featured_spec:'GPS'}));
  const makeTour=(id:string,title:string) => ({id,title,category:'Snorkeling & Beach',description:'Shared tour description',
    highlights:['Snorkeling'],included:['Tour drinks'],image_url:'/images/papagayo-logo.png',active:true});
  const mainTour=makeTour('beach','Beach & Snorkeling');
  const makePackage=(id:string,boatId:string,name:string,price:number,tour=mainTour) => ({id,boat_tour_id:boatId+'-'+tour.id,
    name:tour.title+' - '+name,base_price:price,active:true,custom_quote:false,included_guests:boatId==='b'?4:5,
    max_guests:boatId==='b'?6:10,extra_guest_price:boatId==='b'?80:65,duration_minutes:boatId==='b'?420:480,
    departure_times:[boatId==='b'?'13:00':'08:00'],meal_options:[{en:boatId==='b'?'Fish lunch':'Chicken lunch',es:'Almuerzo'}],
    package_included:[boatId==='b'?'Boat B lunch':'Boat A lunch'],description:boatId==='b'?'Boat B package description':'Boat A package description',
    boat_tours:{id:boatId+'-'+tour.id,boat_id:boatId,tour_id:tour.id,active:true,boats:{active:true,max_guests:boatId==='b'?8:10},tours:tour}});
  const packages=[makePackage('b-full','b','Full Day',1100),makePackage('b-half','b','Half Day',680),
    makePackage('a-full','a','Full Day',950),makePackage('a-half','a','Half Day',650),
    makePackage('c-invalid','c','Half Day',0),makePackage('other-half','a','Half Day',720,makeTour('other','Another Beach')),
    ...['Sunset','Fishing','Surfing','Water Toys'].map((title,i)=>makePackage('extra-'+i,'a','Half Day',800,makeTour('extra-'+i,title)))];
  const slots=[{id:'am',label:'Morning',starts_at:'08:00:00',active:true},{id:'pm',label:'Afternoon',starts_at:'13:00:00',active:true}];
  const priceRequests: Record<string,unknown>[]=[];
  const bookings: Record<string,unknown>[]=[];
  await page.addInitScript(()=>localStorage.setItem('language','en'));
  await page.route(/\/rest\/v1\//,async route=>{
    const table=new URL(route.request().url()).pathname.split('/').at(-1);
    let data: unknown=[];
    if(table==='boats')data=boats;
    if(table==='tour_packages')data=packages;
    if(table==='time_slots')data=slots;
    if(table==='departure_locations')data=[{id:'coco',name:'Playas del Coco',slug:'coco',surcharge_amount:0,currency:'USD',active:true,is_default:true}];
    if(table==='payment_methods')data=[{key:'pay-on-day',name:'Pay on the day',type:'pay_on_day',active:true}];
    await route.fulfill({json:data});
  });
  await page.route(/\/functions\/v1\//,async route=>{
    const input=route.request().postDataJSON() as Record<string,unknown>;
    const name=new URL(route.request().url()).pathname.split('/').at(-1);
    if(name==='get-booking-availability')return route.fulfill({json:{slots:slots.map(slot=>({id:slot.id,label:slot.label,time:slot.starts_at.slice(0,5),available:true}))}});
    if(name==='calculate-booking-price') {
      priceRequests.push(input);const p=packages.find(p=>p.id===input.tourPackageId)!;
      return route.fulfill({json:{base_price:p.base_price,total:p.base_price,included_guests:p.included_guests,max_guests:p.max_guests,extra_guest_price:p.extra_guest_price,extras:[],currency:'USD'}});
    }
    if(name==='create-booking') {
      bookings.push(input);
      return route.fulfill({json:{booking_id:'test-booking',booking_reference:'TEST',boat_id:input.boatId,tour_id:input.tourId,
        tour_package_id:input.tourPackageId,total_snapshot:input.boatId==='b'?1100:950,currency:'USD'}});
    }
    await route.fulfill({json:{}});
  });
  await page.route('https://wa.me/**',route=>route.fulfill({body:'Mock WhatsApp handoff'}));
  await page.goto('/tests/tour-catalog/fixture.html');
  await expect(page.getByRole('button',{name:'View tour Beach & Snorkeling',exact:true})).toBeVisible();
  return {priceRequests,bookings};
}

test('unique tours, independent boats/packages, filters and fresh modal state',async ({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await mockCatalog(page);
  const region=page.getByRole('region',{name:'Available tours'});
  await expect(region.locator('article')).toHaveCount(6);
  const card=region.locator('article').filter({has:page.getByRole('button',{name:'View tour Beach & Snorkeling',exact:true})});
  await expect(card).toContainText('650');
  await expect(card).not.toContainText('guests');
  await page.getByRole('button',{name:'View tour Beach & Snorkeling',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('button',{name:/Boat C/})).toHaveCount(0);
  await expect(dialog.getByRole('button',{name:'Reserve',exact:true})).toBeDisabled();
  await dialog.getByRole('button',{name:/Boat A Boat capacity/}).click();
  await expect(dialog).toContainText('950');await expect(dialog).not.toContainText('1.100');
  await dialog.getByRole('button',{name:/Full Day/}).click();
  await expect(dialog.getByTestId('selected-package-details')).toContainText('Boat A lunch');
  await expect(dialog.getByTestId('selected-package-details')).toContainText('8:00 AM');
  await dialog.getByRole('button',{name:/Boat B Boat capacity/}).click();
  await expect(dialog.getByTestId('selected-package-details')).toHaveCount(0);
  await expect(dialog.getByRole('button',{name:'Reserve',exact:true})).toBeDisabled();
  await expect(dialog).toContainText('680');await expect(dialog).not.toContainText('950');
  await dialog.getByRole('button',{name:/Full Day/}).click();
  const details=dialog.getByTestId('selected-package-details');
  await expect(details).toContainText('Boat B lunch');await expect(details).toContainText('7 hours');
  await expect(details).toContainText('6 guests');await expect(details).toContainText('1:00 PM');
  await expect(details).toContainText('Fish lunch');await expect(details).not.toContainText('Chicken lunch');
  await page.screenshot({path:'tmp/tour-catalog/modal-'+info.project.name+'.png',fullPage:true});
  const bounds=await dialog.boundingBox();expect(bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  await page.getByRole('button',{name:'View tour Beach & Snorkeling',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'Reserve',exact:true})).toBeDisabled();
  await expect(dialog.getByTestId('selected-package-details')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Filter tours by boat',exact:true}).click();
  await page.getByRole('menuitemradio',{name:'Boat B',exact:true}).click();
  await expect(region.locator('article')).toHaveCount(1);await expect(region).toContainText('680');
  await page.getByRole('button',{name:'View tour Beach & Snorkeling',exact:true}).click();
  await expect(dialog.getByText('Choose your boat',{exact:true})).toHaveCount(0);
  await expect(dialog.getByRole('button',{name:/Full Day/})).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Clear filter',exact:true}).click();
  await expect(region.locator('article')).toHaveCount(6);
  await page.getByRole('button',{name:'View tour Another Beach',exact:true}).click();
  await expect(dialog.getByText('Another Beach',{exact:true})).toBeVisible();
  await expect(dialog.getByRole('button',{name:/Full Day/})).toHaveCount(0);
  await page.keyboard.press('Escape');
  const next=page.getByRole('button',{name:'Next tours',exact:true});
  await next.click();await expect.poll(()=>region.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
  await page.screenshot({path:'tmp/tour-catalog/carousel-'+info.project.name+'.png',fullPage:true});
  expect(errors).toEqual([]);
});

for(const boatId of ['a','b'])test('reserve original full-day IDs from Boat '+boatId.toUpperCase(),async({page})=>{
  const {priceRequests,bookings}=await mockCatalog(page);
  await page.getByRole('button',{name:'View tour Beach & Snorkeling',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:new RegExp('Boat '+boatId.toUpperCase()+' Boat capacity')}).click();
  await dialog.getByRole('button',{name:/Full Day/}).click();
  await dialog.getByRole('button',{name:'Reserve',exact:true}).click();
  await expect.poll(()=>page.getByTestId('selection').textContent()).toBe(JSON.stringify({boatId,tourId:'beach',boatTourId:boatId+'-beach',packageId:boatId+'-full'}));
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(page.locator('input[name="tourPackage"][value="'+boatId+'-full"]')).toBeChecked();
  await expect(page.locator('input[name="timeSlot"]:checked')).toHaveValue(boatId==='a'?'am':'pm');
  await page.locator('input[name="mealOption"]').first().check({force:true});
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.locator('#booking-name').fill('Test Customer');await page.locator('#booking-email').fill('test@example.com');
  await page.locator('#booking-phone').fill('+506 8888 8888');
  await page.locator('[data-payment-method="pay-on-day"]').click();
  await page.getByRole('button',{name:'Confirm reservation',exact:true}).click();
  await expect.poll(()=>bookings.length).toBe(1);
  expect(bookings[0]).toMatchObject({boatId,tourId:'beach',tourPackageId:boatId+'-full',timeSlotId:boatId==='a'?'am':'pm',mealOption:boatId==='a'?'Chicken lunch':'Fish lunch',extras:[]});
  expect(priceRequests.some(input=>input.boatId===boatId && input.boatTourId===boatId+'-beach' && input.tourPackageId===boatId+'-full')).toBe(true);
});

test('booking parent changes clear old packages, meals and departure selection',async({page})=>{
  await mockCatalog(page);
  await page.getByRole('button',{name:'View tour Beach & Snorkeling',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:/Boat A Boat capacity/}).click();
  await dialog.getByRole('button',{name:/Full Day/}).click();await dialog.getByRole('button',{name:'Reserve',exact:true}).click();
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.locator('input[name="mealOption"]').first().check({force:true});
  // Selecting another boat through the modal updates the mounted booking panel via the shared context.
  await page.getByRole('button',{name:'View tour Beach & Snorkeling',exact:true}).click();
  await dialog.getByRole('button',{name:/Boat B Boat capacity/}).click();await dialog.getByRole('button',{name:/Full Day/}).click();
  await dialog.getByRole('button',{name:'Reserve',exact:true}).click();
  await expect(page.locator('input[name="tourPackage"][value="b-full"]')).toBeChecked();
  await expect(page.locator('input[name="tourPackage"][value="a-full"]')).toHaveCount(0);
  await expect(page.locator('input[name="mealOption"]:checked')).toHaveCount(0);
  await expect(page.locator('input[name="timeSlot"]:checked')).toHaveValue('pm');
  await expect(page.locator('#booking-guests')).toHaveValue('4');
});

test('empty package catalogs and boats without valid packages never use fallback tours',async({page})=>{
  await mockCatalog(page);
  await page.getByRole('button',{name:'Filter tours by boat',exact:true}).click();
  await page.getByRole('menuitemradio',{name:'Boat C',exact:true}).click();
  await expect(page.getByRole('region',{name:'Available tours'}).locator('article')).toHaveCount(0);
  await expect(page.getByText('No tours available for this filter.',{exact:true})).toBeVisible();
  await page.route(/\/rest\/v1\/tour_packages/,route=>route.fulfill({json:[]}));
  await page.reload();
  await expect(page.getByText('No tours available for this filter.',{exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'Available tours'}).locator('article')).toHaveCount(0);
});

test('obsolete context selections are discarded and never restored on reload', async ({page}) => {
  const {priceRequests} = await mockCatalog(page);
  await page.getByRole('button', {name:'Inject obsolete selection'}).click();
  await expect(page.getByTestId('stored-package')).toHaveText('');
  await expect(page.getByTestId('selection')).toHaveText(JSON.stringify({boatId:'a'}));
  expect(priceRequests).toHaveLength(0);
  await page.reload();
  await expect(page.getByTestId('stored-package')).toHaveText('');
  expect(priceRequests).toHaveLength(0);
});

test('a selected package removed remotely is cleared after catalog refresh', async ({page}) => {
  await mockCatalog(page);
  await page.getByRole('button',{name:'View tour Beach & Snorkeling',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:/Boat A Boat capacity/}).click();
  await dialog.getByRole('button',{name:/Full Day/}).click();
  await dialog.getByRole('button',{name:'Reserve',exact:true}).click();
  await expect(page.getByTestId('stored-package')).toHaveText('a-full');
  await page.route(/\/rest\/v1\/tour_packages/, route => route.fulfill({json:[]}));
  await page.getByRole('button',{name:'Refresh catalog'}).click();
  await expect(page.getByTestId('stored-package')).toHaveText('');
  await expect(page.getByTestId('selection')).toHaveText(JSON.stringify({boatId:'a'}));
});

test('guest changes keep the remote package and changing tour removes the previous package', async ({page}) => {
  const {priceRequests} = await mockCatalog(page);
  await page.getByRole('button',{name:'View tour Beach & Snorkeling',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:/Boat A Boat capacity/}).click();
  await dialog.getByRole('button',{name:/Full Day/}).click();
  await dialog.getByRole('button',{name:'Reserve',exact:true}).click();
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.locator('#booking-guests').fill('6');
  await expect.poll(()=>priceRequests.at(-1)?.guests).toBe(6);
  expect(priceRequests.at(-1)).toMatchObject({boatId:'a',tourId:'beach',boatTourId:'a-beach',tourPackageId:'a-full'});
  await page.getByRole('button',{name:/Another Beach From/}).click();
  await expect(page.getByTestId('stored-package')).not.toHaveText('a-full');
  await expect.poll(()=>priceRequests.at(-1)?.tourId).toBe('other');
  expect(priceRequests.at(-1)?.tourPackageId).toBe('other-half');
});

test('changing boat clears the previous tour and package before any new price request', async ({page}) => {
  const {priceRequests} = await mockCatalog(page);
  await page.getByRole('button',{name:'View tour Beach & Snorkeling',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:/Boat A Boat capacity/}).click();
  await dialog.getByRole('button',{name:/Full Day/}).click();
  await dialog.getByRole('button',{name:'Reserve',exact:true}).click();
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('button',{name:/^Boat B/}).click();
  await expect(page.getByTestId('selection')).toHaveText(JSON.stringify({boatId:'b'}));
  await expect(page.getByTestId('stored-package')).toHaveText('');
  expect(priceRequests.filter(input=>input.boatId==='b')).toHaveLength(0);
});
