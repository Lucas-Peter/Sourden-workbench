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

// ---------- 日期（北京时间） ----------
// Worker 跑在 UTC：北京时间 08:00 前 UTC 还停在前一天，所以统一 +8h 再取日期。
function bjToday() { return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10); }
function addDaysStr(d, n) {
  const [y, m, dd] = String(d).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10);
}

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
  await ensureTodoSchema(env);
  // 已完成超过 3 天的待办真正删除（含级联逐人勾选），仅保留近 3 天
  const cutoff = Date.now() - 3 * 86400000;
  await run(env, 'DELETE FROM todo_checks WHERE todo_id IN (SELECT id FROM todos WHERE done=1 AND done_at < ?)', cutoff);
  await run(env, 'DELETE FROM todos WHERE done=1 AND done_at < ?', cutoff);
  // 就餐自动上报：没人手动调整的日子，也按当天最后的数据补一条记录
  // 兜底包一层 try：自动上报出问题也不能让整个工作台打不开
  try { await ensureDiningHistory(env); }
  catch (e) { console.error('dining auto-report failed:', e && (e.stack || e.message || e)); }
  const [students, leaves, todos, todo_checks, dorm_checks, dining_optout, dining_daily,
    dining_history, dining_tables, dining_seats, violations, schedulesRows, settingsRows] = await Promise.all([
    all(env, 'SELECT * FROM students ORDER BY gender ASC, name ASC'),
    all(env, 'SELECT * FROM leaves ORDER BY start_date DESC, id DESC'),
    all(env, `SELECT * FROM todos WHERE done=0 OR (done=1 AND done_at >= ?)
              ORDER BY done ASC,
              (due_date IS NULL), due_date ASC,
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
  // 换宿舍时床号的处理：
  // - 明确指定了床号 → 照办，真撞车就 409 拒绝；
  // - 没指定床号（只改宿舍）→ 优先沿用旧床号；旧床号在新宿舍已被占，
  //   就退化成「只进宿舍、床号待排」，而不是整条请求失败（历史 bug）。
  const dormChanged = b.dorm !== undefined && String(b.dorm) !== String(cur.dorm || '');
  const nextDorm = f('dorm', cur.dorm);
  let nextBed = b.bed !== undefined ? b.bed : cur.bed;
  if (nextBed) {
    const conflict = await conflictBed(env, nextDorm, nextBed, id);
    if (conflict) {
      if (b.bed === undefined && dormChanged) nextBed = '';
      else return { conflict: true, name: conflict.name, bed: String(nextBed) };
    }
  }
  await run(env,
    `UPDATE students SET name=?,gender=?,dorm=?,bed=?,parent_phone=?,major=?,notes=?,
       dorm_leader=?,xueji_registered=?,insurance_paid=?,xueji_note=?,insurance_note=? WHERE id=?`,
    String(f('name', cur.name)).trim() || cur.name,
    f('gender', cur.gender) === '女' ? '女' : '男',
    String(nextDorm), String(nextBed ?? ''),
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
// 整间宿舍一次性调整：加入/移出/改床号/设宿舍长/在校状态，一个请求内算完最终状态再落库。
// 关键点：先算出「提交后每个人在哪间宿舍哪个床」，再做唯一性校验，
// 所以 A→B 换床、两人互换宿舍都不会被误判成「床号已被占用」。
async function assignDorm(env, dorm, b) {
  const target = String(dorm || '').trim();
  if (!target) return { conflict: true, message: '缺少目标宿舍' };
  const members = Array.isArray(b.members) ? b.members : [];
  const removeIds = (Array.isArray(b.remove) ? b.remove : []).map(Number);
  const students = await all(env, 'SELECT id,name,dorm,bed,dorm_leader FROM students');
  const byId = new Map(students.map(s => [s.id, s]));

  const finalDorm = new Map(), finalBed = new Map(), finalLeader = new Map();
  for (const s of students) {
    finalDorm.set(s.id, s.dorm || '');
    finalBed.set(s.id, s.bed || '');
    finalLeader.set(s.id, !!s.dorm_leader);
  }
  const touched = new Set();
  for (const id of removeIds) {
    if (!byId.has(id)) continue;
    finalDorm.set(id, ''); finalBed.set(id, ''); finalLeader.set(id, false);
    touched.add(id);
  }
  const leaderIds = [];
  for (const mb of members) {
    const id = Number(mb.id);
    if (!byId.has(id)) continue;
    finalDorm.set(id, target);
    finalBed.set(id, String(mb.bed ?? '').trim());
    finalLeader.set(id, !!mb.leader);
    if (mb.leader) leaderIds.push(id);
    touched.add(id);
  }
  // 唯一性校验：只看本次涉及的学生，避免历史重复数据把整次保存卡死
  for (const id of touched) {
    const d2 = finalDorm.get(id), bed = finalBed.get(id);
    if (!d2 || !bed) continue;
    for (const other of students) {
      if (other.id === id) continue;
      if (finalDorm.get(other.id) === d2 && finalBed.get(other.id) === bed) {
        return { conflict: true, dorm: d2, bed, name: other.name, self: byId.get(id).name };
      }
    }
  }
  const stmts = [];
  for (const id of touched) {
    stmts.push(env.DB.prepare('UPDATE students SET dorm=?, bed=?, dorm_leader=? WHERE id=?')
      .bind(finalDorm.get(id), finalBed.get(id), finalLeader.get(id) ? 1 : 0, id));
  }
  // 宿舍长唯一：本宿舍只保留最后一个被勾选的人
  if (leaderIds.length) {
    stmts.push(env.DB.prepare('UPDATE students SET dorm_leader=0 WHERE dorm=? AND id!=?')
      .bind(target, leaderIds[leaderIds.length - 1]));
  }
  if (stmts.length) {
    if (typeof env.DB.batch === 'function') await env.DB.batch(stmts);
    else for (const s of stmts) await s.run();
  }
  if (b.date && b.present && typeof b.present === 'object') {
    await saveDormCheck(env, { date: b.date, present: b.present });
  }
  return { ok: true };
}
async function deleteStudent(env, id) {
  const stu = await first(env, 'SELECT name FROM students WHERE id=?', id);
  if (!stu) return false;
  const name = stu.name;
  await run(env, 'DELETE FROM todo_checks WHERE student_id=?', id);
  await run(env, 'DELETE FROM dorm_checks WHERE student_id=?', id);
  await run(env, 'DELETE FROM dining_optout WHERE student_id=?', id);
  await run(env, 'DELETE FROM dining_seats WHERE student_id=?', id);
  await run(env, 'DELETE FROM leaves WHERE student_id=?', id);
  await run(env, 'DELETE FROM violations WHERE student_id=?', id);
  const r = await run(env, 'DELETE FROM students WHERE id=?', id);
  // 座次表按学号存储：删除该生后同步清掉对应座位
  const seat = await first(env, 'SELECT data FROM seating WHERE id=1');
  if (seat && seat.data) {
    try {
      const d = JSON.parse(seat.data);
      let changed = false;
      // 兜底：学号匹配（新数据）或姓名匹配（旧数据残留）都清掉
      if (Array.isArray(d.rows)) for (const row of d.rows) for (let c = 0; c < row.length; c++) if (String(row[c]) === String(id) || row[c] === name) { row[c] = null; changed = true; }
      if (changed) await run(env, 'UPDATE seating SET data=? WHERE id=1', JSON.stringify(d));
    } catch (e) {}
  }
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
  const today = bjToday();   // 按北京时间取返校日（UTC 会使 0-8 点登记成前一天）
  const r = await run(env, "UPDATE leaves SET status='已返校', returned_at=? WHERE id=?", today, id);
  return r.meta.changes > 0;
}
async function deleteLeave(env, id) {
  const r = await run(env, 'DELETE FROM leaves WHERE id=?', id);
  return r.meta.changes > 0;
}

// ---------- 待办 ----------
async function addTodo(env, b) {
  await ensureTodoSchema(env);
  const r = await run(env,
    `INSERT INTO todos(title,category,due_date,due_time,priority,link_roster,notes,remind_before,remind_on,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    String(b.title || '').trim() || '（无标题）',
    String(b.category || '其他'),
    b.due_date || null,
    normTime(b.due_time),
    ['高', '中', '低'].includes(b.priority) ? b.priority : '中',
    b.link_roster ? 1 : 0,
    String(b.notes || ''),
    normBefore(b.remind_before, 30),
    normOn(b.remind_on, 1),
    Date.now());
  if (r.meta.changes > 0 && b.link_roster) {
    // meta.last_row_id 由 D1 直接返回，省掉一次 last_insert_rowid 查询；
    // 名单用 INSERT ... SELECT 一条写完（43 人只需 1 条 SQL，不再逐人 INSERT）
    const id = (r.meta && r.meta.last_row_id) || (await first(env, 'SELECT last_insert_rowid() AS id')).id;
    await run(env, 'INSERT INTO todo_checks(todo_id,student_id,checked) SELECT ?, id, 0 FROM students', id);
  }
  return true;
}
async function patchTodo(env, id, b) {
  await ensureTodoSchema(env);
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
    await run(env, `UPDATE todos SET title=?,category=?,due_date=?,due_time=?,priority=?,link_roster=?,notes=?,remind_before=?,remind_on=? WHERE id=?`,
      String(b.title ?? cur.title).trim() || cur.title,
      String(b.category ?? cur.category),
      b.due_date !== undefined ? (b.due_date || null) : cur.due_date,
      b.due_time !== undefined ? normTime(b.due_time) : cur.due_time,
      ['高', '中', '低'].includes(b.priority) ? b.priority : cur.priority,
      b.link_roster !== undefined ? (b.link_roster ? 1 : 0) : cur.link_roster,
      String(b.notes ?? cur.notes),
      normBefore(b.remind_before, Number(cur.remind_before == null ? 30 : cur.remind_before)),
      normOn(b.remind_on, Number(cur.remind_on == null ? 1 : cur.remind_on)),
      id);
    // 若新开启关联花名册，补齐勾选行（一条 SQL 搞定，且不会产生重复行）
    if (b.link_roster === 1 && !cur.link_roster) {
      await run(env, `INSERT INTO todo_checks(todo_id,student_id,checked)
        SELECT ?, id, 0 FROM students
        WHERE id NOT IN (SELECT student_id FROM todo_checks WHERE todo_id=?)`, id, id);
    }
  }
  return true;
}
async function deleteTodo(env, id) {
  await run(env, 'DELETE FROM todo_checks WHERE todo_id=?', id);
  try { await run(env, 'DELETE FROM todo_reminders WHERE todo_id=?', id); } catch (e) {}
  const r = await run(env, 'DELETE FROM todos WHERE id=?', id);
  return r.meta.changes > 0;
}
// ---------- 批量写库小工具 ----------
// Cloudflare D1 限制「单次 Worker 调用最多 50 条查询」（免费版），一条 batch 只算 1 条。
// 早期实现是「逐人 SELECT + UPDATE」，43 人 = 86 条查询 → 直接超限报错，
// 表现就是「点保存没反应/只保存了一部分」。统一改成 batch 整批写。
async function execBatch(env, stmts) {
  if (!stmts || !stmts.length) return;
  if (typeof env.DB.batch === 'function') return env.DB.batch(stmts);
  for (const s of stmts) await s.run();   // 本地预览/测试环境的兜底
}
// 把 id 数组切成每块 90 个（SQLite 单条语句最多 100 个绑定参数）
function chunkIds(ids, size = 90) {
  const out = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}
function toIdList(raw) {
  return [...new Set((Array.isArray(raw) ? raw : [])
    .map(Number).filter(n => Number.isFinite(n) && n > 0))];
}

// 逐人核对保存：整体重建该待办的勾选行
// 入参两种都支持：{checked:[学生id...]}（新，体积小）/ {checks:{id:0|1}}（旧格式，兼容）
function saveTodoChecks(env, todoId, b) {
  const ids = Array.isArray(b.checked) ? toIdList(b.checked)
    : toIdList(Object.entries(b.checks || {}).filter(([, v]) => v && v !== '0').map(([k]) => k));
  const stmts = [
    env.DB.prepare('DELETE FROM todo_checks WHERE todo_id=?').bind(todoId),
    // 以花名册为准重建：全班先记 0，查重与「新增学生」都自动跟上
    env.DB.prepare('INSERT INTO todo_checks(todo_id,student_id,checked) SELECT ?, id, 0 FROM students').bind(todoId),
  ];
  for (const part of chunkIds(ids)) {
    stmts.push(env.DB.prepare(
      `UPDATE todo_checks SET checked=1 WHERE todo_id=? AND student_id IN (${part.map(() => '?').join(',')})`
    ).bind(todoId, ...part));
  }
  return execBatch(env, stmts).then(() => ids.length);
}


// ---------- 待办提醒 ----------
// todos 增加三列：due_time(HH:mm) / remind_before(提前多少分钟) / remind_on(是否提醒)
// todo_reminders 记录「哪条待办、哪种提醒、哪一天」已经发过，配合 5 分钟一轮的定时任务去重。
let todoSchemaReady = false;
async function ensureTodoSchema(env) {
  if (todoSchemaReady) return;
  todoSchemaReady = true;
  const soft = async (sql) => { try { await run(env, sql); } catch (e) { /* 列已存在 / 并发加列，忽略 */ } };
  let cols = [];
  try { cols = await all(env, "SELECT name FROM pragma_table_info('todos')"); } catch (e) { cols = []; }
  const has = (n) => Array.isArray(cols) && cols.some((c) => c.name === n);
  if (!has('due_time')) await soft('ALTER TABLE todos ADD COLUMN due_time TEXT');
  if (!has('remind_before')) await soft('ALTER TABLE todos ADD COLUMN remind_before INTEGER NOT NULL DEFAULT 30');
  if (!has('remind_on')) await soft('ALTER TABLE todos ADD COLUMN remind_on INTEGER NOT NULL DEFAULT 1');
  await soft(`CREATE TABLE IF NOT EXISTS todo_reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    todo_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    fire_date TEXT NOT NULL,
    sent_at INTEGER NOT NULL
  )`);
  await soft('CREATE UNIQUE INDEX IF NOT EXISTS idx_reminder_uniq ON todo_reminders(todo_id, kind, fire_date)');
}

// 推送渠道（当前接 PushPlus，微信收）：token 存在 settings 表的 notify 键里
const NOTIFY_DEFAULT = { pushplus_token: '', daily_summary: 1, daily_at: '08:00', overdue_daily: 1 };
async function getNotify(env) {
  const v = await getSetting(env, 'notify', {});
  return Object.assign({}, NOTIFY_DEFAULT, v && typeof v === 'object' ? v : {});
}
const htmlEsc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hhmmOf = (v) => (/^\d{1,2}:\d{2}/.test(String(v || '')) ? String(v).slice(0, 5).padStart(5, '0') : '');
// 北京时间（Worker 跑 UTC，+8h 再取日期/时刻）
function bjHM(ts) {
  const iso = new Date((ts == null ? Date.now() : ts) + 8 * 3600000).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}
// 「日期 + 时刻」→ 时间戳；没填时刻按当天 08:00
function bjTimestamp(dateStr, timeStr) {
  const t = hhmmOf(timeStr) || '08:00';
  const ts = Date.parse(dateStr + 'T' + t + ':00+08:00');
  return Number.isFinite(ts) ? ts : Date.parse(dateStr + 'T08:00:00+08:00');
}
async function sendPushplus(env, title, html, tokenOverride) {
  const cfg = await getNotify(env);
  const token = String(tokenOverride || cfg.pushplus_token || '').trim();
  if (!token) return { ok: false, error: 'no_token', message: '还没填 PushPlus token' };
  try {
    const res = await fetch('https://www.pushplus.plus/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, title: String(title).slice(0, 100), content: html, template: 'html' }),
    });
    const data = await res.json().catch(() => ({}));
    const ok = res.ok && Number(data.code) === 200;
    return { ok, code: data.code, message: data.msg || (ok ? '' : '发送失败 ' + res.status) };
  } catch (e) {
    return { ok: false, error: 'network', message: '推送请求失败：' + ((e && e.message) || e) };
  }
}

