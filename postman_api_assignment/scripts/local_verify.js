'use strict';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:3000';
const runId = Date.now().toString();
const userA = `qa_user_a_${runId}`;
const userB = `qa_user_b_${runId}`;
const passA = `TempA!${runId}`;
const passB = `TempB!${runId}`;

let tokenA, tokenB, userAId, orderAId, confirmedAtFirst;
let passed = 0, failed = 0;
const results = [];

async function call(method, path, body, token) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(baseUrl + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, body: json };
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }
function isError(body) { return body && body.error && typeof body.error.code === 'string' && typeof body.error.message === 'string'; }
function isOrder(body) {
  return body && typeof body.id === 'string' && typeof body.ownerId === 'string' && typeof body.item === 'string' &&
    Number.isInteger(body.quantity) && typeof body.totalAmount === 'number' && typeof body.status === 'string' &&
    typeof body.createdAt === 'string' && (body.confirmedAt === null || typeof body.confirmedAt === 'string');
}
async function tc(id, title, fn) {
  try { await fn(); passed++; results.push(`${id} PASS - ${title}`); }
  catch (e) { failed++; results.push(`${id} FAIL - ${title}: ${e.message}`); }
}

(async () => {
  const health = await call('GET','/health');
  console.log(`Local verifier against ${baseUrl}`);
  console.log(`API CONTRACT_BREAK=${health.body && health.body.contractBreak ? '1' : '0'}`);
  console.log('---');

  await tc('TC-001','Register valid user A', async()=>{
    const r=await call('POST','/auth/register',{username:userA,password:passA});
    assert(r.status===201,`expected 201 got ${r.status}`); assert(r.body.accessToken,'missing token');
    tokenA=r.body.accessToken; userAId=r.body.user.id;
  });
  await tc('TC-002','Register valid user B', async()=>{
    const r=await call('POST','/auth/register',{username:userB,password:passB});
    assert(r.status===201,`expected 201 got ${r.status}`); tokenB=r.body.accessToken;
  });
  await tc('TC-003','Missing required password', async()=>{
    const r=await call('POST','/auth/register',{username:`bad_${runId}`});
    assert(r.status===400,`expected 400 got ${r.status}`); assert(isError(r.body),'invalid error schema');
  });
  await tc('TC-004','Login user A valid', async()=>{
    const r=await call('POST','/auth/login',{username:userA,password:passA});
    assert(r.status===200,`expected 200 got ${r.status}`); assert(r.body.tokenType==='Bearer','bad tokenType'); tokenA=r.body.accessToken;
  });
  await tc('TC-005','Login invalid password', async()=>{
    const r=await call('POST','/auth/login',{username:userA,password:'wrong-password'});
    assert(r.status===401,`expected 401 got ${r.status}`); assert(r.body.error.code==='INVALID_CREDENTIALS','bad error code');
  });
  await tc('TC-006','Create valid protected order', async()=>{
    const r=await call('POST','/orders',{item:'Keyboard',quantity:2},tokenA);
    assert(r.status===201,`expected 201 got ${r.status}`); assert(isOrder(r.body),'order schema mismatch');
    assert(r.body.totalAmount===20,'business total mismatch'); assert(r.body.ownerId===userAId,'owner mismatch');
    orderAId=r.body.id;
  });
  await tc('TC-007','Create order missing mandatory item', async()=>{
    const r=await call('POST','/orders',{quantity:2},tokenA);
    assert(r.status===400,`expected 400 got ${r.status}`); assert(r.body.error.code==='VALIDATION_ERROR','bad error code');
  });
  await tc('TC-008','Protected request without credentials', async()=>{
    const r=await call('POST','/orders',{item:'Mouse',quantity:1});
    assert(r.status===401,`expected 401 got ${r.status}`); assert(r.body.error.code==='AUTH_REQUIRED','bad error code');
  });
  await tc('TC-009','Protected request with invalid token', async()=>{
    const r=await call('GET',`/orders/${orderAId}`,undefined,'not-a-valid-token');
    assert(r.status===401,`expected 401 got ${r.status}`); assert(r.body.error.code==='INVALID_TOKEN','bad error code');
  });
  await tc('TC-010','Get own order and verify contract/persistence', async()=>{
    const r=await call('GET',`/orders/${orderAId}`,undefined,tokenA);
    assert(r.status===200,`expected 200 got ${r.status}`); assert(isOrder(r.body),'BODY CONTRACT FAIL: required Order field missing or wrong type');
    assert(r.body.item==='Keyboard' && r.body.quantity===2 && r.body.status==='created','persisted values mismatch');
  });
  await tc('TC-011','User B cannot access user A order', async()=>{
    const r=await call('GET',`/orders/${orderAId}`,undefined,tokenB);
    assert(r.status===403,`expected 403 got ${r.status}`); assert(r.body.error.code==='FORBIDDEN','bad error code');
  });
  await tc('TC-012','Nonexistent order', async()=>{
    const r=await call('GET','/orders/999999',undefined,tokenA);
    assert(r.status===404,`expected 404 got ${r.status}`); assert(r.body.error.code==='ORDER_NOT_FOUND','bad error code');
  });
  await tc('TC-013','Pagination', async()=>{
    const r=await call('GET','/orders?page=1&limit=1',undefined,tokenA);
    assert(r.status===200,`expected 200 got ${r.status}`); assert(Array.isArray(r.body.data),'data not array');
    assert(r.body.data.length<=1,'limit ignored'); assert(r.body.pagination.page===1 && r.body.pagination.limit===1,'metadata mismatch');
    r.body.data.forEach(o=>assert(o.ownerId===userAId,'foreign order leaked'));
  });
  await tc('TC-014','Idempotent confirm final effect', async()=>{
    let r=await call('PUT',`/orders/${orderAId}/confirm`,undefined,tokenA);
    assert(r.status===200 && r.body.status==='confirmed','first confirm failed'); confirmedAtFirst=r.body.confirmedAt;
    r=await call('PUT',`/orders/${orderAId}/confirm`,undefined,tokenA);
    assert(r.status===200 && r.body.status==='confirmed','second confirm failed'); assert(r.body.confirmedAt===confirmedAtFirst,'repeated operation changed confirmedAt');
    r=await call('GET',`/orders/${orderAId}`,undefined,tokenA);
    assert(r.status===200 && r.body.status==='confirmed','final GET not confirmed'); assert(r.body.confirmedAt===confirmedAtFirst,'final effect changed');
  });

  for (const line of results) console.log(line);
  console.log('---');
  console.log(`RESULT: ${passed} passed, ${failed} failed, ${passed+failed} matrix cases`);
  process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error(e); process.exit(2); });
