// Uses an externally installed Playwright; adds no application dependency.
// PLAYWRIGHT_MODULE may point to playwright/index.mjs. Never reads local credentials.
import { pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const phase = process.argv[2] || 'after';
const out = `docs/redesign/${phase}`;
await fs.mkdir(out, { recursive: true });
const art = (i) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="480"><rect width="320" height="480" fill="${['#263b6a','#4a235a','#167d77','#7d4e24'][i%4]}"/><circle cx="160" cy="180" r="100" fill="white" opacity=".12"/><text x="25" y="400" fill="white" font-size="28">FIXTURE ${i}</text></svg>`)}`;
const movies = Array.from({length:125},(_,i)=>({id:`m${i}`,name:i===7?'A very long fixture movie title that must remain readable when selected without stretching the card':'Fixture Movie '+i,categoryId:i%2?'drama':'family',poster:i===2?'/missing-fixture-art.jpg':i===3?undefined:art(i),year:'2025',rating:i%3?'8.1':undefined,description:i%2?'A representative fixture description for browser validation.':undefined,extension:'mp4'}));
const series = Array.from({length:32},(_,i)=>({...movies[i],id:`s${i}`,name:'Fixture Series '+i}));
const channels = Array.from({length:25},(_,i)=>({id:`c${i}`,name:'Fixture Channel '+i,categoryId:'news',number:i+1,logo:art(i),extension:'m3u8'}));
const episodes = [{id:'e1',name:'Fixture Pilot',season:1,episode:1},{id:'e2',name:'Fixture Crossing',season:1,episode:2}];
const history = [{type:'series',id:'e1',item:episodes[0],series:series[0],position:120,duration:2400,watchedAt:2},{type:'movie',id:'m0',item:movies[0],position:600,duration:5400,watchedAt:1}];
const favorites = [{type:'movie',id:'m1',item:movies[1],addedAt:1}];
const browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'chrome',headless:true});
const report = {source:'Synthetic fixtures; no real provider data or television',phase,browser:browser.version(),viewports:[],journeys:{},errors:[]};
try {
for (const width of [1280,1920]) {
 const page = await browser.newPage({viewport:{width,height:width*9/16}});
 page.on('pageerror',e=>report.errors.push(e.message));
 const calls=[];
 await page.route('**/api/**', async route=>{
  const u=new URL(route.request().url()); const p=u.pathname;
  if (!p.startsWith('/api/')) { await route.continue(); return; }
  calls.push(p+u.search);
  let data;
  const list=(rows,size)=>{const filtered=rows.filter(x=>(!u.searchParams.get('category_id')||x.categoryId===u.searchParams.get('category_id'))&&x.name.toLowerCase().includes((u.searchParams.get('search')||'').toLowerCase()));const offset=+(u.searchParams.get('offset')||0);const limit=+(u.searchParams.get('limit')||size);return {items:filtered.slice(offset,offset+limit),total:filtered.length,offset,limit};};
  if(p==='/api/status') data={configured:true,demoMode:true,language:'en',languageConfigured:true,autoplayLive:false};
  else if(p==='/api/history') data=history;
  else if(p==='/api/favorites') data=favorites;
  else if(p.endsWith('/categories')||p.includes('/categories/')) data=p.includes('live')?[{id:'news',name:'Fixture News'}]:[{id:'drama',name:'Fixture Drama'},{id:'family',name:'Fixture Family'}];
  else if(p==='/api/xtream/vod') data=list(movies,60);
  else if(p==='/api/xtream/series') data=list(series,60);
  else if(p==='/api/xtream/streams/live') data=list(channels,20);
  else if(p==='/api/live/selection') data={channel:channels[0],offset:0,channels:channels.slice(0,20)};
  else if(p.startsWith('/api/xtream/vod/')) data=movies.find(x=>x.id===p.split('/').pop());
  else if(p.startsWith('/api/xtream/series/')) data={item:series.find(x=>x.id===p.split('/').pop()),episodes};
  else if(p.startsWith('/api/epg/')) {const now=Date.now();data=p.endsWith('c2')?{progress:0}:{current:{title:'Fixture Current',start:now-600000,end:now+1200000,description:'Fixture programme description.'},next:{title:'Fixture Next',start:now+1200000,end:now+3000000},progress:33};}
  else if(p.startsWith('/api/play/')) { await route.fulfill({status:404,body:'Fixture: no media'});return; }
  else data={};
  await route.fulfill({json:data});
 });
 await page.goto(process.env.BROWSER_URL||'http://localhost:5173');
 await page.locator('.home-card').first().waitFor(); await page.waitForTimeout(250);
 const homeCards=await page.locator('.poster-card').count();
 const initialHomeCalls=[...calls];
 await page.evaluate(()=>{
   window.focusSamples=[]; let start;
   document.addEventListener('keydown',()=>{start=performance.now();},true);
   document.addEventListener('focusin',()=>{if(start!==undefined){const from=start;start=undefined;requestAnimationFrame(()=>window.focusSamples.push(performance.now()-from));}});
 });
 const snap=async name=>page.screenshot({path:`${out}/${name}-${width}.png`});
 await snap('home');
 const focusVisible=()=>page.evaluate(()=>{
   const e=document.activeElement,r=e?.getBoundingClientRect();const clippedBy=[];
   for(let parent=e?.parentElement;parent;parent=parent.parentElement){
     const style=getComputedStyle(parent),p=parent.getBoundingClientRect();
     if((/auto|scroll|hidden/.test(style.overflowX)&&(r.left<p.left-1||r.right>p.right+1))||(/auto|scroll|hidden/.test(style.overflowY)&&(r.top<p.top-1||r.bottom>p.bottom+1))) clippedBy.push(parent.className);
   }
   return {text:e?.textContent?.slice(0,160),outline:e?getComputedStyle(e).outlineWidth:undefined,clippedBy,visible:!!r&&r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&!clippedBy.length};
 });
 const key=async k=>{await page.keyboard.press(k);await page.waitForTimeout(90);};
 // Same fixture targets and starting focus for before and after.
 await key('ArrowRight'); await key('Enter'); await page.locator('.poster-card').first().waitFor(); await page.waitForTimeout(150);
 // Initial catalog focus is All categories; Right enters its first card.
 await key('ArrowRight'); await key('Enter'); await page.locator('.detail-copy').waitFor();
 report.journeys.movie={keys:4,path:'Home Live → Right, OK, Right, OK → first movie details'};
 await key('Escape'); await page.locator('.poster-card').first().waitFor(); await page.waitForTimeout(150);
 const restored=await focusVisible();
 await snap('movies');
 if(phase==='after') {
  // Traverse enough cards to exercise horizontal scrolling, then details/Back.
  for(let i=0;i<10;i++) await key('ArrowRight');
  await key('ArrowDown');
  assert.equal((await focusVisible()).visible,true,'Focus visible after moving into a vertically off-screen row');
  for(let i=0;i<3;i++) await key('ArrowRight');
  const before=await page.evaluate(()=>({text:document.activeElement.textContent,scroll:[...document.querySelectorAll('[data-scroll-key]')].map(x=>[x.dataset.scrollKey,x.scrollLeft,x.scrollTop])}));
  await key('Enter'); await page.locator('.detail-copy').waitFor(); await key('Escape'); await page.locator('.poster-card').first().waitFor();await page.waitForTimeout(180);
  const after=await page.evaluate(()=>({text:document.activeElement.textContent,scroll:[...document.querySelectorAll('[data-scroll-key]')].map(x=>[x.dataset.scrollKey,x.scrollLeft,x.scrollTop])}));
  report.journeys.scrollRestoration={before,after,keysForReturn:1,passed:JSON.stringify(before)===JSON.stringify(after)};
  assert.deepEqual(after,before,'Exact horizontal/vertical scroll and selected item after Back');
  assert.equal((await focusVisible()).visible,true,'Restored focus must also be inside its clipping ancestors');
 }
 await key('Escape'); await page.locator('.home-card').first().waitFor();await page.waitForTimeout(180);
 // Back restored Movies shortcut.
 await key('ArrowRight');await key('Enter');await page.locator('.poster-card').first().waitFor();await page.waitForTimeout(150);await key('ArrowRight');await snap('series');await key('Enter');await page.locator('.series-hero').waitFor();
 report.journeys.series={keys:4,path:'Home Movies → Right, OK, Right, OK → first series details'};
 await key('Escape');await page.locator('.poster-card').first().waitFor();await key('Escape');await page.locator('.home-card').first().waitFor();await page.waitForTimeout(180);
 // Home Series is restored. Move to Live and inspect channel 1.
 await key('ArrowLeft');await key('ArrowLeft');await key('Enter');await page.locator('.channel-row').first().waitFor();await page.waitForTimeout(180);await key('ArrowDown');await page.waitForTimeout(180);
 await snap('live');
 report.journeys.live={keys:4,path:'Home Series → Left, Left, OK, Down → channel 1 now/next',epg:await page.locator('.epg-panel').innerText()};
 assert.match(report.journeys.live.epg,/Fixture Next/);
 const liveFocus=await focusVisible();
 if(phase==='after') {
   await key('ArrowDown');await page.waitForTimeout(160);
   const pane=await page.locator('.epg-panel').innerText();
   assert.match(pane,/No programme information/);
   assert.equal(await page.locator('.epg-panel .progress').count(),0);
   await snap('live-no-epg');
 }
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 assert.equal(restored.visible,true);assert.equal(liveFocus.visible,true);assert.equal(overflow,false);
 const samples=await page.evaluate(()=>window.focusSamples);
 report.viewports.push({width,restored,liveFocus,homeCards,initialHomeCalls,overflow,desktopKeyToNextFrameMs:{samples:samples.length,max:Math.max(...samples),median:[...samples].sort((a,b)=>a-b)[Math.floor(samples.length/2)]}});
 // A fresh Home start makes the resume comparison independent of previous routes.
 await page.goto(process.env.BROWSER_URL||'http://localhost:5173');await page.locator('.home-card').first().waitFor();await page.waitForTimeout(250);
 await key('ArrowDown');
 if(phase==='before') {await key('ArrowRight');await key('Enter');await page.locator('.recent-row').first().waitFor();await page.waitForTimeout(150);}
 await key('Enter');await page.locator('video').waitFor();
 await page.waitForFunction(()=>document.querySelector('video')?.src.includes('/api/play/series/e1'));
 report.journeys.resume={keys:phase==='before'?4:2,path:phase==='before'?'Home Live → Down, Right, OK, OK → episode e1 requested':'Home Live → Down, OK → episode e1 requested',src:await page.locator('video').getAttribute('src'),limitation:'Fixture media intentionally returns 404; successful decoding is not tested. Saved position and next-episode behavior are covered by Vitest.'};
 await key('Escape');await page.waitForTimeout(200);
 if(phase==='after') {assert.equal((await focusVisible()).visible,true);assert.match((await focusVisible()).text,/S01E01/);}
 await page.close();
}
} finally {await browser.close();await fs.writeFile(`${out}/results.json`,JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
if(report.errors.length) process.exitCode=1;
