import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {seed} from '../engine.mjs';
import {handleBot} from '../bot_adapter.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const text=p=>readFileSync(resolve(root,p),'utf8');
const json=p=>JSON.parse(text(p));
const w=json('workflows/bayguard-telegram.json');
const lab=json('workflows/bayguard-acceptance-lab.json');
const summary=json('data/test-summary.json');
assert.equal(summary.kernelAssertions,41);assert.equal(summary.adapterAssertions,33);
for(const workflow of [w,lab]){
 assert.equal(workflow.active,false);assert.deepEqual(workflow.pinData,{});
 const names=new Set(workflow.nodes.map(n=>n.name));
 assert.equal(names.size,workflow.nodes.length);
 assert.equal(new Set(workflow.nodes.map(n=>n.id)).size,workflow.nodes.length);
 for(const [name,conns] of Object.entries(workflow.connections)){
  assert.ok(names.has(name));
  for(const branch of conns.main||[])for(const target of branch||[])assert.ok(names.has(target.node));
 }
 for(const n of workflow.nodes){
  assert.ok(!n.credentials);assert.ok(!n.webhookUrl);
  for(const match of JSON.stringify(n.parameters).matchAll(/\$\(['"]([^'"]+)['"]\)/g))assert.ok(names.has(match[1]),match[1]);
 }
}
assert.equal(w.nodes.length,26);
const find=name=>{const n=w.nodes.find(n=>n.name===name);assert.ok(n,name);return n;};
assert.equal(find('Every minute — expire offers').disabled,true);
const fields=find('Private test settings').parameters.assignments.assignments;
assert.equal(fields.find(x=>x.name==='deliveryEnabled').value,false);
assert.equal(fields.find(x=>x.name==='offerMinutes').value,10);
assert.equal(fields.find(x=>x.name==='allowedUserId').value,'0');
const trigger=find('Telegram — messages and buttons');
assert.equal(trigger.typeVersion,1.5);
assert.deepEqual(trigger.parameters.additionalFields,{userIds:'0',chatIds:'0'});
for(const n of w.nodes.filter(n=>n.type.endsWith('.dataTable'))){assert.equal(n.parameters.dataTableId.value,'REPLACE_WITH_DATA_TABLE_ID');assert.equal(n.parameters.matchType,'allConditions');}
for(const n of w.nodes.filter(n=>!n.type.endsWith('.stickyNote')))assert.ok(n.notes?.length>20);
const send=find('Telegram — reply with inline buttons');
assert.equal(typeof send.parameters.inlineKeyboard,'object');
assert.equal(send.parameters.inlineKeyboard.rows.flatMap(r=>r.row.buttons).length,4);
const code=w.nodes.filter(n=>n.type.endsWith('.code'));assert.equal(code.length,1);
const run=ctx=>new Function('$input','$','$execution',code[0].parameters.jsCode)(
 {all:()=>[{json:{id:1,revision:0,state_json:JSON.stringify(seed())}}]},
 name=>{assert.equal(name,'Private test settings');return {first:()=>({json:ctx})};}, {id:'offline_probe'});
const base={source:'test',userId:'10001',chatId:'10001',privateChat:true,eventId:'probe_check',command:'probe',now:'2026-10-20T08:00:00.000Z',offerMinutes:10,deliveryEnabled:false,allowedUserId:'0'};
assert.equal(run(base)[0].json.resultCode,'STORAGE_PROBE');
assert.equal(run({...base,source:'telegram',command:'services'})[0].json.messages[0].buttons.length,4);
assert.deepEqual(run({...base,source:'timer'}),[]);
assert.equal(handleBot(seed(),base).code,'STORAGE_PROBE');
assert.ok(!seed().bookings.length&&!seed().waitlist.length&&!seed().offers.length);
assert.ok(text('data/BayGuard_State.csv').startsWith('scope,revision,commit_token,state_json\n'));
let current={};
for(const n of lab.nodes.filter(n=>n.type.endsWith('.code')))current=new Function('$input',n.parameters.jsCode)({first:()=>({json:current})})[0].json;
assert.equal(current.checksPassed,41);assert.equal(current.checksFailed,0);
// No active-instance metadata, token-shaped strings, customer records or private exports.
const ignored=new Set(['.git','node_modules','output']);
const walk=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>ignored.has(e.name)?[]:e.isDirectory()?walk(resolve(p,e.name)):[resolve(p,e.name)]);
for(const file of walk(root).filter(p=>!p.endsWith('.jpg'))){
 const s=readFileSync(file,'utf8');
 assert.ok(!/\/Users\/|https?:\/\/[^\s"']*syntralabs|"credentials"\s*:|"instanceId"\s*:|"versionId"\s*:|\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/.test(s),'Unexpected private material: '+relative(root,file));
}
// Rebuild determinism includes committed workflows, seed, generated notes and summary.
const generated=['workflows/bayguard-telegram.json','workflows/bayguard-acceptance-lab.json','data/BayGuard_State.csv','data/test-summary.json','docs/nodes.md'];
const before=generated.map(text);
execFileSync(process.execPath,['build_workflow.mjs'],{cwd:root,stdio:'pipe'});
execFileSync(process.execPath,['build_bot.mjs'],{cwd:root,stdio:'pipe'});
execFileSync(process.execPath,['scripts/package.mjs'],{cwd:root,stdio:'pipe'});
generated.forEach((p,i)=>assert.equal(text(p),before[i],'Non-reproducible file: '+p));
console.log('PASS: 41 kernel + 33 adapter assertions; import structure, safe defaults, compiled code, no private metadata, deterministic rebuild.');