// 定时任务主体（每 5 分钟）：
//  ① 即将到期：now ≥ 截止时间 − 提前量，且还没过期太久 → 一条「快要到点了」
//  ② 每天 daily_at（默认 08:00）后第一次：一条汇总（今日待办 + 逾期未完成 + 请假/就餐人数）
async function runTodoReminders(env) {
  const cfg = await getNotify(env);
  if (!String(cfg.pushplus_token || '').trim()) return 0;      // 没配通道就不打扰，也不动库
  await ensureTodoSchema(env);
  const now = Date.now();
  const { date: today, time: nowHM } = bjHM(now);
  const todos = await all(env, 'SELECT * FROM todos WHERE done=0');
  await run(env, 'DELETE FROM todo_reminders WHERE fire_date < ?', addDaysStr(today, -7));
  const sentRows = await all(env, 'SELECT todo_id, kind FROM todo_reminders WHERE fire_date=?', today);
  const sent = new Set(sentRows.map((r) => r.todo_id + '|' + r.kind));
  const mark = [];
  let sentN = 0;

  // ① 快要到点
  const soon = [];
  for (const t of todos) {
    if (!t.due_date || Number(t.remind_on) === 0) continue;
    const dueTs = bjTimestamp(t.due_date, t.due_time);
    const beforeMin = Math.max(0, Math.min(1440, Number(t.remind_before == null ? 30 : t.remind_before) || 0));
    const fireTs = dueTs - beforeMin * 60000;
    if (now < fireTs || now > dueTs + 6 * 60000) continue;     // 没到点 / 早已过期（交给汇总）
    if (sent.has(t.id + '|before')) continue;
    soon.push({ t, dueTs });
  }
  if (soon.length) {
    const title = soon.length === 1 ? '快要到点了：' + soon[0].t.title : soon.length + ' 项待办快要到点';
    const html = '<p style="margin:0 0 8px">以下待办即将到期：</p><ul style="padding-left:18px;margin:0">'
      + soon.map(({ t }) => '<li><b>' + htmlEsc(t.title) + '</b> — ' + htmlEsc(t.due_date) + ' ' + htmlEsc(hhmmOf(t.due_time) || '08:00') + '</li>').join('')
      + '</ul><p style="color:#8a94a6;margin:12px 0 0;font-size:12px">来自班主任工作台</p>';
    const r = await sendPushplus(env, title, html);
    if (r.ok) { sentN++; for (const { t } of soon) mark.push(t.id); }
  }

  // ② 每日汇总（8:00 后第一条；没待办也没逾期就不发，免得天天骚扰）
  const dailyAt = hhmmOf(cfg.daily_at) || '08:00';
  if (Number(cfg.daily_summary) !== 0 && nowHM >= dailyAt && !sent.has('0|daily')) {
    const dueToday = todos.filter((t) => t.due_date === today)
      .sort((a, b) => String(hhmmOf(a.due_time) || '99:99').localeCompare(String(hhmmOf(b.due_time) || '99:99')));
    const overdue = Number(cfg.overdue_daily) === 0 ? [] : todos.filter((t) => t.due_date && t.due_date < today)
      .sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
    if (dueToday.length || overdue.length) {
      let extra = '';
      try {
        const ctx = await diningContext(env);
        const onleave = diningStatsFor(today, ctx).onleave;
        const dineTmw = diningStatsFor(addDaysStr(today, 1), ctx).final;
        extra = '<p style="margin:12px 0 0;color:#5f6470">班级：今日请假 ' + onleave + ' 人 · 明日就餐 ' + dineTmw + ' 人</p>';
      } catch (e) { /* 就餐数据取不到不影响提醒 */ }
      const title = '今日待办 ' + dueToday.length + ' 项' + (overdue.length ? ' · 逾期 ' + overdue.length + ' 项' : '');
      const html = (dueToday.length
        ? '<p style="margin:0 0 6px"><b>今天要做</b></p><ul style="padding-left:18px;margin:0 0 4px">'
        + dueToday.map((t) => '<li>' + (hhmmOf(t.due_time) ? htmlEsc(hhmmOf(t.due_time)) + ' ' : '') + htmlEsc(t.title) + '</li>').join('') + '</ul>'
        : '')
        + (overdue.length
          ? '<p style="margin:12px 0 6px;color:#dc2626"><b>逾期未完成</b></p><ul style="padding-left:18px;margin:0">'
          + overdue.map((t) => '<li>' + htmlEsc(t.due_date) + ' ' + htmlEsc(t.title) + '</li>').join('') + '</ul>'
          : '')
        + extra
        + '<p style="color:#8a94a6;margin:12px 0 0;font-size:12px">来自班主任工作台</p>';
      const r = await sendPushplus(env, title, html);
      if (r.ok) { sentN++; mark.push(0); }
    }
  }

  if (mark.length) {
    const stmts = [];
    for (const id of mark) {
      const kind = id === 0 ? 'daily' : 'before';
      stmts.push(env.DB.prepare('INSERT INTO todo_reminders(todo_id,kind,fire_date,sent_at) VALUES (?,?,?,?) ON CONFLICT DO NOTHING')
        .bind(id, kind, today, now));
    }
    await execBatch(env, stmts);
  }
  return sentN;
}

