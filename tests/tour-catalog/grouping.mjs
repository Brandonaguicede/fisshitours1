import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../../src/utils/tourCatalog.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const { groupTourCatalog } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const boats = [{id:'a'}, {id:'b'}, {id:'c'}];
const make = (id,boatId,price,rest={}) => ({id,boatId,boatTourId:boatId+'-tour',tourId:'tour',basePrice:price,customQuote:false,timeSlots:[{id:'am'}],...rest});
const input = [make('b-full','b',1100),make('b-half','b',680),make('a-full','a',950),make('a-half','a',650),
  make('other','a',700,{tourId:'other',category:'Beach'}),make('inactive','c',1,{catalogActive:false}),
  make('no-price','c',null),make('invalid','c',NaN),make('infinite','c',Infinity),make('negative','c',-10),make('zero','c',0),
  make('quote','c',100,{customQuote:true}),make('no-hours','c',100,{timeSlots:[]}),make('orphan','missing',1),make('no-id','a',1,{tourId:undefined})];
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
console.log('Tour grouping, independent identities, invalid prices and filtered catalogs passed.');
