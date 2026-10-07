import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
// tourCatalog.ts imports ./packageRequirements at runtime, and a data: module has no base URL to resolve a relative
// specifier against. So each source file is transpiled to its own data: module and the relative import is pointed at it.
const toDataModule = async (file, replacements = {}) => {
  let js = ts.transpileModule(await readFile(new URL('../../src/utils/' + file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  for (const [specifier, url] of Object.entries(replacements)) {
    // TypeScript keeps the original quote style, so match either one.
    const quoted = [`'${specifier}'`, `"${specifier}"`].find((candidate) => js.includes(candidate));
    assert.ok(quoted, `expected the import ${specifier} in ${file}`);
    js = js.replace(quoted, () => JSON.stringify(url));
  }
  return 'data:text/javascript;base64,' + Buffer.from(js).toString('base64');
};
const requirementsUrl = await toDataModule('packageRequirements.ts');
const { groupTourCatalog } = await import(await toDataModule('tourCatalog.ts', { './packageRequirements': requirementsUrl }));
const boats = [{id:'a'}, {id:'b'}, {id:'c'}];
// A package is only offered when it is complete (utils/packageRequirements.ts: name, duration, departure time, price,
// guests, extra guest price), so the base fixture is a complete package and each case overrides what makes it invalid.
const make = (id,boatId,price,rest={}) => ({id,boatId,boatTourId:boatId+'-tour',tourId:'tour',name:'Package '+id,basePrice:price,customQuote:false,
  includedGuests:2,maxGuests:6,extraGuestPrice:0,duration:4,timeSlots:[{id:'am',label:'Morning',time:'08:00'}],...rest});
const input = [make('b-full','b',1100),make('b-half','b',680),make('a-full','a',950),make('a-half','a',650),
  make('other','a',700,{tourId:'other',category:'Beach'}),make('inactive','c',1,{catalogActive:false}),
  make('no-price','c',null),make('invalid','c',NaN),make('infinite','c',Infinity),make('negative','c',-10),make('zero','c',0),
  make('quote','c',100,{customQuote:true}),make('no-hours','c',100,{timeSlots:[]}),make('no-duration','c',100,{duration:undefined}),make('orphan','missing',1),make('no-id','a',1,{tourId:undefined})];
const groups=groupTourCatalog(input,boats);
assert.equal(groups.length,2);
assert.equal(groups[0].fromPrice,650);
assert.equal(groups[0].boatOptions.length,2);
assert.deepEqual(groups[0].boatOptions[0].packages.map(p=>p.id),['b-full','b-half']);
assert.equal(groups[0].boatOptions[0].packages[0],input[0]);
assert.equal(groupTourCatalog([...input].reverse(),boats).find(g=>g.tourId==='tour').fromPrice,650);
assert.equal(groupTourCatalog(input.filter(p=>p.boatId==='b'),boats)[0].fromPrice,680);
assert.equal(groupTourCatalog(input.filter(p=>p.boatId==='c'),boats).length,0);
assert.equal(groupTourCatalog([input[0],input[0]],boats)[0].boatOptions[0].packages.length,1);
assert.equal(groupTourCatalog([make('x','a',650),make('y','a',680,{boatTourId:'another-link'})],boats)[0].boatOptions.length,2);
assert.deepEqual(groupTourCatalog([],boats),[]);

// Admin's Tours reorder writes tours.sort_order; the public catalog must
// follow it even when the underlying packages arrive in a different order
// (tour_packages.sort_order, which drove Map insertion order before this fix).
const orderInput = [
  make('t2-full', 'a', 500, { tourId: 'tour-2', tourSortOrder: 2 }),
  make('t1-full', 'b', 500, { tourId: 'tour-1', tourSortOrder: 1 }),
];
assert.deepEqual(groupTourCatalog(orderInput, boats).map((g) => g.tourId), ['tour-1', 'tour-2']);

console.log('Tour grouping, independent identities, invalid prices, filtered catalogs and tourSortOrder respected passed.');