// 规范化待办的时间/提醒字段
const normTime = (v) => (hhmmOf(v) || null);
function normBefore(v, dflt) {
  if (v === undefined) return dflt;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1440) return dflt;
  return Math.round(n);
}
function normOn(v, dflt) {
  if (v === undefined) return dflt;
  return Number(v) === 0 ? 0 : 1;
}

// ---------- 宿舍核对 ----------
// 注意语义：只更新「本次提交里出现的学生」，未提及的人不落行
// （页面读不到行时按「在校」处理，所以不能按全班重建，否则全班会被标成不在校）。
// 写法改成批量：1 条删除 + 若干条多行插入，47 人只需 3 条 SQL。
async function saveDormCheck(env, b) {
  const date = b.date, map = b.present || {};
  const pairs = Object.entries(map)
    .map(([k, v]) => [Number(k), v ? 1 : 0])
    .filter(([id]) => Number.isFinite(id) && id > 0);
  if (!pairs.length) return 0;
  const stmts = [];
  for (const part of chunkIds(pairs.map(p => p[0]))) {
    stmts.push(env.DB.prepare(
      `DELETE FROM dorm_checks WHERE check_date=? AND student_id IN (${part.map(() => '?').join(',')})`
    ).bind(date, ...part));
  }
  // 每行 3 个绑定参数 → 每句最多 33 行（101 会超 100 上限）
  for (let i = 0; i < pairs.length; i += 33) {
    const part = pairs.slice(i, i + 33);
    const values = part.map(() => '(?,?,?)').join(',');
    const args = [];
    for (const [sid, present] of part) args.push(sid, date, present);
    stmts.push(env.DB.prepare(
      `INSERT INTO dorm_checks(student_id,check_date,present) VALUES ${values}`
    ).bind(...args));
  }
  await execBatch(env, stmts);
  return pairs.filter(p => p[1]).length;
}
async function clearDormCheck(env, b) {
  const r = await run(env, 'DELETE FROM dorm_checks WHERE check_date=?', b.date);
  return true;
}

