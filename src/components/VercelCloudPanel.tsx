import React, { useRef, useState } from 'react';

const ORDERS = 'seller_settlement_orders_v1';
const COSTS = 'seller_settlement_costs_v1';
const SETTINGS = 'seller_settlement_settings_v1';
const KEYS = [ORDERS, COSTS, SETTINGS] as const;
const COUNT_KEYS = ['localStorageOrders', 'indexedDBOrders', 'localStorageCosts', 'indexedDBCosts'] as const;
const RAW_LIMIT = 40 * 1024 * 1024;
const GZIP_LIMIT = 3_500_000; // Strict upper bound on the actual request body.
const FORMAT = 'seller-settlement-raw-backup';
const HEX = /^[a-f0-9]{64}$/i;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

type Raw = { localStorage: Record<string, string | null>; indexedDB: {present: boolean; entries: {key: IDBValidKey; value: unknown}[]} };
export interface VercelCloudPanelProps { readSnapshot: () => Promise<Raw>; displayedOrders: number }
type Counts = Record<typeof COUNT_KEYS[number], number> & {displayedOrders?: number};
type Meta = {id: string; createdAt: string; counts: Counts; sha256: string; size: number; originalPayloadSha256?: string};
type Backup = { raw: Raw; capturedAt: string; counts: Counts; digest: string; bytes: Uint8Array<ArrayBuffer> };
class PanelError extends Error {}
function check(ok: unknown, message = '백업 형식 또는 데이터가 올바르지 않습니다.'): asserts ok {
  if (!ok) throw new PanelError(message);
}
function obj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
}
const own = (v: object, key: string) => Object.prototype.hasOwnProperty.call(v, key);
const uint = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const timestamp = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
function safeKey(k: string) { check(!['__proto__','prototype','constructor'].includes(k), '허용하지 않는 속성이 있어 중단했습니다.'); }
function parseJson(text: string): unknown {
  try { return JSON.parse(text.replace(/^\uFEFF/, ''), (k, v) => { safeKey(k); return v; }); }
  catch { throw new PanelError('백업 JSON이 손상되었거나 허용하지 않는 속성이 있습니다.'); }
}
// No lossy conversion of structured-clone values (Date, Map, binary, undefined, etc.).
function jsonString(value: unknown): string {
  try { return JSON.stringify(value, function(k,v) {
    safeKey(k);
    const original: unknown = this[k];
    check(original === null || typeof original === 'string' || typeof original === 'boolean' ||
      (typeof original === 'number' && Number.isFinite(original) && !Object.is(original, -0)) ||
      (Array.isArray(original) && Object.keys(original).length === original.length) || obj(original),
      '원본에 JSON으로 보존할 수 없는 값이 있습니다.');
    return v;
  }); } catch { throw new PanelError('원본 데이터를 손실 없이 JSON으로 보존할 수 없어 중단했습니다.'); }
}
function rows(v: unknown): unknown[] { check(Array.isArray(v) && v.every(obj), '주문 또는 원가 데이터의 형식이 맞지 않습니다.'); return v; }
function validKey(key: unknown): boolean {
  return typeof key === 'string' || (typeof key === 'number' && Number.isFinite(key)) || (Array.isArray(key) && key.every(validKey));
}
function inspectRaw(raw: unknown) {
  check(obj(raw) && obj(raw.localStorage) && obj(raw.indexedDB));
  const ls = raw.localStorage, db = raw.indexedDB;
  check(Object.keys(ls).length === KEYS.length && KEYS.every(k => own(ls,k) && (ls[k] === null || typeof ls[k] === 'string')), '브라우저 저장 키가 누락되었거나 지원하지 않는 키가 있습니다.');
  const parseLS = (k: string) => ls[k] === null ? null : parseJson(ls[k] as string);
  const localOrders = ls[ORDERS] === null ? [] : rows(parseLS(ORDERS));
  const localCosts = ls[COSTS] === null ? [] : rows(parseLS(COSTS));
  if (ls[SETTINGS] !== null) check(obj(parseLS(SETTINGS)), '설정 데이터는 JSON 객체여야 합니다.');
  check(typeof db.present === 'boolean' && Array.isArray(db.entries) && (db.present || db.entries.length === 0));
  let idbOrders: unknown[] | undefined, idbCosts: unknown[] | undefined;
  const seen = new Set<string>();
  for (const e of db.entries) {
    check(obj(e) && own(e,'key') && own(e,'value') && validKey(e.key));
    const id = JSON.stringify(e.key); check(!seen.has(id), '중복된 데이터베이스 키가 있습니다.'); seen.add(id);
    if (e.key === ORDERS) idbOrders = rows(e.value);
    if (e.key === COSTS) idbCosts = rows(e.value);
  }
  return { counts: {localStorageOrders: localOrders.length, indexedDBOrders: idbOrders?.length ?? 0,
    localStorageCosts: localCosts.length, indexedDBCosts: idbCosts?.length ?? 0},
    orders: idbOrders ?? localOrders, costs: idbCosts ?? localCosts };
}
function parseCounts(v: unknown): Counts {
  check(obj(v) && COUNT_KEYS.every(k => own(v,k) && uint(v[k])) && (!own(v,'displayedOrders') || uint(v.displayedOrders)));
  return v as Counts;
}
async function sha(bytes: Uint8Array<ArrayBuffer>) {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2,'0')).join('');
}
const encode = (s: string) => new TextEncoder().encode(s);
export async function validateCloudBackup(bytes: Uint8Array<ArrayBuffer>): Promise<Backup> {
  check(bytes.length > 0 && bytes.length <= RAW_LIMIT, '백업 파일의 최대 크기는 40 MiB입니다.');
  const env = parseJson(new TextDecoder('utf-8', {fatal:true}).decode(bytes));
  check(obj(env) && env.format === FORMAT && env.version === 1 && typeof env.payload === 'string' && typeof env.sha256 === 'string' && HEX.test(env.sha256));
  const digest = await sha(encode(env.payload)); check(digest === env.sha256.toLowerCase(), '백업 내용의 SHA-256 검증에 실패했습니다.');
  const p = parseJson(env.payload); check(obj(p) && timestamp(p.capturedAt) && typeof p.origin === 'string' && /^https?:\/\//i.test(p.origin) && new URL(p.origin).origin === p.origin);
  const counts = parseCounts(p.counts), actual = inspectRaw(p.raw).counts;
  check(COUNT_KEYS.every(k => counts[k] === actual[k]) && (counts.displayedOrders ?? 0) <= Math.max(actual.localStorageOrders,actual.indexedDBOrders), '기록된 건수와 실제 원본이 일치하지 않습니다.');
  return { raw: p.raw as Raw, capturedAt: p.capturedAt, counts, bytes, digest };
}
async function capture(read: VercelCloudPanelProps['readSnapshot'], displayed: number, allowEmpty: boolean) {
  check(uint(displayed) && (allowEmpty || displayed > 0), '화면의 주문이 0건이어서 서버에 저장하지 않았습니다.');
  let previous = jsonString(await read());
  for (let i=0; i<4; i++) {
    await new Promise(resolve => setTimeout(resolve,350));
    const raw = await read(), text = jsonString(raw);
    if (text !== previous) { previous = text; continue; }
    const counts = {...inspectRaw(raw).counts, displayedOrders: displayed};
    check(Math.max(counts.localStorageOrders,counts.indexedDBOrders) >= displayed,'저장된 주문이 화면보다 적습니다. 저장이 끝난 뒤 다시 시도해 주세요.');
    const payload = JSON.stringify({capturedAt:new Date().toISOString(), origin:location.origin, counts, raw});
    const bytes = encode(JSON.stringify({format:FORMAT, version:1, sha256:await sha(encode(payload)), payload}));
    return validateCloudBackup(bytes);
  }
  throw new PanelError('데이터가 계속 변경되고 있습니다. 입력을 멈추고 다른 탭을 닫은 뒤 다시 시도해 주세요.');
}
async function bounded(stream: ReadableStream<Uint8Array> | null, limit: number) {
  check(stream, '파일을 읽을 수 없습니다.');
  const reader = stream.getReader(), chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) {
      const r = await reader.read(); if (r.done) break;
      total += r.value.byteLength;
      if (total > limit) { void reader.cancel().catch(() => {}); throw new PanelError('압축 파일 또는 압축 해제한 백업이 크기 제한을 넘습니다.'); }
      chunks.push(r.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
  return bytes;
}
function downloadJson(backup: Backup, prefix: string) {
  const url = URL.createObjectURL(new Blob([backup.bytes], {type:'application/json'}));
  const a = document.createElement('a'); a.href = url;
  a.download = prefix + '-' + new Date(backup.capturedAt).toISOString().replace(/[:.]/g,'-') + '.json';
  try { document.body.appendChild(a); a.click(); } finally { a.remove(); setTimeout(() => URL.revokeObjectURL(url),60_000); }
  return a.download;
}

function metadata(v: unknown): Meta {
  check(obj(v) && typeof v.id === 'string' && UUID.test(v.id) && timestamp(v.createdAt) && typeof v.sha256 === 'string' && HEX.test(v.sha256) && uint(v.size) && v.size > 0 && v.size < GZIP_LIMIT);
  check(v.originalPayloadSha256 === undefined || (typeof v.originalPayloadSha256 === 'string' && HEX.test(v.originalPayloadSha256)));
  parseCounts(v.counts); return v as Meta;
}
async function api(action: string, init?: RequestInit) {
  const response = await fetch('/api/cloud?action='+action,{...init,credentials:'same-origin',mode:'same-origin',cache:'no-store',redirect:'error'});
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new PanelError('접근할 수 없습니다. 상태를 새로 확인하고 허용된 GitHub 계정으로 로그인해 주세요.');
    if (response.status === 404 && action === 'session' || response.status === 503) throw new PanelError('서버 설정 대기 중입니다. 나중에 상태를 다시 확인해 주세요.');
    if (response.status === 413) throw new PanelError('서버 저장 크기 제한을 넘었습니다.');
    throw new PanelError('서버 요청을 완료하지 못했습니다. 상태와 버전 목록을 다시 확인해 주세요.');
  }
  return response;
}
function verifyMeta(m: Meta, b: Backup) {
  check(COUNT_KEYS.every(k=>m.counts[k] === b.counts[k]) && (m.counts.displayedOrders === undefined || m.counts.displayedOrders === b.counts.displayedOrders) &&
    (!m.originalPayloadSha256 || m.originalPayloadSha256.toLowerCase() === b.digest), '서버 정보와 실제 백업 내용이 다릅니다.');
}
async function uploadBackup(b: Backup) {
  check(typeof CompressionStream !== 'undefined', '최신 Chrome에서 압축 저장을 시도해 주세요.');
  const gzip = await bounded(new Blob([b.bytes]).stream().pipeThrough(new CompressionStream('gzip')),GZIP_LIMIT-1);
  const digest = await sha(gzip);
  const result: unknown = await (await api('upload',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:gzip})).json();
  check(obj(result)); const m = metadata(result.snapshot);
  check(m.sha256.toLowerCase() === digest && m.size === gzip.length, '서버 저장 결과를 검증하지 못했습니다. 목록을 확인해 주세요.');
  verifyMeta(m,b); return m;
}
async function downloadBackup(m: Meta) {
  check(typeof DecompressionStream !== 'undefined', '최신 Chrome에서 백업을 열어 주세요.');
  const r = await api('download&id='+encodeURIComponent(m.id));
  const header = r.headers.get('x-backup-sha256');
  const gzip = await bounded(r.body,Math.min(GZIP_LIMIT-1,m.size)), digest = await sha(gzip);
  check(gzip.length === m.size && digest === m.sha256.toLowerCase() && (header === null || (HEX.test(header) && header.toLowerCase() === digest)), '다운로드한 파일 크기 또는 SHA-256이 맞지 않습니다.');
  const bytes = await bounded(new Blob([gzip]).stream().pipeThrough(new DecompressionStream('gzip')),RAW_LIMIT);
  const b = await validateCloudBackup(bytes); verifyMeta(m,b); return b;
}

