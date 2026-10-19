import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
const core=readFileSync(join(root,'engine.mjs'),'utf8').replace(/^export /gm,'');
const helper=`
const input=$input.first().json;
const checks=input.checks||[];
function check(ok,label) { checks.push({label,passed:!!ok}); if(!ok) throw new Error('ASSERTION: '+label); }
function event(id,type,actorId,data={},now='2026-10-20T08:00:00Z',role='customer') { return {id,type,actor:{id:actorId,role},data,now}; }
function run(s,e) {return transition(s,e);}
`;
const stages=[
 ['Configuration + synthetic records',`return [{json:{state:seed(),checks:[],scenario:{monthlyAppointments:120,cancelRate:0.15,eligibleShare:2/3,fillRate:0.5,averageTicketAed:350,variableCostAed:100,monthlyOpsAed:200,manualRequests:200,manualMinutes:6,automatedMinutes:2,loadedHourlyCostAed:50},scope:'Independent engineering project. Synthetic records; no customer messages and no payment collection.'}}];`],
 ['Validate time + bay capacity',`
let s=input.state;
const req=event('initial','reserve','original',{serviceId:'interior',start:'2026-10-21T08:00:00Z'});
let r=run(s,req); check(r.result.code==='BOOKED','Valid booking accepted');s=r.state;
r=run(s,{...req,now:'2026-10-20T08:01:00Z'});check(r.result.replayed&&r.state.bookings.length===1&&r.notifications.length===0,'Replay does not duplicate booking or message');
r=run(s,{...req,data:{...req.data,serviceId:'ceramic'}});check(r.result.code==='IDEMPOTENCY_CONFLICT','Changed payload cannot reuse event ID');
r=run(s,event('overlap','reserve','other',{serviceId:'interior',start:'2026-10-21T08:30:00Z'}));check(r.result.code==='NO_CAPACITY','Overlapping bay reservation rejected');
r=run(s,event('adjacent','reserve','adjacent',{serviceId:'interior',start:'2026-10-21T09:30:00Z'}));check(r.result.code==='BOOKED','Adjacent appointments allowed');
r=run(s,event('other_bay','reserve','other_bay',{serviceId:'wash',start:'2026-10-21T08:00:00Z'}));check(r.result.code==='BOOKED','Different suitable bay can run concurrently');
for(const [key,start,service,expected] of [['past','2026-10-19T08:00:00Z','interior','PAST_SLOT'],['closed','2026-10-21T02:00:00Z','wash','OUTSIDE_OPEN_HOURS'],['closing','2026-10-21T16:00:00Z','ceramic','OUTSIDE_OPEN_HOURS'],['long','2026-12-01T08:00:00Z','wash','OUTSIDE_HORIZON'],['timezone','2026-10-21T12:00:00+04:00','wash','UTC_ISO_REQUIRED'],['service','2026-10-21T08:00:00Z','unknown','UNKNOWN_SERVICE']]) {
  r=run(s,event(key,'reserve','customerX',{serviceId:service,start}));check(r.result.code===expected,'Validation: '+key);
}
return [{json:{...input,state:s,checks}}];`],
 ['Waitlist + explicit consent',`
let s=input.state;
const availability={earliest:'2026-10-21T08:00:00Z',latest:'2026-10-21T12:00:00Z',consent:true};
let r=run(s,event('no_consent','join_waitlist','no_consent',{...availability,serviceId:'interior',consent:false}));check(r.result.code==='CONSENT_REQUIRED','No marketing/waitlist offer without opt-in');
for(const [key,service] of [['too_long','ceramic'],['wrong_bay','wash'],['candidate_A','interior'],['candidate_B','interior']]) {
  r=run(s,event('join_'+key,'join_waitlist',key,{...availability,serviceId:service}));check(r.result.code==='WAITLISTED','Joined: '+key);s=r.state;
}
r=run(s,event('duplicate_join','join_waitlist','candidate_A',{...availability,serviceId:'interior'}));check(r.result.code==='ALREADY_WAITLISTED','Duplicate active waitlist entry rejected');
let withdrawn=run(s,event('withdraw','withdraw_consent','candidate_A'));check(withdrawn.state.waitlist.find(x=>x.customerId==='candidate_A').consent===false,'Consent withdrawal is supported');
return [{json:{...input,state:s,checks}}];`],
 ['Cancel + open recovery window',`
let s=input.state;
let r=run(s,event('wrong_cancel','cancel','stranger',{bookingId:'bk_initial'}));check(r.result.code==='BOOKING_NOT_OWNED','Another customer cannot cancel a booking');
r=run(s,event('cancel_initial','cancel','original',{bookingId:'bk_initial'}));check(r.result.code==='CANCELLED','Owner cancellation opens the window');s=r.state;
check(metrics(s).quotedRecoveredBookingValueAed===0,'Cancellation is not counted as recovered value');
return [{json:{...input,state:s,checks}}];`],
 ['Fit-aware match + exclusive hold',`
let s=input.state;
let r=run(s,event('untrusted_offer','offer_next','stranger',{cancelledBookingId:'bk_initial'}));check(r.result.code==='STAFF_OR_TIMER_ONLY','Customer cannot impersonate the offer scheduler');
r=run(s,event('offer_first','offer_next','scheduler',{cancelledBookingId:'bk_initial'},undefined,'timer'));
check(r.result.code==='OFFERED'&&r.result.customerId==='candidate_A','Skips too-long services and incompatible bay; selects eligible FIFO customer');
check(r.notifications.length===1,'Offer is targeted, not broadcast');s=r.state;
r=run(s,event('offer_duplicate','offer_next','scheduler',{cancelledBookingId:'bk_initial'},undefined,'timer'));check(r.result.code==='WINDOW_ALREADY_ALLOCATED','No second active offer for same cancellation');
r=run(s,event('during_hold','reserve','outsider',{serviceId:'interior',start:'2026-10-21T08:00:00Z'}));check(r.result.code==='NO_CAPACITY','Temporary hold blocks competing reservation');
r=run(s,event('stolen_claim','claim_offer','outsider',{offerId:'offer_offer_first'}));check(r.result.code==='OFFER_NOT_OWNED','Offer belongs only to selected customer');
return [{json:{...input,state:s,checks}}];`],
 ['Expiry + next eligible customer',`
let s=input.state;
let r=run(s,event('late_accept','claim_offer','candidate_A',{offerId:'offer_offer_first'},'2026-10-20T08:10:00Z'));check(r.result.code==='OFFER_NOT_ACTIVE','Acceptance at exact TTL boundary is rejected');
r=run(s,event('expiry_tick','tick','scheduler',{},'2026-10-20T08:10:00Z','timer'));s=r.state;
check(s.bookings.find(x=>x.id==='hold_offer_first').status==='expired','Expired hold releases capacity');
r=run(s,event('offer_second','offer_next','scheduler',{cancelledBookingId:'bk_initial'},'2026-10-20T08:11:00Z','timer'));
check(r.result.code==='OFFERED'&&r.result.customerId==='candidate_B','Expiry advances to the next eligible customer; no repeat offer');s=r.state;
const s2=run(s,event('withdraw_active','withdraw_consent','candidate_B',{},'2026-10-20T08:12:00Z')).state;
check(s2.offers.find(x=>x.id==='offer_offer_second').status==='withdrawn','Withdrawal revokes an active offer and hold');
return [{json:{...input,state:s,checks}}];`],
 ['Accept + replay guard',`
let s=input.state;
const claim=event('accept_second','claim_offer','candidate_B',{offerId:'offer_offer_second'},'2026-10-20T08:12:00Z');
let r=run(s,claim);check(r.result.code==='RECOVERED_BOOKING','Valid acceptance confirms the recovered appointment');s=r.state;
r=run(s,{...claim,now:'2026-10-20T08:13:00Z'});check(r.result.replayed&&r.notifications.length===0,'Duplicate callback cannot duplicate confirmation');
r=run(s,event('repeat_new_id','claim_offer','candidate_B',{offerId:'offer_offer_second'},'2026-10-20T08:13:00Z'));check(r.result.code==='OFFER_NOT_ACTIVE','New event ID cannot reclaim the same offer');
r=run(s,event('fake_payment','record_payment','candidate_B',{},'2026-10-20T08:13:00Z'));check(r.result.code==='PAYMENT_ADAPTER_NOT_CONNECTED','No customer-generated payment claim can create revenue');
const m=metrics(s);check(m.confirmedRecoveredAppointments===1&&m.quotedRecoveredBookingValueAed===350&&m.cashReceivedAed===null,'Recovered quote is separate from cash received');
return [{json:{...input,state:s,checks,observedSyntheticRun:m}}];`],
 ['Evidence + modeled economics',`
const economics=economicScenario(input.scenario);
check(economics.expectedRecoveredAppointments===6,'Economic model: six expected recovered bookings under assumptions');
check(economics.modeledContributionAfterOpsAed===1300,'Economic model subtracts variable costs and recurring operations');
check(Math.abs(economics.modeledFreedAdminHours-13.333333333333334)<0.00001,'Time model is calculated from stated request volumes');
check(economics.laborCashSavingAed===null&&economics.doNotAddLaborValueToCashProfit,'Freed staff time is not automatically cash saved');
return [{json:{project:'BayGuard',kernelVersion:VERSION,checksPassed:checks.filter(x=>x.passed).length,checksFailed:checks.filter(x=>!x.passed).length,checks,syntheticRun:input.observedSyntheticRun,scenarioInputs:input.scenario,illustrativeEconomics:economics,deploymentStatus:'Core acceptance lab only. No durable database or Telegram delivery connected. No production concurrency claim.',nextGate:'Postgres compare-and-swap commit + outbox delivery; only then connect live chat.'}}];`],
];
const nodes=[{parameters:{},type:'n8n-nodes-base.manualTrigger',typeVersion:1,position:[-920,80],id:'bayguard-manual',name:'Run acceptance suite'}];
for(let i=0;i<stages.length;i++)nodes.push({parameters:{jsCode:core+'\n'+helper+'\n'+stages[i][1]},type:'n8n-nodes-base.code',typeVersion:2,position:[-660+i*300,80],id:'bayguard-step-'+i,name:stages[i][0]});
const notes=[
 {name:'Scope',x:-1000,y:-350,width:890,content:'## BAYGUARD / Detailing appointment recovery\nSynthetic acceptance lab • Dubai business scenario • no client deployment claimed\n\n**Business rule:** fit the service duration and bay capability before offering a cancellation. One targeted hold, not a broadcast.\n\nNo Telegram messages, credentials, personal customer data or payments in this workflow.'},
 {name:'Safety',x:30,y:-350,width:980,content:'## CAPACITY → CONSENT → EXPIRY → ACCEPTANCE\nCustomer identity must come from the authenticated channel. Only trusted staff/timer events may allocate offers.\n\n**Production gate:** persist state with Postgres CAS/version check; enqueue outbox only after commit. This sequential test suite does not prove database-level concurrency.'},
 {name:'Economics',x:1180,y:-350,width:760,content:'## EVIDENCE, NOT INVENTED RESULTS\nOne recovered appointment in synthetic records ≠ a real sale.\n\nModel inputs: 120 appointments × 15% cancellations × 2/3 eligible × 50% filled = 6 expected recoveries.\n6 × (AED 350 − AED 100 variable cost) − AED 200 operations = AED 1,300 modeled contribution.\nFreed admin time is capacity, not automatically cash savings.'},
];
for(const[n,z]of notes.entries())nodes.push({parameters:{content:z.content,height:330,width:z.width,color: n===2?4:5},type:'n8n-nodes-base.stickyNote',typeVersion:1,position:[z.x,z.y],id:'bayguard-note-'+n,name:z.name});
const connections={};const line=nodes.filter(n=>n.type!=='n8n-nodes-base.stickyNote');
for(let i=0;i<line.length-1;i++)connections[line[i].name]={main:[[{node:line[i+1].name,type:'main',index:0}]]};
const workflow={name:'BayGuard | Detailing Recovery - Acceptance Lab',nodes,connections,settings:{executionOrder:'v1',timezone:'Asia/Dubai'},active:false,pinData:{},tags:[]};
mkdirSync(join(root,'output'),{recursive:true});
writeFileSync(join(root,'output','BayGuard_Acceptance_Lab.json'),JSON.stringify(workflow,null,2));
// Execute precisely the generated Code node scripts locally with the n8n input shape.
let current={};
for(const node of line.slice(1)) {
 const result=new Function('$input',node.parameters.jsCode)({first:()=>({json:current})});
 if(!Array.isArray(result)||result.length!==1)throw new Error('Wrong output at '+node.name);
 current=result[0].json;
}
writeFileSync(join(root,'output','local-test-results.json'),JSON.stringify(current,null,2));
console.log(JSON.stringify({workflow:workflow.name,checksPassed:current.checksPassed,checksFailed:current.checksFailed,syntheticRun:current.syntheticRun,economics:current.illustrativeEconomics},null,2));