// ---------- 就餐 ----------
// dining_history.source：manual = 老师手动上报；auto = 系统按当天数据自动上报
// dining_history.manual_final：自动覆盖手动时，留一手动值（界面上显示「手动 42」）
// 老库没有这些列时惰性补上（每个 Worker 实例只检查一次，无需手动跑 SQL）
let diningSchemaReady = false;
let diningHasSource = false;
let diningHasManualFinal = false;
async function ensureDiningSchema(env) {
  if (diningSchemaReady) return diningHasSource;
  diningSchemaReady = true;
  try {
    const cols = await all(env, "SELECT name FROM pragma_table_info('dining_history')");
    const names = (Array.isArray(cols) ? cols : []).map(c => c.name);
    diningHasSource = names.includes('source');
    diningHasManualFinal = names.includes('manual_final');
  } catch (e) { diningHasSource = false; diningHasManualFinal = false; }
  if (!diningHasSource) {
    try { await run(env, "ALTER TABLE dining_history ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'"); diningHasSource = true; } catch (e) {}
  }
  if (!diningHasManualFinal) {
    try { await run(env, 'ALTER TABLE dining_history ADD COLUMN manual_final INTEGER'); diningHasManualFinal = true; } catch (e) {}
  }
  return diningHasSource;
}

// 写一行上报快照：同一日期只保留最后一次
// manualFinal：本次是自动覆盖手动时，传被覆盖的手动值；手动保存/普通自动更新传 null
function historyUpsert(env, c, source, manualFinal) {
  const cols = ['date', 'total', 'onleave', 'optout', 'plus', 'minus', 'final', 'saved_at'];
  const args = [c.date, c.total, c.onleave, c.optout, c.plus, c.minus, c.final, Date.now()];
  let upd = 'ON CONFLICT(date) DO UPDATE SET total=excluded.total, onleave=excluded.onleave, optout=excluded.optout, plus=excluded.plus, minus=excluded.minus, final=excluded.final, saved_at=excluded.saved_at';
  if (diningHasSource) {
    cols.push('source'); args.push(source); upd += ', source=excluded.source';
  }
  if (diningHasManualFinal) {
    cols.push('manual_final'); args.push(manualFinal == null ? null : Number(manualFinal));
    // 手动保存 → 清空（以手动为准）；自动覆盖 → 记住被覆盖的手动值，且不覆盖更早记住的那个
    upd += diningHasSource
      ? ", manual_final=CASE WHEN excluded.source='manual' THEN NULL ELSE COALESCE(manual_final, excluded.manual_final) END"
      : ', manual_final=COALESCE(manual_final, excluded.manual_final)';
  }
  return env.DB.prepare(`INSERT INTO dining_history(${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')}) ${upd}`)
    .bind(...args);
}

