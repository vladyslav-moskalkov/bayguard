import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {seed} from '../engine.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read=p=>JSON.parse(readFileSync(resolve(root,p),'utf8'));
const save=(p,x)=>writeFileSync(resolve(root,p),JSON.stringify(x,null,2)+'\n');
for(const p of ['workflows','data'])mkdirSync(resolve(root,p),{recursive:true});
let w=read('output/BayGuard_Telegram_Private.json');
const aliases={'Extract Telegram identity':'Telegram identity','Private test configuration':'Private test settings'};
w=JSON.parse(Object.entries(aliases).reduce((s,[a,b])=>s.replaceAll(a,b),JSON.stringify(w)));
const notes=read('docs/node-notes-en.json');
const positions={
  'Telegram — messages and buttons':[0,180], 'Telegram identity':[200,180],
  'Private test settings':[400,180], 'Private tester only':[600,180],
  'Read appointment state':[800,180], 'Availability + booking rules':[1000,180],
  'Commit only if revision unchanged':[1200,180], 'Our commit succeeded':[1400,180],
  'Verified delivery context':[1600,180], 'Messages to send':[1800,180],
  'One recipient per message':[1800,420], 'Live delivery and tester allowlist':[1600,420],
  'Telegram — reply with inline buttons':[1400,420], 'Preview only — nothing sent':[1600,600],
  'Storage smoke test PASSED':[1800,600], 'No confirmation after storage conflict':[1200,420],
  'Button needs acknowledgement':[600,420], 'Telegram — acknowledge button':[800,420],
  'Ignore non-test users':[400,420], 'Manual — storage smoke test':[0,-20],
  'Synthetic event — NO messages':[200,-20], 'Every minute — expire offers':[0,420],
  'Trusted expiry event':[200,420]
};
for(const n of w.nodes){
  if(positions[n.name])n.position=positions[n.name];
  if(notes[n.name]){n.notes=notes[n.name];n.notesInFlow=false;}
  delete n.credentials;
}
const sticky=w.nodes.filter(n=>n.type.endsWith('.stickyNote'));
const headings=[
 ['01 / INTAKE & IDENTITY','Telegram messages + inline buttons.\nOwner-only private test; configure your tester ID.\nDelivery OFF by default. Separate manual check and timer.',[-80,-270],620,5],
 ['02 / RESERVE BEFORE CONFIRMING','Service duration · bay capability · consent · exclusive holds.\nRead state → deterministic rules → conditional commit → verify.\nNormal offer lifetime: 10 minutes. Expiry scheduler OFF.',[590,-270],710,4],
 ['03 / TARGETED RECOVERY, NOT A BROADCAST','One opening → one eligible customer → one private offer.\nQuote value ≠ collected revenue. No payment integration.\nIndependent engineering prototype; hardening required.',[1350,-270],640,6]
];
sticky.forEach((n,i)=>{const [h,t,p,width,color]=headings[i];n.position=p;n.parameters={content:'## '+h+'\n'+t,width,height:190,color};});
w.name='BayGuard — Telegram booking + waitlist (configure before use)';
w.active=false;
save('workflows/bayguard-telegram.json',w);
const lab=read('output/BayGuard_Acceptance_Lab.json');
const last=lab.nodes.find(n=>n.name==='Evidence + modeled economics');
last.parameters.jsCode=last.parameters.jsCode
  .replace('Core acceptance lab only. No durable database or Telegram delivery connected. No production concurrency claim.','Synthetic kernel acceptance lab; transport and storage are tested separately. No production concurrency claim.')
  .replace('Postgres compare-and-swap commit + outbox delivery; only then connect live chat.','Private Telegram integration exists separately. Production gates: concurrency stress, durable outbox/reconciliation, retention and monitoring.')
  .replace('Postgres compare-and-swap commit + outbox delivery; only then connect live chat.','Production concurrency and delivery hardening required.');
for(const n of lab.nodes.filter(n=>n.type.endsWith('.stickyNote'))){
 n.parameters.content=n.parameters.content.replace('persist state with Postgres CAS/version check; enqueue outbox only after commit','stress-test conditional state persistence; add a durable delivery outbox');
}
save('workflows/bayguard-acceptance-lab.json',lab);
const csvCell=x=>'"'+String(x).replaceAll('"','""')+'"';
writeFileSync(resolve(root,'data/BayGuard_State.csv'),'scope,revision,commit_token,state_json\nbayguard_demo,0,seed,'+csvCell(JSON.stringify(seed()))+'\n');
save('data/test-summary.json',{
 kernelAssertions:read('output/local-test-results.json').checksPassed,
 adapterAssertions:read('output/bot-adapter-test-results.json').checksPassed,
 scope:'Reproducible synthetic offline checks. Private live testing is described separately in docs/validation.md.'
});
console.log('Portable workflows and empty state seed generated. No credentials or live state included.');
writeFileSync(resolve(root,'docs/nodes.md'),'# Workflow node guide\n\nNative integrations own transport and storage. The single Code node owns deterministic business and conversation rules. All node labels and in-editor notes are English.\n\n'+Object.entries(notes).map(([name,note],i)=>'## '+(i+1)+'. '+name+'\n\n'+note+'\n').join('\n')+'\nThe three colored sticky notes separate intake/identity, state-before-confirmation and targeted recovery. The screenshot documents the original private integration; exported safe defaults intentionally differ: credentials removed, IDs replaced and delivery disabled.\n');
