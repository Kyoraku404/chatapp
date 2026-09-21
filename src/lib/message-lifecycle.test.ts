import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { messageStatus, reconcileMessages, sameMessageRun } from './message-lifecycle';
import { MobileNav } from '@/components/chat/MobileNav';
import { MessageStatus } from '@/components/chat/MessageStatus';
import type { DemoMessage } from './demo';
const row: DemoMessage = { id:'stable', sender:'You', own:true, content:'Hello', at:'now', createdAtMs:1 };
describe('truthful message lifecycle',()=>{
  it.each([
    [true,false,false,false,'sending'],[false,false,false,false,'sent'],
    [false,false,true,false,'delivered'],[false,false,true,true,'read'],[false,true,false,false,'failed'],
  ] as const)('maps actual state %s %s %s %s to %s',(pending,failed,delivered,read,status)=>expect(messageStatus(pending,failed,delivered,read)).toBe(status));
  it('reconciles server echo before request resolves without duplicates',()=>{
    expect(reconcileMessages([{...row,status:'sent'}],[{...row,status:'sending'}])).toEqual([{...row,status:'sent'}]);
  });
  it('late echo resolves a failed attempt and same-ID retry',()=>{
    for(const status of ['failed','sending'] as const) expect(reconcileMessages([{...row,status:'sent'}],[{...row,status}])).toHaveLength(1);
  });
  it('inserts incoming realtime messages in timestamp order',()=>{
    const incoming={...row,id:'incoming',own:false,createdAtMs:2};
    expect(reconcileMessages([incoming,row],[]).map(m=>m.id)).toEqual(['stable','incoming']);
  });
  it('does not group messages hours apart or from different senders',()=>{
    expect(sameMessageRun(row,{...row,createdAtMs:1000})).toBe(true);
    expect(sameMessageRun(row,{...row,createdAtMs:3600000})).toBe(false);
    expect(sameMessageRun(row,{...row,sender:'Other'})).toBe(false);
  });
  it.each(['sending','sent','delivered','read','failed'] as const)('renders accessible %s status',status=>{
    expect(renderToStaticMarkup(createElement(MessageStatus,{status}))).toContain(`aria-label="${status}"`);
  });
});
describe('mobile navigation',()=>{
  it.each(['chats','groups','spaces','you'] as const)('renders four matching outline icons and active %s',active=>{
    const html=renderToStaticMarkup(createElement(MobileNav,{active,unread:3,onSelect:()=>{}}));
    expect(html.match(/<svg/g)).toHaveLength(4);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    for(const label of ['Chats','Groups','Spaces','You']) expect(html).toContain(label);
    expect(html).toContain('3 unread messages');
  });
  it('hides the zero unread badge',()=>expect(renderToStaticMarkup(createElement(MobileNav,{active:'chats',unread:0,onSelect:()=>{}}))).not.toContain('unread-badge'));
});