// 一次性把算就餐人数要用的数据读进内存，避免按天循环查库
async function diningContext(env) {
  const [stuRow, leaves, optouts, dailies] = await Promise.all([
    first(env, 'SELECT COUNT(*) AS n FROM students'),
    all(env, 'SELECT student_id, start_date, end_date, returned_at, status FROM leaves'),
    all(env, 'SELECT date, COUNT(*) AS n FROM dining_optout GROUP BY date'),
    all(env, 'SELECT date, plus, minus FROM dining_daily'),
  ]);
  return {
    total: (stuRow && stuRow.n) || 0,
    // 请假按日期区间判断（含销假日），历史日期也能还原出当天真实人数
    leaves: leaves.map(l => ({ student_id: l.student_id, start_date: l.start_date,
      stop: l.returned_at || l.end_date || '', status: l.status })),
    optoutByDate: new Map(optouts.map(r => [r.date, r.n])),
    dailyByDate: new Map(dailies.map(r => [r.date, r])),
  };
}

// 一条请假记录是否覆盖某就餐日（与前端 leaveCoversOn 完全同口径）
// 结束点：销假日 > 预计结束日 > 未定（未定且已不是「请假中」则不覆盖任何日期）
function leaveCoversOn(l, date) {
  if (!l.start_date || l.start_date > date) return false;
  if (l.stop) return l.stop >= date;
  return l.status === '请假中';
}

