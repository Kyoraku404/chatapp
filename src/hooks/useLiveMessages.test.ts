import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
const mocks = vi.hoisted(() => ({ send: vi.fn(), subscribe: vi.fn(), older: vi.fn(), id: 0 }));
vi.mock('firebase/firestore', () => ({ doc: () => ({ id: `stable-message-${++mocks.id}` }) }));
vi.mock('@/lib/transport', () => ({ sendMessage: mocks.send, sendDmMessage: mocks.send, subscribeMessages: mocks.subscribe, loadOlderMessages: mocks.older }));
vi.mock('@/lib/profiles', () => ({ getProfiles: async () => new Map() }));
import { useLiveMessages, type LiveMessages } from './useLiveMessages';
import type { CollectionReference, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
const col = {} as CollectionReference<DocumentData>;
const getCol = () => col;
let live: LiveMessages;
let renderer: ReactTestRenderer;
let page: (docs: QueryDocumentSnapshot<DocumentData>[], direction: string) => void;
function Harness({scope='dm:thread'}: {scope?:string}) { live=useLiveMessages('me',getCol,scope,'other'); return null; }
const echo=(id:string, own=true, read=false) => ({id,metadata:{hasPendingWrites:false},data:()=>({senderId:own?'me':'other',content:'Hello',createdAt:100,readAt:read?200:null})}) as unknown as QueryDocumentSnapshot<DocumentData>;
beforeEach(async()=>{
  mocks.send.mockReset(); mocks.subscribe.mockReset(); mocks.id=0;
  mocks.subscribe.mockImplementation((_col,cb)=>{page=cb; return ()=>{};});
  await act(async()=>{renderer=create(createElement(Harness));});
  await act(async()=>page([],'initial'));
});
afterEach(()=>act(()=>renderer.unmount()));
describe('optimistic live hook',()=>{
  it('shows Sending immediately, Sent only after real request resolves',async()=>{
    let resolve!: (v:unknown)=>void;
    mocks.send.mockImplementation(()=>new Promise(r=>{resolve=r;}));
    let sending!:Promise<void>;
    act(()=>{sending=live.send('Hello');});
    expect(live.messages[0].status).toBe('sending');
    await act(async()=>{resolve({id:'stable-message-1'});await sending;});
    expect(live.messages[0].status).toBe('sent');
    await act(async()=>page([echo('stable-message-1')],'live'));
    expect(live.messages).toHaveLength(1);
  });
  it('reconciles an echo arriving before the HTTP response',async()=>{
    let resolve!:(v:unknown)=>void;
    mocks.send.mockImplementation(()=>new Promise(r=>{resolve=r;}));
    let sending!:Promise<void>;
    act(()=>{sending=live.send('Hello');});
    await act(async()=>page([echo('stable-message-1')],'live'));
    expect(live.messages).toHaveLength(1);
    expect(live.messages[0].status).toBe('sent');
    await act(async()=>{resolve({id:'stable-message-1'});await sending;});
    expect(live.messages).toHaveLength(1);
  });
  it('preserves failed content and retries exactly the same ID',async()=>{
    mocks.send.mockRejectedValueOnce(new Error('Network failed')).mockResolvedValue({id:'stable-message-1'});
    await act(async()=>{await live.send('Hello').catch(()=>{});});
    expect(live.messages[0]).toMatchObject({status:'failed',content:'Hello'});
    await act(async()=>{await live.retry('stable-message-1');});
    expect(mocks.send.mock.calls[0][3].clientId).toBe(mocks.send.mock.calls[1][3].clientId);
    expect(live.messages).toHaveLength(1);
    expect(live.messages[0].status).toBe('sent');
  });
  it('does not animate initial history but flags new incoming rows',async()=>{
    await act(async()=>page([echo('old',false)],'initial'));
    expect(live.messages[0].entrance).toBeUndefined();
    await act(async()=>page([echo('new',false),echo('old',false)],'live'));
    expect(live.messages.find(m=>m.id==='new')?.entrance).toBe('incoming');
    expect(live.messages.find(m=>m.id==='old')?.entrance).toBeUndefined();
  });
  it('uses persisted read data and retains history outside the live window',async()=>{
    await act(async()=>page([echo('old')],'initial'));
    await act(async()=>page([echo('new',true,true)],'live'));
    expect(live.messages.find(m=>m.id==='new')?.status).toBe('read');
    expect(live.messages.find(m=>m.id==='old')).toBeDefined();
  });
  it('keeps failed outbox entries scoped while switching conversations',async()=>{
    mocks.send.mockRejectedValue(new Error('Offline'));
    await act(async()=>{await live.send('Hello').catch(()=>{});});
    await act(async()=>renderer.update(createElement(Harness,{scope:'dm:other'})));
    expect(live.messages).toHaveLength(0);
    await act(async()=>renderer.update(createElement(Harness)));
    expect(live.messages[0].status).toBe('failed');
  });
});
