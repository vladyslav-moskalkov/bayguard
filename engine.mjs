// BAYGUARD 1.0. Pure reservation kernel; persistence and channel identity are adapters.
// A successful in-memory transition is NOT a durable booking until CAS commit succeeds.
export const VERSION = 'bayguard-1.0.0';
const clone = x => JSON.parse(JSON.stringify(x));
const canonical = x => Array.isArray(x) ? `[${x.map(canonical).join(',')}]` : x && typeof x === 'object' ? `{${Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')}}` : JSON.stringify(x);
const overlaps = (a,b) => a.startMs < b.endMs && b.startMs < a.endMs;
function requireValue(ok, code) { if (!ok) throw new Error(code); }
function id(x) { return typeof x==='string' && /^[A-Za-z0-9_-]{1,80}$/.test(x); }
function instant(x) { requireValue(typeof x==='string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(x), 'UTC_ISO_REQUIRED'); const n=Date.parse(x); requireValue(Number.isFinite(n),'INVALID_TIME'); return n; }
export function seed() {
  return {version:VERSION, config:{timezone:'Asia/Dubai',utcOffsetHours:4,openHour:9,closeHour:21,offerMinutes:10,maxHorizonDays:30},
    services:{wash:{minutes:60,priceAed:150,capability:'wet'},interior:{minutes:90,priceAed:350,capability:'detail'},ceramic:{minutes:180,priceAed:1200,capability:'detail'}},
    bays:[{id:'wet_A',capabilities:['wet']},{id:'detail_B',capabilities:['detail']}],
    bookings:[],waitlist:[],offers:[],processed:[],audit:[]};
}
function interval(s,serviceId,startIso,now) {
  const svc=s.services[serviceId]; requireValue(!!svc,'UNKNOWN_SERVICE');
  const startMs=instant(startIso),endMs=startMs+svc.minutes*60000;
  requireValue(startMs>now,'PAST_SLOT'); requireValue(startMs-now<=s.config.maxHorizonDays*86400000,'OUTSIDE_HORIZON');
  const a=new Date(startMs+s.config.utcOffsetHours*3600000),b=new Date(endMs+s.config.utcOffsetHours*3600000);
  const mins=a.getUTCHours()*60+a.getUTCMinutes(),endMins=b.getUTCHours()*60+b.getUTCMinutes();
  requireValue(a.toISOString().slice(0,10)===b.toISOString().slice(0,10) && mins>=s.config.openHour*60 && endMins<=s.config.closeHour*60,'OUTSIDE_OPEN_HOURS');
  requireValue(a.getUTCSeconds()===0 && a.getUTCMilliseconds()===0,'MINUTE_BOUNDARY_REQUIRED');
  return {startMs,endMs};
}
function activeBookings(s) { return s.bookings.filter(b=>['held','confirmed'].includes(b.status)); }
function freeBay(s,serviceId,range) {
  const cap=s.services[serviceId].capability;
  return s.bays.find(b=>b.capabilities.includes(cap) && !activeBookings(s).some(x=>x.bayId===b.id&&overlaps(x,range)));
}
function expire(s,now) {
  for(const offer of s.offers.filter(o=>o.status==='offered' && o.expiresMs<=now)) {
    offer.status='expired'; const b=s.bookings.find(x=>x.id===offer.holdId); if(b?.status==='held') b.status='expired';
    const w=s.waitlist.find(x=>x.id===offer.waitlistId); if(w?.status==='offered') w.status='waiting';
  }
}
function snapshotInvariant(s) {
  const bs=activeBookings(s);
  for(let i=0;i<bs.length;i++) for(let j=i+1;j<bs.length;j++) requireValue(!(bs[i].bayId===bs[j].bayId&&overlaps(bs[i],bs[j])),'CAPACITY_INVARIANT');
  requireValue(new Set(s.bookings.map(b=>b.id)).size===s.bookings.length,'DUPLICATE_BOOKING_ID');
  for(const b of bs) requireValue(!!s.bays.find(x=>x.id===b.bayId&&x.capabilities.includes(s.services[b.serviceId]?.capability)),'CAPABILITY_INVARIANT');
}
export function transition(original,event) {
  let s=clone(original);
  try {
    requireValue(s.version===VERSION,'SCHEMA_VERSION_MISMATCH');
    requireValue(event && id(event.id) && id(event.actor?.id),'INVALID_EVENT');
    requireValue(['customer','staff','timer'].includes(event.actor.role),'INVALID_ACTOR');
    const fingerprint=canonical({id:event.id,type:event.type,actor:event.actor,data:event.data||{}}), previous=s.processed.find(x=>x.id===event.id);
    if(previous) { requireValue(previous.fingerprint===fingerprint,'IDEMPOTENCY_CONFLICT'); return {state:s,result:{...clone(previous.result),replayed:true},notifications:[]}; }
    requireValue(s.processed.length<5000,'STATE_RETENTION_REQUIRED');
    const now=instant(event.now); expire(s,now);
    const d=event.data||{},notifications=[]; let result={ok:true,code:'OK',replayed:false};
    const customer=()=>requireValue(event.actor.role==='customer','CUSTOMER_ONLY');
    const internal=()=>requireValue(['staff','timer'].includes(event.actor.role),'STAFF_OR_TIMER_ONLY');
    const notify=(to,text,offerId)=>notifications.push({key:event.id+'_'+notifications.length,to,text,...(offerId?{offerId}:{})});
    switch(event.type) {
      case 'reserve': {
        customer(); const range=interval(s,d.serviceId,d.start,now),bay=freeBay(s,d.serviceId,range);
        requireValue(!activeBookings(s).some(b=>b.customerId===event.actor.id&&overlaps(b,range)),'CUSTOMER_ALREADY_BOOKED');
        requireValue(!!bay,'NO_CAPACITY');
        const booking={id:'bk_'+event.id,customerId:event.actor.id,serviceId:d.serviceId,bayId:bay.id,...range,status:'confirmed',origin:'direct',quotedAed:s.services[d.serviceId].priceAed};
        s.bookings.push(booking); result={...result,code:'BOOKED',bookingId:booking.id}; notify(event.actor.id,'Appointment confirmed. Payment is not processed by this bot.'); break;
      }
      case 'join_waitlist': {
        customer(); requireValue(d.consent===true,'CONSENT_REQUIRED');
        const range=interval(s,d.serviceId,d.earliest,now),latestMs=instant(d.latest);
        requireValue(latestMs>=range.endMs && latestMs-range.startMs<=86400000,'INVALID_AVAILABILITY');
        requireValue(!s.waitlist.some(w=>w.customerId===event.actor.id&&w.serviceId===d.serviceId&&['waiting','offered'].includes(w.status)),'ALREADY_WAITLISTED');
        const w={id:'wl_'+event.id,customerId:event.actor.id,serviceId:d.serviceId,earliestMs:range.startMs,latestMs,joinedMs:now,consent:true,status:'waiting'};
        s.waitlist.push(w); result={...result,code:'WAITLISTED',waitlistId:w.id}; break;
      }
      case 'cancel': {
        customer(); const b=s.bookings.find(x=>x.id===d.bookingId);
        requireValue(!!b&&b.customerId===event.actor.id,'BOOKING_NOT_OWNED');
        requireValue(b.status==='confirmed','NOT_CANCELLABLE'); requireValue(b.startMs>now,'CANCELLATION_TOO_LATE');
        b.status='cancelled'; result={...result,code:'CANCELLED',bookingId:b.id}; notify(event.actor.id,'Cancelled. Any payment/refund is handled by the studio.'); break;
      }
      case 'offer_next': {
        internal(); const source=s.bookings.find(x=>x.id===d.cancelledBookingId&&x.status==='cancelled');
        requireValue(!!source,'CANCELLED_WINDOW_REQUIRED'); requireValue(source.startMs>now,'WINDOW_PASSED');
        requireValue(!s.offers.some(o=>o.sourceId===source.id&&['offered','claimed'].includes(o.status)),'WINDOW_ALREADY_ALLOCATED');
        const history=new Set(s.offers.filter(o=>o.sourceId===source.id).map(o=>o.customerId));
        const candidates=s.waitlist.filter(w=>w.status==='waiting'&&w.consent&&!history.has(w.customerId)).sort((a,b)=>a.joinedMs-b.joinedMs||a.id.localeCompare(b.id));
        let selected,range,bay;
        for(const w of candidates) {
          const endMs=source.startMs+s.services[w.serviceId].minutes*60000;
          const r={startMs:source.startMs,endMs};
          if(w.earliestMs<=r.startMs && w.latestMs>=r.endMs && endMs<=source.endMs && !activeBookings(s).some(b=>b.customerId===w.customerId&&overlaps(b,r))) {
            const b=s.bays.find(b=>b.id===source.bayId&&b.capabilities.includes(s.services[w.serviceId].capability)&&!activeBookings(s).some(x=>x.bayId===b.id&&overlaps(x,r)));
            if(b) {selected=w;range=r;bay=b;break;}
          }
        }
        if(!selected) {result={...result,code:'NO_ELIGIBLE_WAITLIST'};break;}
        const holdId='hold_'+event.id,offerId='offer_'+event.id;
        s.bookings.push({id:holdId,customerId:selected.customerId,serviceId:selected.serviceId,bayId:bay.id,...range,status:'held',origin:'waitlist',sourceId:source.id,quotedAed:s.services[selected.serviceId].priceAed});
        const expiresMs=Math.min(now+s.config.offerMinutes*60000,source.startMs);
        s.offers.push({id:offerId,sourceId:source.id,waitlistId:selected.id,customerId:selected.customerId,holdId,status:'offered',expiresMs}); selected.status='offered';
        result={...result,code:'OFFERED',offerId,customerId:selected.customerId,expiresAt:new Date(expiresMs).toISOString()};
        notify(selected.customerId,'A compatible appointment is held for up to 10 minutes. Accept or decline; price is a quote, not money received.',offerId); break;
      }
      case 'claim_offer': {
        customer(); const o=s.offers.find(x=>x.id===d.offerId);
        requireValue(!!o&&o.customerId===event.actor.id,'OFFER_NOT_OWNED'); requireValue(o.status==='offered'&&o.expiresMs>now,'OFFER_NOT_ACTIVE');
        const b=s.bookings.find(x=>x.id===o.holdId); requireValue(b?.status==='held','HOLD_NOT_ACTIVE');
        o.status='claimed'; b.status='confirmed'; s.waitlist.find(x=>x.id===o.waitlistId).status='booked';
        result={...result,code:'RECOVERED_BOOKING',bookingId:b.id,quotedAed:b.quotedAed}; notify(event.actor.id,'Your replacement appointment is confirmed. No payment has been collected.'); break;
      }
      case 'decline_offer': {
        customer(); const o=s.offers.find(x=>x.id===d.offerId);
        requireValue(!!o&&o.customerId===event.actor.id,'OFFER_NOT_OWNED'); requireValue(o.status==='offered','OFFER_NOT_ACTIVE');
        o.status='declined'; s.bookings.find(x=>x.id===o.holdId).status='declined'; s.waitlist.find(x=>x.id===o.waitlistId).status='waiting';
        result={...result,code:'DECLINED'}; break;
      }
      case 'withdraw_consent': {
        customer(); for(const w of s.waitlist.filter(x=>x.customerId===event.actor.id)) {w.consent=false;w.status='withdrawn';}
        for(const o of s.offers.filter(x=>x.customerId===event.actor.id&&x.status==='offered')) {o.status='withdrawn';const b=s.bookings.find(x=>x.id===o.holdId);if(b?.status==='held')b.status='withdrawn';}
        result={...result,code:'CONSENT_WITHDRAWN'};break;
      }
      case 'tick': internal(); result={...result,code:'EXPIRY_CHECKED'};break;
      case 'record_payment': throw new Error('PAYMENT_ADAPTER_NOT_CONNECTED');
      default: throw new Error('UNKNOWN_EVENT_TYPE');
    }
    snapshotInvariant(s);
    s.audit.push({eventId:event.id,type:event.type,actorId:event.actor.id,code:result.code,at:event.now});
    s.processed.push({id:event.id,fingerprint,result:clone(result)});
    return {state:s,result,notifications};
  } catch(error) {return {state:clone(original),result:{ok:false,code:error.message,replayed:false},notifications:[]};}
}
export function metrics(s) {
  const recovered=s.bookings.filter(b=>b.origin==='waitlist'&&b.status==='confirmed');
  return {confirmedRecoveredAppointments:recovered.length,quotedRecoveredBookingValueAed:recovered.reduce((n,b)=>n+b.quotedAed,0),cashReceivedAed:null,cashStatus:'No payment integration; quote value is NOT revenue',basis:'Synthetic test records unless a verified production source is connected'};
}
export function economicScenario(input) {
  const {monthlyAppointments,cancelRate,eligibleShare,fillRate,averageTicketAed,variableCostAed,monthlyOpsAed,manualRequests,manualMinutes,automatedMinutes,loadedHourlyCostAed}=input;
  for(const k of Object.keys(input)) requireValue(Number.isFinite(input[k])&&input[k]>=0,'INVALID_SCENARIO');
  for(const k of ['cancelRate','eligibleShare','fillRate']) requireValue(input[k]<=1,'INVALID_RATE');
  requireValue(variableCostAed<=averageTicketAed && automatedMinutes<=manualMinutes,'INVALID_UNIT_ECONOMICS');
  const expectedRecovered=monthlyAppointments*cancelRate*eligibleShare*fillRate;
  const savedHours=manualRequests*(manualMinutes-automatedMinutes)/60;
  return {basis:'Illustrative assumptions, NOT measured client results',expectedRecoveredAppointments:expectedRecovered,modeledBookingValueAed:expectedRecovered*averageTicketAed,modeledContributionAfterOpsAed:expectedRecovered*(averageTicketAed-variableCostAed)-monthlyOpsAed,modeledFreedAdminHours:savedHours,modeledLaborCapacityValueAed:savedHours*loadedHourlyCostAed,laborCashSavingAed:null,doNotAddLaborValueToCashProfit:true};
}