// 某就餐日的应吃人数 = 总人数 - 当天请假 - 不就餐 + 手动增 - 手动减
// 请假按「学生」去重：同一人有多条重叠记录（重复登记）只算一人，与前端口径一致
function diningStatsFor(date, ctx) {
  const onSet = new Set();
  for (const l of ctx.leaves) if (leaveCoversOn(l, date)) onSet.add(l.student_id);
  const onleave = onSet.size;
  const optout = ctx.optoutByDate.get(date) || 0;
  const daily = ctx.dailyByDate.get(date) || {};
  const plus = Number(daily.plus || 0), minus = Number(daily.minus || 0);
  return { date, total: ctx.total, onleave, optout, plus, minus,
    final: Math.max(0, ctx.total - onleave - optout + plus - minus) };
}

// 自动上报：按「当前真实数据」重算并写快照。
// 覆盖规则：
//   - 今天以前（历史日）：老师手动报过的就是定稿，一律不动；自动记录照旧随数据更新
//   - 今天 / 明天：数据还会变，自动跑得比手动晚 → 用最新数据覆盖手动的旧值（并留一手动值备查）
// 范围：最近 7 天（含今天）；「明天」只在已经有一条记录时才纳入，避免把没报过的日子凭空补出来，
//      也保证老师删掉周末那行后不会被重新生成。
const DINING_AUTO_DAYS = 7;
async function ensureDiningHistory(env) {
  await ensureDiningSchema(env);
  const [hist, ctx] = await Promise.all([
    all(env, 'SELECT * FROM dining_history'),
    diningContext(env),
  ]);
  const histByDate = new Map(hist.map(r => [r.date, r]));
  const today = bjToday();
  const tomorrow = addDaysStr(today, 1);
  // 明天已有记录（老师已经上报过）→ 一起纳入重算，让明早备餐用最新数字
  const until = histByDate.has(tomorrow) ? tomorrow : today;
  // 补报起点：最早有就餐数据的那天（历史记录 / 手动增减 / 不吃名单 / 请假），且最多回溯 7 天
  const starts = [today, ...hist.map(r => r.date), ...ctx.dailyByDate.keys(),
    ...ctx.optoutByDate.keys(), ...ctx.leaves.map(l => l.start_date)].filter(Boolean).sort();
  const floor = addDaysStr(today, -(DINING_AUTO_DAYS - 1));
  let from = starts[0] || today;
  if (from < floor) from = floor;
  if (from > until) from = until;   // 只有未来日期的记录时，也要保证今天被检查
  const stmts = [];
  for (let d = from; d <= until; d = addDaysStr(d, 1)) {
    const old = histByDate.get(d);
    // 历史日的手动记录 = 已定稿，不改写
    if (old && old.source !== 'auto' && d < today) continue;
    const c = diningStatsFor(d, ctx);
    if (old
      && Number(old.final) === c.final && Number(old.total) === c.total
      && Number(old.onleave) === c.onleave && Number(old.optout) === c.optout
      && Number(old.plus) === c.plus && Number(old.minus) === c.minus) continue; // 值没变 → 原样保留（手动继续标手动）
    const overwritten = (old && old.source !== 'auto') ? Number(old.final) : null;
    stmts.push(historyUpsert(env, c, 'auto', overwritten));
  }
  if (stmts.length) {
    if (typeof env.DB.batch === 'function') await env.DB.batch(stmts);
    else for (const s of stmts) await s.run();
  }
  return stmts.length;
}