// Only called after the user confirms the chosen version AND keeping a verified local backup.
function openForRestore(expectedPresent: boolean): Promise<IDBDatabase> {
  return new Promise((resolve,reject) => {
    const req = indexedDB.open('seller_settlement_db'); let blocked = false, created = false;
    req.onblocked = () => { blocked = true; reject(new PanelError('다른 탭을 모두 닫고 처음부터 다시 시도해 주세요.')); };
    req.onupgradeneeded = e => {
      if (blocked || expectedPresent || e.oldVersion !== 0) { req.transaction?.abort(); return; }
      req.result.createObjectStore('keyval'); created = true;
    };
    req.onerror = () => reject(new PanelError('데이터베이스를 열지 못했습니다. 복원 전 파일을 보관해 주세요.'));
    req.onsuccess = () => {
      const db = req.result; db.onversionchange = () => db.close();
      if (blocked || created === expectedPresent || !db.objectStoreNames.contains('keyval')) { db.close(); reject(new PanelError('저장소 상태가 변경되었습니다. 처음부터 다시 시도해 주세요.')); return; }
      resolve(db);
    };
  });
}
function writeLocal(k: string, v: string | null) { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k,v); }
async function restore(remote: Raw, before: Raw) {
  const replacement = inspectRaw(remote); inspectRaw(before);
  const db = await openForRestore(before.indexedDB.present);
  const changed: string[] = [];
  try {
    // Queue both puts in the same active transaction, after a final destination check.
    // Waiting for onabort (not request.onerror) guarantees the IDB transaction rolled back.
    await new Promise<void>((resolve,reject) => {
      const tx = db.transaction('keyval','readwrite'); let reason: unknown;
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(reason ?? new PanelError('데이터베이스 쓰기에 실패했습니다.'));
      try {
        const store = tx.objectStore('keyval'), keys = store.getAllKeys(), values = store.getAll();
        values.onsuccess = () => {
          try {
            const entries = keys.result.map((key,i)=>({key,value:values.result[i]}));
            check(jsonString(entries) === jsonString(before.indexedDB.entries) && KEYS.every(k=>localStorage.getItem(k) === before.localStorage[k]), '복원 전 파일을 받은 뒤 데이터가 변경되었습니다. 다시 백업해 주세요.');
            for (const k of KEYS) {
              if (before.localStorage[k] !== remote.localStorage[k]) { writeLocal(k,remote.localStorage[k]); changed.push(k); }
            }
            store.put(replacement.orders, ORDERS); store.put(replacement.costs, COSTS);
          } catch (e) { reason = e; tx.abort(); }
        };
      } catch (e) { reason = e; tx.abort(); }
    });
  } catch (e) {
    let rollbackFailed = false;
    for (const k of changed.reverse()) {
      try { writeLocal(k,before.localStorage[k]); if (localStorage.getItem(k) !== before.localStorage[k]) rollbackFailed = true; }
      catch { rollbackFailed = true; }
    }
    if (rollbackFailed) throw new PanelError('복원과 브라우저 저장소 되돌리기가 모두 실패했습니다. 입력·새로고침을 멈추고 내려받은 복원 전 백업 파일을 안전하게 보관해 주세요.');
    if (e instanceof PanelError) throw e;
    throw new PanelError('저장소 쓰기에 실패해 적용하지 않았습니다. 복원 전 백업 파일을 보관해 주세요.');
  } finally { db.close(); }
}
const timeLabel = (s: string) => new Date(s).toLocaleString('ko-KR');
const summary = (c: Counts) => '주문: 브라우저 '+c.localStorageOrders+'건 / DB '+c.indexedDBOrders+'건 · 원가: 브라우저 '+c.localStorageCosts+'건 / DB '+c.indexedDBCosts+'건';
const btn = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50';
const primary = 'rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50';

