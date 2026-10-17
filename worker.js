// 班主任工作台 · Cloudflare Worker（API 层）
// 前端由 [assets] 托管；无登录——靠难猜的专属子域名（如 wb-xxxx.sourden.com）做访问隔离，此处无鉴权逻辑。
// 数据模型：花名册 students 是唯一数据源，其余模块均关联 student_id。

const json = (d, s = 200) => new Response(JSON.stringify(d), {
  status: s, headers: { 'content-type': 'application/json; charset=utf-8' },
});

// ---------- 工具 ----------
async function all(env, sql, ...args) { return (await env.DB.prepare(sql).bind(...args).all()).results; }
async function run(env, sql, ...args) { return env.DB.prepare(sql).bind(...args).run(); }
async function first(env, sql, ...args) { return env.DB.prepare(sql).bind(...args).first(); }

async function getSetting(env, key, fallback) {
  const row = await first(env, 'SELECT value FROM settings WHERE key=?', key);
  return row ? JSON.parse(row.value) : fallback;
}
async function setSetting(env, key, value) {
  await run(env, 'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    key, JSON.stringify(value));
}

// ---------- 全量状态 ----------
async function getState(env) {
  // 已完成超过 3 天的待办真正删除（含级联逐人勾选），仅保留近 3 天
  const cutoff = Date.now() - 3 * 86400000;
  await run(env, 'DELETE FROM todo_checks WHERE todo_id IN (SELECT id FROM todos WHERE done=1 AND done_at < ?)', cutoff);
  await run(env, 'DELETE FROM todos WHERE done=1 AND done_at < ?', cutoff);
  const [students, leaves, todos, todo_checks, dorm_checks, dining_optout, dining_daily,
    dining_history, dining_tables, dining_seats, violations, schedulesRows, settingsRows] = await Promise.all([
    all(env, 'SELECT * FROM students ORDER BY gender ASC, name ASC'),
    all(env, 'SELECT * FROM leaves ORDER BY start_date DESC, id DESC'),
    all(env, `SELECT * FROM todos WHERE done=0 OR (done=1 AND done_at >= ?)
              ORDER BY (due_date IS NULL), due_date ASC,
              CASE priority WHEN '高' THEN 0 WHEN '中' THEN 1 ELSE 2 END, created_at ASC`,
      Date.now() - 3 * 86400000),
    all(env, 'SELECT * FROM todo_checks'),
    all(env, 'SELECT * FROM dorm_checks'),
    all(env, 'SELECT * FROM dining_optout'),
    all(env, 'SELECT * FROM dining_daily'),
    all(env, 'SELECT * FROM dining_history ORDER BY date DESC'),
    all(env, 'SELECT * FROM dining_tables ORDER BY position ASC, id ASC'),
    all(env, 'SELECT * FROM dining_seats ORDER BY position ASC, id ASC'),
    all(env, 'SELECT * FROM violations ORDER BY date DESC, id DESC'),
    all(env, 'SELECT * FROM schedules'),
    all(env, 'SELECT * FROM settings'),
  ]);
  const seating = await first(env, 'SELECT data FROM seating WHERE id=1');
  const settings = {};
  for (const r of settingsRows) { try { settings[r.key] = JSON.parse(r.value); } catch { settings[r.key] = r.value; } }
  const schedules = {};
  for (const r of schedulesRows) { try { schedules[r.kind] = JSON.parse(r.data); } catch { schedules[r.kind] = {}; } }
  return json({
    settings,
    students, leaves, todos, todo_checks, dorm_checks,
    dining_optout, dining_daily, dining_history,
    tables: dining_tables, seats: dining_seats,
    seating: seating ? JSON.parse(seating.data) : null,
    violations, schedules,
  });
}

// ---------- 花名册 ----------
// 宿舍床位排重：同一宿舍同一床号只能有一人（exceptId 排除自己）
async function conflictBed(env, dorm, bed, exceptId) {
  if (!dorm || !bed) return null;
  return await first(env, 'SELECT id, name FROM students WHERE dorm=? AND bed=? AND id!=?', dorm, bed, exceptId ?? -1);
}
async function addStudent(env, b) {
  const conflict = await conflictBed(env, String(b.dorm || ''), String(b.bed || ''), null);
  if (conflict) return { conflict: true, name: conflict.name };
  const r = await run(env,
    `INSERT INTO students (name,gender,dorm,bed,parent_phone,major,notes,dorm_leader,xueji_registered,insurance_paid,xueji_note,insurance_note,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    String(b.name || '').trim() || '（无名）',
    b.gender === '女' ? '女' : '男',
    String(b.dorm || ''), String(b.bed || ''), String(b.parent_phone || ''),
    String(b.major || ''), String(b.notes || ''),
    b.dorm_leader ? 1 : 0, b.xueji_registered ? 1 : 0, b.insurance_paid ? 1 : 0,
    String(b.xueji_note || ''), String(b.insurance_note || ''),
    Date.now());
  return { id: r.meta.changes > 0 ? (await first(env, 'SELECT last_insert_rowid() AS id')).id : null };
}
async function patchStudent(env, id, b) {
  const cur = await first(env, 'SELECT * FROM students WHERE id=?', id);
  if (!cur) return false;
  const f = (k, d) => (b[k] !== undefined ? b[k] : d);
  // 宿舍床位排重：若改了宿舍/床号且与他人冲突，拒绝（前端也会预检）
  if (b.dorm !== undefined || b.bed !== undefined) {
    const conflict = await conflictBed(env, f('dorm', cur.dorm), f('bed', cur.bed), id);
    if (conflict) return { conflict: true, name: conflict.name };
  }
  await run(env,
    `UPDATE students SET name=?,gender=?,dorm=?,bed=?,parent_phone=?,major=?,notes=?,
       dorm_leader=?,xueji_registered=?,insurance_paid=?,xueji_note=?,insurance_note=? WHERE id=?`,
    String(f('name', cur.name)).trim() || cur.name,
    f('gender', cur.gender) === '女' ? '女' : '男',
    String(f('dorm', cur.dorm)), String(f('bed', cur.bed)),
    String(f('parent_phone', cur.parent_phone)), String(f('major', cur.major)),
    String(f('notes', cur.notes)),
    f('dorm_leader', cur.dorm_leader) ? 1 : 0,
    f('xueji_registered', cur.xueji_registered) ? 1 : 0,
    f('insurance_paid', cur.insurance_paid) ? 1 : 0,
    String(f('xueji_note', cur.xueji_note)), String(f('insurance_note', cur.insurance_note)),
    id);
  // 宿舍长唯一性：若把某人设为宿舍长，取消同宿舍其他人
  if (b.dorm_leader === 1 && f('dorm', cur.dorm)) {
    await run(env, 'UPDATE students SET dorm_leader=0 WHERE dorm=? AND id!=?', f('dorm', cur.dorm), id);
  }
  return true;
}
async function deleteStudent(env, id) {
  await run(env, 'DELETE FROM todo_checks WHERE student_id=?', id);
  await run(env, 'DELETE FROM dorm_checks WHERE student_id=?', id);
  await run(env, 'DELETE FROM dining_optout WHERE student_id=?', id);
  await run(env, 'DELETE FROM dining_seats WHERE student_id=?', id);
  await run(env, 'DELETE FROM leaves WHERE student_id=?', id);
  await run(env, 'DELETE FROM violations WHERE student_id=?', id);
  const r = await run(env, 'DELETE FROM students WHERE id=?', id);
  return r.meta.changes > 0;
}

// ---------- 请假 ----------
async function addLeaves(env, b) {
  const ids = Array.isArray(b.student_ids) ? b.student_ids : (b.student_id ? [b.student_id] : []);
  if (!ids.length) return 0;
  const now = Date.now();
  let n = 0;
  for (const sid of ids) {
    await run(env,
      'INSERT INTO leaves(student_id,start_date,end_date,reason,status,created_at) VALUES (?,?,?,?,?,?)',
      sid, b.start_date, b.end_date || null, String(b.reason || ''), '请假中', now);
    n++;
  }
  return n;
}
async function patchLeave(env, id, b) {
  const cur = await first(env, 'SELECT * FROM leaves WHERE id=?', id);
  if (!cur) return false;
  await run(env, 'UPDATE leaves SET start_date=?,end_date=?,reason=?,status=? WHERE id=?',
    b.start_date ?? cur.start_date, b.end_date ?? cur.end_date,
    b.reason ?? cur.reason, b.status ?? cur.status, id);
  return true;
}
async function returnLeave(env, id) {
  const today = new Date().toISOString().slice(0, 10);
  const r = await run(env, "UPDATE leaves SET status='已返校', returned_at=? WHERE id=?", today, id);
  return r.meta.changes > 0;
}
async function deleteLeave(env, id) {
  const r = await run(env, 'DELETE FROM leaves WHERE id=?', id);
  return r.meta.changes > 0;
}

// ---------- 待办 ----------
async function addTodo(env, b) {
  const r = await run(env,
    `INSERT INTO todos(title,category,due_date,priority,link_roster,notes,created_at)
     VALUES (?,?,?,?,?,?,?)`,
    String(b.title || '').trim() || '（无标题）',
    String(b.category || '其他'),
    b.due_date || null,
    ['高', '中', '低'].includes(b.priority) ? b.priority : '中',
    b.link_roster ? 1 : 0,
    String(b.notes || ''), Date.now());
  if (r.meta.changes > 0 && b.link_roster) {
    const id = (await first(env, 'SELECT last_insert_rowid() AS id')).id;
    const students = await all(env, 'SELECT id FROM students');
    for (const s of students) await run(env, 'INSERT INTO todo_checks(todo_id,student_id,checked) VALUES (?,?,0)', id, s.id);
  }
  return true;
}
async function patchTodo(env, id, b) {
  const cur = await first(env, 'SELECT * FROM todos WHERE id=?', id);
  if (!cur) return false;
  if (b.action === 'done') {
    await run(env, 'UPDATE todos SET done=1, done_at=? WHERE id=?', Date.now(), id);
  } else if (b.action === 'undone') {
    await run(env, 'UPDATE todos SET done=0, done_at=NULL WHERE id=?', id);
  } else if (b.action === 'postpone') {
    // 时区安全：按 UTC 日期分量 +1 天，避免 'YYYY-MM-DDT00:00:00' 被当本地时间解析
    let next;
    if (cur.due_date && /^\d{4}-\d{2}-\d{2}$/.test(cur.due_date)) {
      const [y, m, d] = cur.due_date.split('-').map(Number);
      next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    } else {
      next = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    }
    await run(env, 'UPDATE todos SET due_date=?, postpone_count=postpone_count+1 WHERE id=?', next, id);
  } else {
    await run(env, 'UPDATE todos SET title=?,category=?,due_date=?,priority=?,link_roster=?,notes=? WHERE id=?',
      String(b.title ?? cur.title).trim() || cur.title,
      String(b.category ?? cur.category),
      b.due_date !== undefined ? (b.due_date || null) : cur.due_date,
      ['高', '中', '低'].includes(b.priority) ? b.priority : cur.priority,
      b.link_roster !== undefined ? (b.link_roster ? 1 : 0) : cur.link_roster,
      String(b.notes ?? cur.notes), id);
    // 若新开启关联花名册，补齐勾选行
    if (b.link_roster === 1 && !cur.link_roster) {
      const students = await all(env, 'SELECT id FROM students');
      for (const s of students) await run(env, 'INSERT INTO todo_checks(todo_id,student_id,checked) VALUES (?,?,0)', id, s.id);
    }
  }
  return true;
}
async function deleteTodo(env, id) {
  await run(env, 'DELETE FROM todo_checks WHERE todo_id=?', id);
  const r = await run(env, 'DELETE FROM todos WHERE id=?', id);
  return r.meta.changes > 0;
}
async function saveTodoChecks(env, todoId, b) {
  const map = b.checks || {};
  for (const [sid, val] of Object.entries(map)) {
    const exist = await first(env, 'SELECT id FROM todo_checks WHERE todo_id=? AND student_id=?', todoId, sid);
    if (exist) await run(env, 'UPDATE todo_checks SET checked=? WHERE id=?', val ? 1 : 0, exist.id);
    else await run(env, 'INSERT INTO todo_checks(todo_id,student_id,checked) VALUES (?,?,?)', todoId, sid, val ? 1 : 0);
  }
  return true;
}

// ---------- 宿舍核对 ----------
async function saveDormCheck(env, b) {
  const date = b.date, map = b.present || {};
  for (const [sid, val] of Object.entries(map)) {
    const exist = await first(env, 'SELECT id FROM dorm_checks WHERE student_id=? AND check_date=?', sid, date);
    if (exist) await run(env, 'UPDATE dorm_checks SET present=? WHERE id=?', val ? 1 : 0, exist.id);
    else await run(env, 'INSERT INTO dorm_checks(student_id,check_date,present) VALUES (?,?,?)', sid, date, val ? 1 : 0);
  }
  return true;
}
async function clearDormCheck(env, b) {
  const r = await run(env, 'DELETE FROM dorm_checks WHERE check_date=?', b.date);
  return true;
}

// ---------- 就餐 ----------
async function saveDining(env, b) {
  const date = b.date;
  if (Array.isArray(b.optout)) {
    await run(env, 'DELETE FROM dining_optout WHERE date=?', date);
    for (const sid of b.optout) await run(env, 'INSERT INTO dining_optout(date,student_id) VALUES (?,?)', date, sid);
  }
  const plus = Number(b.plus || 0), minus = Number(b.minus || 0);
  await run(env, 'INSERT INTO dining_daily(date,plus,minus) VALUES (?,?,?) ON CONFLICT(date) DO UPDATE SET plus=excluded.plus, minus=excluded.minus', date, plus, minus);
  // 写上报快照（上报记录弹窗用）
  const total = (await all(env, 'SELECT COUNT(*) AS n FROM students'))[0].n;
  const onleave = (await all(env, "SELECT COUNT(*) AS n FROM leaves WHERE status='请假中' AND start_date<=? AND (end_date IS NULL OR end_date>=?)", date, date))[0].n;
  const optoutN = (await all(env, 'SELECT COUNT(*) AS n FROM dining_optout WHERE date=?', date))[0].n;
  await run(env, `INSERT INTO dining_history(date,total,onleave,optout,plus,minus,final,saved_at)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(date) DO UPDATE SET total=excluded.total, onleave=excluded.onleave, optout=excluded.optout,
      plus=excluded.plus, minus=excluded.minus, final=excluded.final, saved_at=excluded.saved_at`,
    date, total, onleave, optoutN, plus, minus,
    Math.max(0, total - onleave - optoutN + plus - minus), Date.now());
  return true;
}

// ---------- 席位 ----------
async function addTable(env, b) {
  const max = await first(env, 'SELECT COALESCE(MAX(position),0) AS p FROM dining_tables');
  const r = await run(env, 'INSERT INTO dining_tables(label,position) VALUES (?,?)',
    String(b.label || '新桌'), (max?.p || 0) + 1);
  return r.meta.changes > 0;
}
async function patchTable(env, id, b) {
  const r = await run(env, 'UPDATE dining_tables SET label=? WHERE id=?', String(b.label || '桌'), id);
  return r.meta.changes > 0;
}
async function deleteTable(env, id) {
  await run(env, 'DELETE FROM dining_seats WHERE table_id=?', id);
  const r = await run(env, 'DELETE FROM dining_tables WHERE id=?', id);
  return r.meta.changes > 0;
}
async function saveTableMembers(env, id, b) {
  const members = Array.isArray(b.members) ? b.members : [];
  await run(env, 'DELETE FROM dining_seats WHERE table_id=?', id);
  let pos = 0;
  for (const sid of members) await run(env, 'INSERT INTO dining_seats(table_id,student_id,position) VALUES (?,?,?)', id, sid, pos++);
  return true;
}

// ---------- 座次表 ----------
async function saveSeating(env, b) {
  const data = JSON.stringify({ layout: b.layout || [2, 3, 2], rows: b.rows || [] });
  await run(env, 'INSERT INTO seating(id,data) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data', data);
  return true;
}

// ---------- 违规 ----------
async function addViolation(env, b) {
  const r = await run(env, 'INSERT INTO violations(student_id,type,date,details,action,created_at) VALUES (?,?,?,?,?,?)',
    b.student_id, String(b.type || '其他违规'), b.date, String(b.details || ''), String(b.action || ''), Date.now());
  return r.meta.changes > 0;
}
async function deleteViolation(env, id) {
  const r = await run(env, 'DELETE FROM violations WHERE id=?', id);
  return r.meta.changes > 0;
}

// ---------- 课程表 ----------
async function saveSchedule(env, kind, b) {
  await run(env, 'INSERT INTO schedules(kind,data) VALUES (?,?) ON CONFLICT(kind) DO UPDATE SET data=excluded.data',
    kind === 'personal' ? 'personal' : 'class', JSON.stringify(b.data || {}));
  return true;
}

// ---------- 导出 ----------
async function exportAll(env) {
  const dump = {};
  for (const t of ['students', 'leaves', 'todos', 'todo_checks', 'dorm_checks', 'dining_optout',
    'dining_daily', 'dining_history', 'dining_tables', 'dining_seats', 'violations', 'schedules', 'settings']) {
    dump[t] = await all(env, `SELECT * FROM ${t}`);
  }
  const seating = await first(env, 'SELECT data FROM seating WHERE id=1');
  dump.seating = seating ? JSON.parse(seating.data) : null;
  return json({ exported_at: new Date().toISOString(), data: dump });
}

// ---------- 路由 ----------
async function route(request, env) {
  const url = new URL(request.url);
  const p = url.pathname.replace(/^\/api\/?/, '');
  const m = request.method;
  const body = (m === 'POST' || m === 'PATCH' || m === 'PUT') ? await request.json().catch(() => ({})) : {};
  const seg = p.split('/');

  if (m === 'GET' && p === 'state') return getState(env);
  if (m === 'GET' && p === 'export') return exportAll(env);

  if (seg[0] === 'students') {
    if (m === 'POST' && seg.length === 1) {
      const r = await addStudent(env, body);
      if (r && r.conflict) return json({ error: 'bed_taken', name: r.name }, 409);
      return json({ ok: true, id: r.id }, 201);
    }
    const id = Number(seg[1]);
    if (m === 'PATCH') {
      const r = await patchStudent(env, id, body);
      if (r && r.conflict) return json({ error: 'bed_taken', name: r.name }, 409);
      return json({ ok: !!r });
    }
    if (m === 'DELETE') return json({ ok: await deleteStudent(env, id) });
  }
  if (seg[0] === 'leaves') {
    if (m === 'POST' && seg.length === 1) return json({ ok: true, added: await addLeaves(env, body) }, 201);
    const id = Number(seg[1]);
    if (m === 'PATCH' && seg.length === 2) return json({ ok: await patchLeave(env, id, body) });
    if (m === 'POST' && seg[2] === 'return') return json({ ok: await returnLeave(env, id) });
    if (m === 'DELETE') return json({ ok: await deleteLeave(env, id) });
  }
  if (seg[0] === 'todos') {
    if (m === 'POST' && seg.length === 1) return json({ ok: await addTodo(env, body) }, 201);
    const id = Number(seg[1]);
    if (m === 'PATCH' && seg.length === 2) return json({ ok: await patchTodo(env, id, body) });
    if (m === 'DELETE') return json({ ok: await deleteTodo(env, id) });
    if (m === 'PUT' && seg[2] === 'checks') return json({ ok: await saveTodoChecks(env, id, body) });
  }
  if (seg[0] === 'dorm-check') {
    if (m === 'PUT') return json({ ok: await saveDormCheck(env, body) });
    if (m === 'DELETE') return json({ ok: await clearDormCheck(env, body) });
  }
  if (seg[0] === 'dining' && m === 'PUT') return json({ ok: await saveDining(env, body) });
  if (seg[0] === 'tables') {
    if (m === 'POST' && seg.length === 1) return json({ ok: await addTable(env, body) }, 201);
    const id = Number(seg[1]);
    if (m === 'PATCH') return json({ ok: await patchTable(env, id, body) });
    if (m === 'DELETE') return json({ ok: await deleteTable(env, id) });
    if (m === 'PUT' && seg[2] === 'members') return json({ ok: await saveTableMembers(env, id, body) });
  }
  if (seg[0] === 'seating' && m === 'PUT') return json({ ok: await saveSeating(env, body) });
  if (seg[0] === 'violations') {
    if (m === 'POST' && seg.length === 1) return json({ ok: await addViolation(env, body) }, 201);
    if (m === 'DELETE') return json({ ok: await deleteViolation(env, Number(seg[1])) });
  }
  if (seg[0] === 'schedule' && m === 'PUT') return json({ ok: await saveSchedule(env, seg[1], body) });
  if (seg[0] === 'settings' && m === 'PUT') {
    await setSetting(env, Object.keys(body)[0], Object.values(body)[0]);
    return json({ ok: true });
  }

  return json({ error: 'Not found: ' + p }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
      try { return await route(request, env); }
      catch (e) { return json({ error: String((e && e.message) || e) }, 500); }
    }
    return env.ASSETS.fetch(request);
  },
};