async function saveDining(env, b) {
  await ensureDiningSchema(env);
  const date = b.date;
  if (Array.isArray(b.optout)) {
    // 不吃名单最多可到全班人数，逐条 INSERT 会顶到 D1 单次查询上限 → 改 batch
    const stmts = [env.DB.prepare('DELETE FROM dining_optout WHERE date=?').bind(date)];
    for (const sid of toIdList(b.optout)) {
      stmts.push(env.DB.prepare('INSERT INTO dining_optout(date,student_id) VALUES (?,?)').bind(date, sid));
    }
    await execBatch(env, stmts);
  }
  const plus = Number(b.plus || 0), minus = Number(b.minus || 0);
  await run(env, 'INSERT INTO dining_daily(date,plus,minus) VALUES (?,?,?) ON CONFLICT(date) DO UPDATE SET plus=excluded.plus, minus=excluded.minus', date, plus, minus);
  // 老师手动上报：写 manual 快照（同一日期只保留最后一次）
  const c = diningStatsFor(date, await diningContext(env));
  const stmt = historyUpsert(env, c, 'manual');
  await stmt.run();
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
  const members = toIdList(b.members);
  const stmts = [env.DB.prepare('DELETE FROM dining_seats WHERE table_id=?').bind(id)];
  members.forEach((sid, pos) => stmts.push(
    env.DB.prepare('INSERT INTO dining_seats(table_id,student_id,position) VALUES (?,?,?)').bind(id, sid, pos)));
  await execBatch(env, stmts);
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
  for (const t of ['students', 'leaves', 'todos', 'todo_checks', 'todo_reminders', 'dorm_checks', 'dining_optout',
    'dining_daily', 'dining_history', 'dining_tables', 'dining_seats', 'violations', 'schedules', 'settings']) {
    try { dump[t] = await all(env, `SELECT * FROM ${t}`); } catch (e) { dump[t] = []; }
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
      if (r && r.conflict) return json({ error: 'bed_taken', name: r.name, message: `床号已被 ${r.name} 占用` }, 409);
      return json({ ok: true, id: r.id }, 201);
    }
    const id = Number(seg[1]);
    if (m === 'PATCH') {
      const r = await patchStudent(env, id, body);
      if (r && r.conflict) return json({ error: 'bed_taken', name: r.name, bed: r.bed, message: `床号 ${r.bed || ''} 已被 ${r.name} 占用` }, 409);
      return json({ ok: !!r });
    }
    if (m === 'DELETE') return json({ ok: await deleteStudent(env, id) });
  }
  if (seg[0] === 'dorm-assign' && m === 'PUT') {
    const r = await assignDorm(env, body.dorm, body);
    if (r.conflict) return json({ error: 'bed_taken', name: r.name, bed: r.bed, dorm: r.dorm,
      message: r.message || `${r.dorm || body.dorm} 的 ${r.bed} 号床已被 ${r.name} 占用` }, 409);
    return json({ ok: true });
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
    if (m === 'PUT' && seg[2] === 'checks') {
      const t = await first(env, 'SELECT id FROM todos WHERE id=?', id);
      if (!t) return json({ ok: false, error: 'todo_not_found', message: '这条待办已被删除，请刷新页面' }, 404);
      const n = await saveTodoChecks(env, id, body);
      return json({ ok: true, checked: n });
    }
  }
  if (seg[0] === 'dorm-check') {
    if (m === 'PUT') return json({ ok: await saveDormCheck(env, body) });
    if (m === 'DELETE') return json({ ok: await clearDormCheck(env, body) });
  }
  if (seg[0] === 'dining' && m === 'PUT') { await ensureDiningSchema(env); return json({ ok: await saveDining(env, body) }); }
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
  if (seg[0] === 'notify' && m === 'POST' && seg[1] === 'test') {
    const r = await sendPushplus(env, '工作台提醒测试',
      '<p>如果你在微信里看到这条消息，说明待办提醒已经通了。</p>'
      + '<p style="color:#8a94a6;font-size:12px">之后「快要到点」「每日汇总」「逾期未完成」都会推到这里。</p>',
      body.token);
    return json(r, r.ok ? 200 : 400);
  }
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
    // 桌面卡片用短地址 /widget（实际文件是 /widget.html）
    if (url.pathname === '/widget' || url.pathname === '/widget/') {
      return env.ASSETS.fetch(new Request(new URL('/widget.html', url).toString(), request));
    }
    // manifest 必须按 application/manifest+json 返回，否则浏览器不认，装不了应用
    if (url.pathname === '/manifest.webmanifest') {
      const r = await env.ASSETS.fetch(new Request(new URL('/manifest.webmanifest', url).toString(), request));
      return new Response(r.body, {
        status: r.status,
        headers: { 'content-type': 'application/manifest+json; charset=utf-8', 'cache-control': 'no-cache' },
      });
    }
    return env.ASSETS.fetch(request);
  },
  // 定时任务（见 wrangler.toml）：
  //   */5 * * * *  → 待办提醒（每 5 分钟检查一次，发过的不重复发）
  //   0 15 * * *   → 每天 23:00（北京时间）补就餐上报
  async scheduled(event, env, ctx) {
    const cron = (event && event.cron) || '';
    const job = (async () => {
      try { await runTodoReminders(env); }
      catch (e) { console.error('todo reminders failed:', e && (e.stack || e.message || e)); }
      if (!cron || cron === '0 15 * * *') {
        try { await ensureDiningHistory(env); }
        catch (e) { console.error('dining auto-report failed:', e && (e.stack || e.message || e)); }
      }
    })();
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(job); else await job;
  },
};