export function VercelCloudPanel({readSnapshot,displayedOrders}: VercelCloudPanelProps) {
  const dialog = useRef<HTMLDialogElement>(null), lock = useRef(false);
  const [busy,setBusy] = useState(false), [message,setMessage] = useState(''), [error,setError] = useState(false);
  const [session,setSession] = useState<'unknown'|'pending'|'out'|'in'>('unknown');
  const [list,setList] = useState<Meta[]>([]), [selected,setSelected] = useState('');
  const [file,setFile] = useState<File | null>(null);
  const [pending,setPending] = useState<{source:Backup; before:Backup; id:string; filename:string} | null>(null);
  const chosen = list.find(m=>m.id === selected);
  function reset() { setList([]); setSelected(''); setPending(null); setFile(null); }
  async function run(label: string, task:()=>Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(false); setMessage(label);
    try { await task(); }
    catch (e) { setError(true); setMessage(e instanceof PanelError ? e.message : '작업을 완료하지 못했습니다. 연결 상태와 백업 파일을 확인해 주세요.'); }
    finally { lock.current = false; setBusy(false); }
  }
  async function refresh() {
    reset(); setSession('unknown');
    const res: unknown = await (await api('session')).json().catch(()=>{throw new PanelError('서버 설정 대기 중입니다.');});
    check(obj(res) && typeof res.configured === 'boolean' && typeof res.authenticated === 'boolean','서버 설정 대기 중입니다.');
    if (!res.configured) { setSession('pending'); setMessage('서버 설정 대기 중입니다. 기존 계산기는 그대로 사용할 수 있습니다.'); return; }
    if (!res.authenticated) { setSession('out'); setMessage('비공개 백업을 사용하려면 허용된 GitHub 계정으로 로그인해 주세요.'); return; }
    const result: unknown = await (await api('list')).json();
    check(obj(result) && Array.isArray(result.snapshots));
    const items = result.snapshots.map(metadata); check(new Set(items.map(m=>m.id)).size === items.length);
    setList(items.sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))); setSession('in');
    setMessage(items.length ? '서버 버전 '+items.length+'개를 확인했습니다.' : '서버에 저장된 버전이 없습니다.');
  }
  async function save(b: Backup) {
    const m = await uploadBackup(b); setList(prev=>[m,...prev.filter(x=>x.id !== m.id)]);
    setMessage('비공개 서버에 새 버전을 저장하고 검증했습니다. '+timeLabel(m.createdAt)+' · '+summary(b.counts));
  }
  async function prepare(m: Meta) {
    setPending(null); const source = await downloadBackup(m);
    const details = '서버 저장: '+timeLabel(m.createdAt)+'\n원본 시점: '+timeLabel(source.capturedAt)+'\n'+summary(source.counts);
    if (!window.confirm(details+'\n\n선택한 원본으로 이 브라우저의 주문·원가·설정을 교체합니다. 병합하지 않습니다. 다른 계산기 탭을 모두 닫고 입력을 멈춰 주세요.\n먼저 현재 데이터를 복원 전 JSON 파일로 내려받을까요? 아직 데이터를 변경하지 않습니다.')) { setMessage('불러오기를 취소했습니다.'); return; }
    const before = await capture(readSnapshot,displayedOrders,true);
    const filename = downloadJson(before,'ESliving-before-restore');
    setPending({source,before,id:m.id,filename}); setMessage('복원 전 파일 다운로드를 요청했습니다. 실제로 저장되었는지 확인할 때까지 이 브라우저는 변경하지 않습니다.');
  }
  async function finish() {
    check(pending && pending.id === selected && chosen);
    if (!window.confirm('다운로드 폴더에 '+pending.filename+' 파일이 있고 안전하게 보관했나요? 다른 계산기 탭을 모두 닫았나요?\n\n'+timeLabel(pending.source.capturedAt)+' 원본 · '+summary(pending.source.counts)+'\n확인을 누르면 이 브라우저의 데이터를 교체하고 새로고침합니다.')) { setMessage('복원을 적용하지 않았습니다.'); return; }
    const attempt = pending; setPending(null);
    await restore(attempt.source.raw,attempt.before.raw);
    setMessage('선택한 버전을 불러왔습니다. 새로고침합니다.'); window.location.reload();
  }
  return <>
    <button type="button" className={btn} onClick={()=>{ if (!dialog.current?.open) dialog.current?.showModal(); void run('서버 상태 확인 중…',refresh); }}>서버 저장·불러오기</button>
    <dialog ref={dialog} aria-label="비공개 서버 저장·불러오기" onCancel={e=>{if(lock.current)e.preventDefault();}} onClose={()=>{reset();setSession('unknown');}}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-left text-slate-900 shadow-xl backdrop:bg-slate-900/50">
      <div className="space-y-5 p-5 sm:p-6">
        <header className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold text-blue-700">비공개 백업</p><h2 className="mt-1 text-xl font-bold">서버 저장·불러오기</h2></div>
          <button type="button" className={btn} disabled={busy} onClick={()=>dialog.current?.close()}>닫기</button></header>
        <p className="text-sm text-slate-600">자동 덮어쓰기 없이, 원하는 시점에 서버 저장·불러오기. 기존 계산 방식 유지</p>
        <div className="flex flex-wrap gap-2"><button type="button" className={btn} disabled={busy || !!pending} onClick={()=>void run('서버 상태 확인 중…',refresh)}>상태·목록 새로고침</button>
          {session === 'out' && <button type="button" className={primary} disabled={busy} onClick={()=>{window.location.href='/api/cloud?action=login';}}>GitHub 로그인</button>}
          {session === 'in' && <button type="button" className={btn} disabled={busy || !!pending} onClick={()=>void run('로그아웃 중…',async()=>{
            const r: unknown = await (await api('logout',{method:'POST'})).json(); check(obj(r) && r.authenticated === false); reset(); setSession('out'); setMessage('로그아웃했습니다.');
          })}>로그아웃</button>}</div>
        <p role="status" aria-live="polite" className={'rounded-lg p-3 text-sm '+(error?'bg-red-50 text-red-800':'bg-slate-100 text-slate-700')}>{message}</p>
        {session === 'in' && <>
          <fieldset disabled={busy || !!pending} className="space-y-3 border-t border-slate-200 pt-3">
            <legend className="pr-2 font-bold">서버에 새 버전 저장</legend>
            <button type="button" className={primary} onClick={()=>void run('현재 원본 확인·저장 중…',async()=>save(await capture(readSnapshot,displayedOrders,false)))}>현재 브라우저 원본 저장</button>
            <div className="space-y-2 rounded-lg bg-slate-50 p-3"><label className="block text-sm font-semibold">또는 기존 전체 백업 JSON 파일 선택
              <input type="file" accept=".json,application/json" className="mt-2 block w-full text-sm" onChange={e=>setFile(e.target.files?.[0] ?? null)}/></label>
              <button type="button" className={btn} disabled={!file} onClick={()=>void run('파일 원본 검증·저장 중…',async()=>{
                check(file && /\.json$/i.test(file.name) && file.size > 0 && file.size <= RAW_LIMIT,'40 MiB 이하의 전체 백업 JSON 파일을 선택해 주세요.');
                const b = await validateCloudBackup(new Uint8Array(await file.arrayBuffer()));
                if (!window.confirm('이 파일의 원본을 서버에 새 버전으로 저장할까요?\n'+timeLabel(b.capturedAt)+'\n'+summary(b.counts))) { setMessage('파일 저장을 취소했습니다.'); return; }
                await save(b);
              })}>선택한 파일 원본 저장</button></div>
          </fieldset>
          <fieldset disabled={busy || !!pending} className="space-y-3 border-t border-slate-200 pt-3"><legend className="pr-2 font-bold">서버 버전 선택</legend>
            <label className="block text-sm">저장 시점<select className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-sm" value={selected} onChange={e=>{setSelected(e.target.value);setPending(null);}}>
              <option value="">버전을 선택해 주세요</option>{list.map(m=><option key={m.id} value={m.id}>{timeLabel(m.createdAt)} · 주문 {m.counts.localStorageOrders}/{m.counts.indexedDBOrders}건 · {m.id.slice(0,8)}</option>)}
            </select></label>
            {chosen && <p className="text-sm text-slate-600">{summary(chosen.counts)}</p>}
            <div className="flex flex-wrap gap-2"><button type="button" disabled={!chosen} className={btn} onClick={()=>{if(chosen)void run('버전 검증·다운로드 중…',async()=>{
              const b = await downloadBackup(chosen); downloadJson(b,'ESliving-server-backup'); setMessage('검증된 JSON 파일 다운로드를 요청했습니다. 브라우저 데이터는 변경하지 않았습니다.');
            });}}>JSON 다운로드</button>
            <button type="button" disabled={!chosen} className={btn} onClick={()=>{if(chosen)void run('선택 버전과 복원 전 데이터 확인 중…',()=>prepare(chosen));}}>이 브라우저로 불러오기</button></div>
          </fieldset>
          {pending && <section className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><h3 className="font-bold">복원 전 마지막 확인</h3>
            <p>선택한 원본: {timeLabel(pending.source.capturedAt)}<br/>{summary(pending.source.counts)}</p>
            <p className="break-all">다운로드 폴더에서 <strong>{pending.filename}</strong> 파일을 확인해 안전한 곳에 보관하세요. 파일이 없다면 복원하지 마세요. 다른 계산기 탭도 모두 닫아 주세요.</p>
            <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} className={primary} onClick={()=>void run('선택한 버전 복원 중…',finish)}>파일 보관 확인 후 복원</button>
              <button type="button" disabled={busy} className={btn} onClick={()=>{setPending(null);setMessage('복원을 취소했습니다. 데이터는 변경되지 않았습니다.');}}>취소</button></div></section>}
        </>}
      </div>
    </dialog>
  </>;
}
export default VercelCloudPanel;
