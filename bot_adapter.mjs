// Channel adapter. Sender identity comes from Telegram Trigger, never message text.
// Transport is deliberately outside this module: native Data table and Telegram nodes.
import {transition} from './engine.mjs';
export function handleBot(original, ctx) {
  let s=JSON.parse(JSON.stringify(original));
  const now=Date.parse(ctx.now), uid=String(ctx.userId), key=String(ctx.eventId);
  if(!Number.isFinite(now)||!/^\d+$/.test(uid)||!/^[A-Za-z0-9_-]{1,60}$/.test(key)) throw new Error('INVALID_CONTEXT');
  if(ctx.offerMinutes!==undefined){
    if(![1,10].includes(ctx.offerMinutes))throw new Error('INVALID_PRIVATE_TEST_TTL');
    s.config.offerMinutes=ctx.offerMinutes;
  }
  const b=(text,data)=>({text,additionalFields:{callback_data:data}});
  const kb=rows=>({rows:rows.map(buttons=>({row:{buttons}}))});
  const menu=kb([[b('Book a service','services')],[b('My appointments','mine'),b('Stop waitlist offers','stop')]]);
  const messages=[];
  const msg=(text,keyboard=menu,to=uid)=>messages.push({chatId:String(to),text,keyboard});
  const display=ms=>new Date(ms+4*3600000).toISOString().slice(0,16).replace('T',' ')+' Dubai';
  const names={wash:'Exterior wash',interior:'Interior detail',ceramic:'Ceramic treatment'};
  const event=(suffix,type,data={},role='customer',actor=uid)=>({id:key+'_'+suffix,type,actor:{id:actor,role},now:ctx.now,data});
  const apply=e=>{const r=transition(s,e);s=r.state;return r;};
  // Do not write one ledger entry per idle minute. Only persist a sweep that can
  // expire a live hold or offer a compatible opening. The pure preview has no effects.
  if(ctx.source==='timer'){
    const expiryDue=s.offers.some(o=>o.status==='offered'&&o.expiresMs<=now);
    const offerDue=s.bookings.filter(x=>x.status==='cancelled'&&x.startMs>now).some(source=>transition(s,event('preview','offer_next',{cancelledBookingId:source.id},'timer','scheduler')).result.code==='OFFERED');
    if(!expiryDue&&!offerDue)return {state:s,messages:[],code:'IDLE_NO_WRITE',replayed:false,noChange:true};
  }
  s.handledUpdates=s.handledUpdates||[];
  s.uiPages=(s.uiPages||[]).filter(p=>p.expiresMs>now).slice(-20);
  if(s.handledUpdates.includes(key)) return {state:s,messages:[],code:'DUPLICATE_UPDATE',replayed:true};
  if(s.handledUpdates.length>=3000) throw new Error('ADAPTER_RETENTION_REQUIRED');
  apply(event('expiry','tick',{},'timer','scheduler'));
  let code='MENU';
  const replyResult=r=>{
    code=r.result.code;
    if(!r.result.ok){
      const errors={NO_CAPACITY:'That slot has just been taken. Please choose another time or join the waitlist.',OFFER_NOT_ACTIVE:'This offer has expired or was already handled.',ALREADY_WAITLISTED:'You are already on the waitlist for this service.',BOOKING_NOT_OWNED:'This appointment does not belong to you.',NOT_CANCELLABLE:'This appointment is no longer cancellable.',CUSTOMER_ALREADY_BOOKED:'You already have an appointment at this time.'};
      msg(errors[code]||'I could not complete that action ('+code+'). Please refresh the menu.');
      return;
    }
    if(code==='BOOKED'||code==='RECOVERED_BOOKING'){
      const booking=s.bookings.find(x=>x.id===r.result.bookingId);
      msg('Appointment confirmed\n'+names[booking.serviceId]+'\n'+display(booking.startMs)+'\nQuote: AED '+booking.quotedAed+'\nPayment is handled by the studio.',kb([[b('My appointments','mine')],[b('Main menu','menu')]]));
    } else if(code==='WAITLISTED') msg('You are on the waitlist. We will send only matching openings on your selected day. Each offer is reserved for up to 10 minutes. You can stop offers at any time.');
    else if(code==='CANCELLED') msg('Appointment cancelled. If a matching customer opted in, the released window will be offered to them privately. Payment/refund questions go to the studio.');
    else if(code==='DECLINED') msg('Offer declined. You remain on the waitlist.');
    else if(code==='CONSENT_WITHDRAWN')msg('Waitlist offers stopped. Existing confirmed appointments are unchanged.');
  };
  const offerOpenWindows=()=>{
    let index=0;
    for(const source of s.bookings.filter(x=>x.status==='cancelled'&&x.startMs>now)){
      const r=apply(event('offer_'+index++,'offer_next',{cancelledBookingId:source.id},'timer','scheduler'));
      if(r.result.code==='OFFERED'){
        const offer=s.offers.find(x=>x.id===r.result.offerId),hold=s.bookings.find(x=>x.id===offer.holdId);
        msg('An opening matches your waitlist request\n'+names[hold.serviceId]+'\n'+display(hold.startMs)+'\nQuote: AED '+hold.quotedAed+'\nReserved until '+display(offer.expiresMs)+'. No payment is collected by the bot.',kb([[b('Accept opening','accept:'+offer.id),b('Decline','decline:'+offer.id)],[b('Stop offers','stop')]]),offer.customerId);
      }
    }
  };
  const command=String(ctx.command||'').trim();
  const [action,a,c]=command.split(':');
  if(ctx.source==='timer') {code='SWEEP';offerOpenWindows();}
  else if(ctx.source==='test') {code='STORAGE_PROBE';s.adapterProbe={eventId:key,at:ctx.now};}
  else if(action==='page'){
    const page=s.uiPages.find(p=>p.id===a&&p.owner===uid),pageIndex=Number(c);
    if(!page||!Number.isInteger(pageIndex)||pageIndex<0||pageIndex*2>=page.buttons.length)msg('This menu has expired. Please choose a service again.');
    else {
      const buttons=page.buttons.slice(pageIndex*2,pageIndex*2+2);
      while(buttons.length<2)buttons.push(b('Main menu','menu'));
      buttons.push(pageIndex>0?b('Previous','page:'+a+':'+(pageIndex-1)):b('Main menu','menu'));
      buttons.push((pageIndex+1)*2<page.buttons.length?b('Next options','page:'+a+':'+(pageIndex+1)):b('My appointments','mine'));
      msg(page.text+'\nOptions '+(pageIndex+1)+'/'+Math.ceil(page.buttons.length/2),kb([buttons]));
    }
  }
  else if(['/start','/menu','menu',''].includes(command)) msg('BAYGUARD\nDetailing appointments, without the back-and-forth.\nChoose a service, pick an available time, or recover a cancelled opening through the opt-in waitlist.\nAll times are Dubai (UTC+4).');
  else if(command==='services') msg('Choose your service. Prices below are prototype configuration, not a live studio offer.',kb(Object.keys(names).map(id=>[b(names[id]+' · '+s.services[id].minutes+' min · AED '+s.services[id].priceAed,'svc:'+id)]).concat([[b('Main menu','menu')]])));
  else if(action==='svc'&&s.services[a]){
    const day=new Date(now+4*3600000+86400000).toISOString().slice(0,10);
    const start=Date.parse(day+'T05:00:00Z');
    const slots=[];
    for(let t=start;t<=start+12*3600000&&slots.length<6;t+=30*60000){
      const r=transition(s,event('preview','reserve',{serviceId:a,start:new Date(t).toISOString()}));
      if(r.result.ok)slots.push([b(display(t),'book:'+a+':'+Math.floor(t/60000))]);
    }
    msg(names[a]+' — next-day availability\n'+day+' · Dubai time\n'+(slots.length?'Select a slot to confirm.':'No suitable slots available.'),kb(slots.concat([[b('Notify me of cancellations — I agree','wait:'+a+':'+day)],[b('Back to services','services')]])));
  } else if(action==='book'&&s.services[a]&&/^\d{8,10}$/.test(c||'')) replyResult(apply(event('book','reserve',{serviceId:a,start:new Date(Number(c)*60000).toISOString()})));
  else if(action==='wait'&&s.services[a]&&/^\d{4}-\d\d-\d\d$/.test(c||'')){
    replyResult(apply(event('wait','join_waitlist',{serviceId:a,earliest:c+'T05:00:00Z',latest:c+'T17:00:00Z',consent:true})));
    offerOpenWindows();
  } else if(command==='mine'){
    const bookings=s.bookings.filter(x=>x.customerId===uid&&x.status==='confirmed'&&x.startMs>now).slice(0,10);
    if(!bookings.length)msg('No upcoming appointments.');
    for(const booking of bookings)msg(names[booking.serviceId]+'\n'+display(booking.startMs)+'\nQuote: AED '+booking.quotedAed,kb([[b('Cancel this appointment','cancel:'+booking.id)],[b('Main menu','menu')]]));
  } else if(action==='cancel'&&a){replyResult(apply(event('cancel','cancel',{bookingId:a})));offerOpenWindows();}
  else if(action==='accept'&&a)replyResult(apply(event('claim','claim_offer',{offerId:a})));
  else if(action==='decline'&&a){replyResult(apply(event('decline','decline_offer',{offerId:a})));offerOpenWindows();}
  else if(command==='stop'){replyResult(apply(event('stop','withdraw_consent')));offerOpenWindows();}
  else msg('Please use the buttons below. I only handle detailing appointments — not payments or general chat.');
  if(ctx.source!=='timer')s.handledUpdates.push(key);
  // Bounded, reviewable delivery intent; no blind resend on Telegram timeout.
  s.deliveryIntents=s.deliveryIntents||[];
  for(let i=0;i<messages.length;i++){
    const m=messages[i];
    // A native fixed keyboard is editable and preserved by n8n's Telegram node.
    // Paginate variable-length slot lists instead of using an unsupported whole-collection expression.
    let buttons=m.keyboard.rows.flatMap(row=>row.row.buttons);
    if(buttons.length>4){
      const page={id:key+'m'+i,owner:m.chatId,text:m.text,buttons,expiresMs:now+15*60000};
      s.uiPages.push(page);s.uiPages=s.uiPages.slice(-20);
      buttons=[...buttons.slice(0,2),b('Main menu','menu'),b('Next options','page:'+page.id+':1')];
      m.text+='\nOptions 1/'+Math.ceil(page.buttons.length/2);
    }
    for(const fallback of [b('Main menu','menu'),b('My appointments','mine'),b('Choose service','services'),b('Stop offers','stop')])if(buttons.length<4&&!buttons.some(x=>x.additionalFields.callback_data===fallback.additionalFields.callback_data))buttons.push(fallback);
    while(buttons.length<4)buttons.push(b('Main menu','menu'));
    m.buttons=buttons;m.keyboard=kb([buttons.slice(0,2),buttons.slice(2,4)]);
    for(const row of m.keyboard.rows)for(const button of row.row.buttons){const data=button.additionalFields.callback_data;if(/[^\x00-\x7F]/.test(data)||data.length>64)throw new Error('INVALID_CALLBACK_DATA');}
    s.deliveryIntents.push({key:key+'_'+i,chatId:m.chatId,status:ctx.source==='test'?'not_sent_test':'prepared_delivery_not_verified',at:ctx.now});
  }
  if(s.deliveryIntents.length>5000) throw new Error('DELIVERY_RETENTION_REQUIRED');
  return {state:s,messages,code,replayed:false};
}
