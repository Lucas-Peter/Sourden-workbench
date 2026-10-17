/* 班主任工作台 · 前端逻辑（SPA） */
'use strict';

/* ---------- 常量 ---------- */
const DORMS = ['405男','405女','406男','406女','407男','407女','409女','410女','411女','413男'];
const CATS = {
  '宿舍':{ico:'🏠',cls:'info'}, '就餐':{ico:'🍚',cls:'ok'}, '请假':{ico:'📋',cls:'mid'},
  '学籍':{ico:'🎓',cls:'mid'}, '保险':{ico:'🛡',cls:'info'}, '教学':{ico:'📚',cls:'lo'}, '其他':{ico:'📌',cls:'lo'},
};
const PERIODS = ['上午1','上午2','上午3','上午4','下午1','下午2','下午3','晚上1','晚上2'];
const DAYS = ['周一','周二','周三','周四','周五'];
const LAYOUT_PRESETS = [[2,3,2],[2,4,2],[3,4],[2,2,2,2],[3,3,2],[2,3,3]];
const VIO_TYPES = ['沉迷手机','课堂违规','其他违规'];

// 真实默认课表（2026-10-14 提供）：26电商综合班 班级课程表 + 杜栋玲 个人课程表
const DEFAULT_CLASS_SCHED = {
  '上午1': [
    {s:'计算机应用基础',t:'陈漱钰'},{s:'Excel表格制作',t:'陈漱钰'},{s:'Ps',t:'杨香玉'},{s:'计算机应用基础',t:'陈漱钰'},{s:'Ps',t:'杨香玉'},
  ],
  '上午2': [
    {s:'计算机应用基础',t:'陈漱钰'},{s:'Excel表格制作',t:'陈漱钰'},{s:'Ps',t:'杨香玉'},{s:'计算机应用基础',t:'陈漱钰'},{s:'Ps',t:'杨香玉'},
  ],
  '上午3': [
    {s:'计算机应用基础',t:'陈漱钰'},{s:'体育',t:'张舒'},{s:'Ps',t:'杨香玉'},{s:'安全教育',t:'刘兴杰'},{s:'Ps',t:'杨香玉'},
  ],
  '上午4': [
    {s:'计算机应用基础',t:'陈漱钰'},{s:'体育',t:'张舒'},{s:'Ps',t:'杨香玉'},{s:'美术',t:'马硕'},{s:'Ps',t:'杨香玉'},
  ],
  '下午1': [
    {s:'电子商务',t:'张学辉'},{s:'计算机组装维护',t:'吴巍'},{s:'物流',t:'张学辉'},{s:'音乐',t:'李沐庭'},{s:'班会',t:''},
  ],
  '下午2': [
    {s:'电子商务',t:'张学辉'},{s:'计算机组装维护',t:'吴巍'},{s:'物流',t:'张学辉'},{s:'音乐',t:'李沐庭'},{s:'班会',t:''},
  ],
  '下午3': [
    {s:'书法',t:''},{s:'文体活动',t:''},{s:'普通话',t:'武磊'},{s:'心理健康',t:'梁素佩'},{},
  ],
  '晚上1': [
    {s:'计算机应用基础',t:'陈漱钰'},{s:'电子商务',t:'张学辉'},{s:'Ps',t:'杨香玉'},{s:'班主任',t:''},{},
  ],
  '晚上2': [
    {s:'计算机应用基础',t:'陈漱钰'},{s:'物流',t:'张学辉'},{s:'Ps',t:'杨香玉'},{s:'班主任',t:''},{},
  ],
};
const DEFAULT_PERSONAL_SCHED = {
  '上午1': [
    {s:'推销实务 / 商务沟通与谈判',t:'25春考1班'},{},{s:'推销实务 / 商务沟通与谈判',t:'25春考1班'},{},{},
  ],
  '上午2': [
    {s:'推销实务 / 商务沟通与谈判',t:'25春考1班'},{},{s:'推销实务 / 商务沟通与谈判',t:'25春考1班'},{},{},
  ],
  '上午3': [
    {s:'推销实务 / 商务沟通与谈判',t:'24春考3班'},{},{},{},{},
  ],
  '上午4': [
    {s:'推销实务 / 商务沟通与谈判',t:'24春考3班'},{},{},{},{},
  ],
  '下午1': [
    {},{},{},{s:'推销实务 / 商务沟通与谈判',t:'24春考3班'},{},
  ],
  '下午2': [
    {},{},{},{s:'推销实务 / 商务沟通与谈判',t:'24春考3班'},{},
  ],
  '下午3': [
    {},{},{},{s:'推销实务 / 商务沟通与谈判',t:'25春考1班'},{},
  ],
  '晚上1': [
    {},{s:'推销实务 / 商务沟通与谈判',t:'25春考1班'},{},{s:'班会',t:'26电商班'},{},
  ],
  '晚上2': [
    {},{s:'推销实务 / 商务沟通与谈判',t:'25春考1班'},{},{s:'班会',t:'26电商班'},{},
  ],
};

/* ---------- 状态 ---------- */
let S = null;          // 全量状态
let page = 'todos';
const seatSel = { r:-1, c:-1 };
const seatUndo = [];

/* ---------- 工具 ---------- */
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pad = n => String(n).padStart(2, '0');
function dstr(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
const today = () => dstr(new Date());
const tomorrow = () => dstr(new Date(Date.now()+86400000));
const stuById = id => S.students.find(x => x.id === Number(id));
// 花名册统一排序：男在前、女在后，同性别按姓名拼音升序（所有选人处共用）
const stuSorted = () => [...S.students].sort((a,b)=>(a.gender===b.gender?0:(a.gender==='男'?-1:1))||a.name.localeCompare(b.name,'zh-Hans-CN'));
const stuName = id => (stuById(id)?.name) || '（已删）';

async function api(path, method='GET', body) {
  const opt = { method, headers: {'content-type':'application/json'} };
  if (body !== undefined) opt.body = JSON.stringify(body);
  const r = await fetch('/api'+path, opt);
  if (!r.ok) {
    let detail = '';
    try { const j = await r.json(); if (j && j.error) detail = '（' + (j.name ? j.name + ' · ' : '') + j.error + '）'; } catch (e) {}
    throw new Error('请求失败 ' + r.status + detail);
  }
  return r.json();
}
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),1800); }
async function refresh(){ S = await api('/state'); renderTop(); renderNav(); render(); }

/* ---------- 请假联动（核心） ---------- */
function leaveIdsOn(date){
  const set = new Set();
  for (const l of S.leaves) {
    if (l.status !== '请假中') continue;
    if (l.start_date <= date && (!l.end_date || l.end_date >= date)) set.add(l.student_id);
  }
  return set;
}
const uncheckedStu = (f) => S.students.filter(f);

/* ---------- 顶栏 & 导航 ---------- */
function renderTop(){
  $('#tb-teacher').textContent = S.settings.teacher_name || '点击设置';
  $('#tb-count').textContent = S.students.length;
}
const NAV = [
  ['todos','✅','待办事项',()=>S.todos.filter(t=>!t.done).length],
  ['leaves','📋','请假学生',()=>leaveIdsOn(today()).size],
  ['roster','🎒','班级花名册',0],
  ['dorms','🏠','宿舍',0],
  ['dining','🍚','就餐',0],
  ['seating','🪑','座次表',0],
  ['xueji','🎓','学籍',()=>S.students.filter(s=>!s.xueji_registered).length],
  ['insurance','🛡','保险',()=>S.students.filter(s=>!s.insurance_paid).length],
  ['violations','🚫','违规违纪',0],
  ['schedClass','📅','班级课程表',0],
  ['schedPersonal','📆','个人课程表',0],
];
function renderNav(){
  $('#nav').innerHTML = NAV.map(([k,ico,label,badge]) => {
    const b = typeof badge==='function' ? badge() : badge;
    return `<div class="nav-item ${page===k?'active':''}" data-p="${k}">
      <span class="ico">${ico}</span>${label}${b?`<span class="badge">${b}</span>`:''}</div>`;
  }).join('');
  document.querySelectorAll('.nav-item').forEach(n => n.onclick = () => { page = n.dataset.p; seatSel.r=-1; renderNav(); render(); });
}
function render(){ ({todos:pgTodos,leaves:pgLeaves,roster:pgRoster,dorms:pgDorms,dining:pgDining,
  seating:pgSeating,xueji:pgXueji,insurance:pgInsurance,violations:pgViolations,
  schedClass:()=>pgSchedule('class'),schedPersonal:()=>pgSchedule('personal')})[page](); }

/* ---------- 弹窗 ---------- */
function openModal(html, wide){
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-mask"><div class="modal ${wide?'modal-wide':''}">${html}</div></div>`;
  root.querySelector('.modal-mask').addEventListener('mousedown', e => { if (e.target.classList.contains('modal-mask')) closeModal(); });
  const c = root.querySelector('.m-close'); if (c) c.onclick = closeModal;
  return root.querySelector('.modal');
}
const closeModal = () => { $('#modal-root').innerHTML = ''; };
function modalHead(title){ return `<div class="m-head"><span>${title}</span><button class="m-close">×</button></div>`; }

/* ============ 页面：待办事项 ============ */
function pgTodos(){
  const open = S.todos.filter(t=>!t.done).length;
  $('#main').innerHTML = `
    <div class="page-head">
      <div class="page-title">✅ 今日待办<small>未完成 ${open} 项 · 已完成只保留 3 天</small></div>
      <button class="btn primary" onclick="todoModal()">＋ 新增待办</button>
    </div>
    <div class="todo-grid">${S.todos.map(todoCard).join('') || '<div class="empty">今天没有待办，点右上角新增。</div>'}</div>`;
}
function todoCard(t){
  const cat = CATS[t.category] || CATS['其他'];
  const checks = t.link_roster ? S.todo_checks.filter(c=>c.todo_id===t.id) : [];
  const doneN = checks.filter(c=>c.checked).length;
  const clearIn = (t.done && t.done_at) ? Math.max(0, Math.ceil((t.done_at + 3*86400000 - Date.now())/86400000)) : 0;
  return `<div class="todo-card ${t.done?'done':''}">
    <div class="t-head"><div class="t-title">${esc(t.title)}</div>
      <span class="pill ${t.priority==='高'?'hi':t.priority==='中'?'mid':'lo'}">${t.priority==='高'?'高优先':t.priority}</span></div>
    <div class="t-meta">
      <span class="chip">${cat.ico} ${esc(t.category)}</span>
      <span class="chip">📅 ${t.due_date?esc(t.due_date):'无期限'}</span>
      ${t.done?`<span class="chip">🗑 ${clearIn}天后清除</span>`:''}
      ${t.link_roster?`<span class="progress-chip" onclick="rosterCheckModal(${t.id})">👥 ${doneN}/${S.students.length} 已办</span>`:''}
    </div>
    ${t.notes?`<div class="t-notes">📝 ${esc(t.notes)}</div>`:''}
    <div class="t-acts">
      ${t.done
        ? `<button class="btn link green" onclick="todoAct(${t.id},'undone')">↩ 恢复</button>`
        : `<button class="btn link green" onclick="todoAct(${t.id},'done')">✔ 标记完成</button>
           <button class="btn link" onclick="todoAct(${t.id},'postpone')">⏩ 顺延一天</button>`}
      <button class="btn link" onclick="todoModal(${t.id})">✏ 编辑</button>
      <button class="btn link red" onclick="todoDel(${t.id})">🗑 删除</button>
    </div></div>`;
}
async function todoAct(id, action){ await api('/todos/'+id,'PATCH',{action}); await refresh(); }
async function todoDel(id){ if(!confirm('确认删除该待办？'))return; await api('/todos/'+id,'DELETE'); await refresh(); }
function todoModal(id){
  const t = id ? S.todos.find(x=>x.id===id) : {title:'',category:'宿舍',due_date:today(),priority:'高',link_roster:0,notes:''};
  const m = openModal(`${modalHead(id?'✏ 编辑待办':'📝 新增待办')}
    <div class="m-body">
      <div class="field"><label>事项</label><input id="f-title" placeholder="如：核对今晚宿舍人数" value="${esc(t.title)}"></div>
      <div class="field"><label>分类</label><select id="f-cat">${Object.keys(CATS).map(c=>`<option ${c===t.category?'selected':''}>${c}</option>`).join('')}</select></div>
      <div class="field"><label>截止日期（留空 = 无期限）</label><input id="f-date" type="date" value="${t.due_date||''}"></div>
      <div class="field"><label>优先级</label><select id="f-pri">${['高','中','低'].map(p=>`<option ${p===t.priority?'selected':''}>${p}</option>`).join('')}</select></div>
      <div class="field"><label>关联花名册</label>
        <button class="btn" id="f-link">${t.link_roster?'✓ 已开启（统计名单）':'关闭（不统计名单）'}</button>
        <div class="hint">开启后，这条待办会关联全班名单，可逐人勾选「已办」，实时统计 X/全班人数（适合餐费、保险等逐项核对）</div></div>
      <div class="field"><label>备注</label><textarea id="f-notes" placeholder="选填">${esc(t.notes)}</textarea></div>
    </div>
    <div class="m-foot"><button class="btn" onclick="closeModal()">取消</button><button class="btn primary" id="f-save">保存</button></div>`);
  let link = !!t.link_roster;
  const lb = m.querySelector('#f-link');
  lb.onclick = () => { link = !link; lb.textContent = link?'✓ 已开启（统计名单）':'关闭（不统计名单）'; };
  m.querySelector('#f-save').onclick = async () => {
    const body = { title:m.querySelector('#f-title').value, category:m.querySelector('#f-cat').value,
      due_date:m.querySelector('#f-date').value||null, priority:m.querySelector('#f-pri').value,
      link_roster:link?1:0, notes:m.querySelector('#f-notes').value };
    if (id) await api('/todos/'+id,'PATCH',body); else await api('/todos','POST',body);
    closeModal(); await refresh(); toast('已保存');
  };
}
function rosterCheckModal(todoId){
  const t = S.todos.find(x=>x.id===todoId);
  const checked = new Set(S.todo_checks.filter(c=>c.todo_id===todoId&&c.checked).map(c=>c.student_id));
  const m = openModal(`${modalHead('👥 逐人核对 · '+esc(t.title))}
    <div class="m-body">
      <div class="hint">点名字切换「已办」，实时统计进度。</div>
      <div class="person-pills" id="rc-pills">${stuSorted().map(s=>
        `<span class="person-pill ${checked.has(s.id)?'on':''}" data-id="${s.id}">${esc(s.name)}</span>`).join('')}</div>
    </div>
    <div class="m-foot"><button class="btn" onclick="closeModal()">取消</button><button class="btn primary" id="rc-save">保存</button></div>`, true);
  m.querySelectorAll('#rc-pills .person-pill').forEach(p => p.onclick = () => p.classList.toggle('on'));
  m.querySelector('#rc-save').onclick = async () => {
    const checks = {};
    m.querySelectorAll('#rc-pills .person-pill').forEach(p => checks[p.dataset.id] = p.classList.contains('on')?1:0);
    await api('/todos/'+todoId+'/checks','PUT',{checks});
    closeModal(); await refresh(); toast('已保存');
  };
}

/* ============ 页面：请假学生 ============ */
function pgLeaves(){
  const td = today();
  const active = S.leaves.filter(l=>l.status==='请假中'&&l.start_date<=td&&(!l.end_date||l.end_date>=td));
  const returnedToday = S.leaves.filter(l=>l.returned_at===td).length;
  const startedToday = S.leaves.filter(l=>l.start_date===td).length;
  const stale = S.leaves.filter(l=>l.status==='请假中'&&l.start_date<td);
  const todays = S.leaves.filter(l=>l.start_date===td);
  $('#main').innerHTML = `
    <div class="page-head"><div class="page-title">📋 今日请假</div>
      <div class="head-actions">
        <button class="btn" onclick="leaveModal(true)">📋 批量登记</button>
        <button class="btn primary" onclick="leaveModal(false)">＋ 新增请假</button>
      </div></div>
    <div class="statbar">
      <div class="st"><b>${active.length}</b><span>请假中</span></div>
      <div class="st"><b>${returnedToday}</b><span>今日已返校</span></div>
      <div class="st"><b>${startedToday}</b><span>今日合计</span></div>
    </div>
    ${stale.length?`<div class="note-strip">往日请假未销假（${stale.length} 人，返校后请销假）</div>
      <div class="card">${stale.map(l=>leaveCard(l,true)).join('')}</div>`:''}
    <div class="card">
      ${todays.length?todays.map(l=>leaveCard(l,false)).join(''):'<div class="empty">🙌 今日无人请假，全勤</div>'}
    </div>`;
}
function leaveCard(l, stale){
  const s = stuById(l.student_id); if(!s) return '';
  return `<div class="todo-card" style="margin-bottom:8px">
    <div class="t-head"><div class="t-title ${stale?'leave-name':''}">${esc(s.name)} <span class="${s.gender==='女'?'g-female':'g-male'}">${s.gender==='女'?'♀':'♂'}</span></div>
      <span class="pill ${l.status==='请假中'?'mid':'ok'}">${l.status}</span></div>
    <div class="t-meta"><span class="chip">📅 ${esc(l.start_date)} ~ ${l.end_date?esc(l.end_date):'未定'}</span></div>
    ${l.reason?`<div class="t-notes">${esc(l.reason)}</div>`:''}
    <div class="t-acts">
      ${l.status==='请假中'?`<button class="btn link green" onclick="leaveReturn(${l.id})">✔ 销假返校</button>`:''}
      <button class="btn link" onclick="leaveModal(false,${l.id})">✏ 编辑</button>
      <button class="btn link red" onclick="leaveDel(${l.id})">🗑 删除</button>
    </div></div>`;
}
async function leaveReturn(id){ await api('/leaves/'+id+'/return','POST'); await refresh(); toast('已销假返校'); }
async function leaveDel(id){ if(!confirm('确认删除该请假记录？'))return; await api('/leaves/'+id,'DELETE'); await refresh(); }
function leaveModal(batch, id){
  const cur = id ? S.leaves.find(x=>x.id===id) : null;
  const m = openModal(`${modalHead(batch?'📋 批量登记请假':'📝 '+(id?'编辑请假':'新增请假'))}
    <div class="m-body">
      ${batch?`<div class="field"><label>选择学生（可多选）</label>
        <div class="person-pills" id="lv-stus">${stuSorted().map(s=>`<span class="person-pill" data-id="${s.id}">${esc(s.name)}</span>`).join('')}</div></div>`
      :`<div class="field"><label>学生姓名</label><select id="lv-one">${stuSorted().map(s=>`<option value="${s.id}" ${cur&&cur.student_id===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select></div>`}
      <div class="field"><label>开始日期</label><input id="lv-start" type="date" value="${cur?cur.start_date:today()}"></div>
      <div class="field"><label>结束日期（预计，不填视为请假中）</label><input id="lv-end" type="date" value="${cur&&cur.end_date?cur.end_date:''}"></div>
      <div class="field"><label>请假原因</label><textarea id="lv-reason" placeholder="例：家中有事、就医等">${cur?esc(cur.reason):''}</textarea></div>
    </div>
    <div class="m-foot"><button class="btn" onclick="closeModal()">取消</button><button class="btn primary" id="lv-save">保存</button></div>`);
  if (batch) m.querySelectorAll('#lv-stus .person-pill').forEach(p=>p.onclick=()=>p.classList.toggle('on'));
  m.querySelector('#lv-save').onclick = async () => {
    const body = { start_date:m.querySelector('#lv-start').value, end_date:m.querySelector('#lv-end').value||null,
      reason:m.querySelector('#lv-reason').value };
    if (!body.start_date) return alert('请选择开始日期');
    if (id) { await api('/leaves/'+id,'PATCH',{...body, student_id:cur.student_id}); }
    else if (batch) {
      const ids=[...m.querySelectorAll('#lv-stus .person-pill.on')].map(p=>Number(p.dataset.id));
      if(!ids.length) return alert('请选择学生');
      await api('/leaves','POST',{...body, student_ids:ids});
    } else { await api('/leaves','POST',{...body, student_ids:[Number(m.querySelector('#lv-one').value)]}); }
    closeModal(); await refresh(); toast('已保存');
  };
}

/* ============ 页面：班级花名册 ============ */
let rosterFilter = 'all';
function pgRoster(){
  let list = [...S.students];
  if (rosterFilter==='male') list = list.filter(s=>s.gender==='男');
  if (rosterFilter==='female') list = list.filter(s=>s.gender==='女');
  if (rosterFilter==='notes') list = list.filter(s=>s.notes);
  // 排序：男在前、女在后；同性别按姓名拼音升序（不再按插入序号）
  list.sort((a,b)=> (a.gender===b.gender ? 0 : (a.gender==='男' ? -1 : 1)) || a.name.localeCompare(b.name, 'zh-Hans-CN'));
  const leaveSet = leaveIdsOn(today());
  const row = (s,i) => `<tr>
    <td>${i}</td>
    <td class="${leaveSet.has(s.id)?'leave-name':''}">${esc(s.name)} <span class="${s.gender==='女'?'g-female':'g-male'}">${s.gender==='女'?'♀':'♂'}</span>
      ${s.dorm_leader?'<span class="pill warn">宿舍长</span>':''}</td>
    <td>${esc(s.dorm)||'—'}${s.bed?' · '+esc(s.bed):''}</td>
    <td>${esc(s.parent_phone)||'未填'}</td>
    <td>${esc(s.major)||'—'}</td>
    <td>${esc(s.notes)||'—'}</td>
    <td style="white-space:nowrap">
      <button class="btn link" onclick="studentModal(${s.id})">编辑</button>
      <button class="btn link red" onclick="studentDel(${s.id})">删除</button></td></tr>`;
  $('#main').innerHTML = `
    <div class="page-head"><div class="page-title">🎒 学生花名册<small>共 ${S.students.length} 人 · 男前女后 · 拼音序</small></div>
      <div class="head-actions">
        <button class="btn" onclick="leaveModal(true)">📋 请假登记</button>
        <button class="btn primary" onclick="studentModal()">＋ 新增学生</button>
      </div></div>
    <div class="head-actions" style="margin-bottom:12px">
      ${[['all','全部'],['male','男生'],['female','女生'],['notes','有备注']].map(([k,l])=>
        `<button class="btn sm ${rosterFilter===k?'primary':''}" onclick="rosterFilter='${k}';render()">${l}</button>`).join('')}
      <span class="hint" style="margin:0 0 0 8px">🔴 红色 = 当前请假中</span>
    </div>
    <div class="card" style="overflow-x:auto">
      ${list.length?`<table class="tbl"><thead><tr><th>序号</th><th>姓名</th><th>宿舍</th><th>家长电话</th><th>专业</th><th>备注</th><th>操作</th></tr></thead>
        <tbody>${list.map((s,i)=>row(s,i+1)).join('')}</tbody></table>`:'<div class="empty">还没有学生，点右上角新增。</div>'}
    </div>`;
}
function studentModal(id){
  const s = id ? stuById(id) : {name:'',gender:'男',dorm:'',bed:'',parent_phone:'',major:'',notes:'',dorm_leader:0};
  const m = openModal(`${modalHead(id?'✏ 编辑学生':'🎒 新增学生')}
    <div class="m-body">
      <div class="field"><label>姓名（必填）</label><input id="st-name" value="${esc(s.name)}"></div>
      <div class="field"><label>性别</label><select id="st-gender">${['男','女'].map(g=>`<option ${g===s.gender?'selected':''}>${g}</option>`).join('')}</select></div>
      <div class="field"><label>宿舍</label><select id="st-dorm"><option value="">未分宿舍</option>${DORMS.map(d=>`<option ${d===s.dorm?'selected':''}>${d}</option>`).join('')}</select></div>
      <div class="field"><label>床号</label><input id="st-bed" value="${esc(s.bed)}"></div>
      <div class="field"><label>家长电话（选填）</label><input id="st-phone" value="${esc(s.parent_phone)}"></div>
      <div class="field"><label>专业（选填）</label><input id="st-major" value="${esc(s.major)}"></div>
      <div class="field"><label>备注</label><textarea id="st-notes" placeholder="选填，例如：性格、家庭情况、需重点关注事项">${esc(s.notes)}</textarea></div>
      <label class="check"><input type="checkbox" id="st-leader" ${s.dorm_leader?'checked':''}> 设为本宿舍宿舍长</label>
    </div>
    <div class="m-foot"><button class="btn" onclick="closeModal()">取消</button><button class="btn primary" id="st-save">保存</button></div>`);
  m.querySelector('#st-save').onclick = async () => {
    const name = m.querySelector('#st-name').value.trim();
    if (!name) return alert('姓名必填');
    const dorm = m.querySelector('#st-dorm').value, bed = m.querySelector('#st-bed').value.trim();
    if (dorm && bed) {
      const taken = S.students.find(x => x.id !== id && x.dorm === dorm && x.bed === bed);
      if (taken) return alert('床位冲突：' + dorm + ' ' + bed + ' 已被 ' + taken.name + ' 占用，请换一个床号或宿舍。');
    }
    const body = { name, gender:m.querySelector('#st-gender').value, dorm, bed, parent_phone:m.querySelector('#st-phone').value,
      major:m.querySelector('#st-major').value, notes:m.querySelector('#st-notes').value,
      dorm_leader:m.querySelector('#st-leader').checked?1:0 };
    try {
      if (id) await api('/students/'+id,'PATCH',body); else await api('/students','POST',body);
    } catch (e) { alert('保存失败：' + e.message); return; }
    closeModal(); await refresh(); toast('已保存');
  };
}
async function studentDel(id){
  if (!confirm('删除该学生？其请假/核对/座位等关联数据会一并删除。')) return;
  await api('/students/'+id,'DELETE'); await refresh();
}

/* ============ 页面：宿舍 ============ */
function pgDorms(){
  const td = today(), leaveSet = leaveIdsOn(td);
  const presentOf = s => { const c = S.dorm_checks.find(c=>c.student_id===s.id&&c.check_date===td); return c?!!c.present:!leaveSet.has(s.id); };
  const membersOf = d => S.students.filter(s=>s.dorm===d).sort((a,b)=>(a.bed||'99').localeCompare(b.bed||'99','zh',{numeric:true}));
  const maleDorms = DORMS.filter(d=>d.endsWith('男')), femaleDorms = DORMS.filter(d=>d.endsWith('女'));
  const inDorm = S.students.filter(s=>s.dorm);
  const presentAll = inDorm.filter(s=>presentOf(s)).length;
  const onLeaveAll = inDorm.filter(s=>leaveSet.has(s.id)).length;
  const dormCard = d => {
    const mem = membersOf(d);
    const leader = mem.find(s=>s.dorm_leader);
    const onLeave = mem.filter(s=>leaveSet.has(s.id)).length;
    const here = mem.filter(s=>presentOf(s)).length;
    return `<div class="dorm-card">
      <div class="d-head">
        <span class="d-name">🏠 ${d}</span>
        <span class="d-stat">应住 ${mem.length} · 请假 ${onLeave} · 实到 ${here}</span>
        <button class="btn sm" style="margin-left:auto" onclick="dormAdjustModal('${d}')">⚙ 调整</button>
      </div>
      ${leader?`<div class="d-leader">👑 宿舍长：${esc(leader.name)}</div>`:''}
      <div class="d-members">${mem.length?mem.map(s=>`<div class="d-member">
          <span class="bed">${esc(s.bed)||'—'}</span>
          <b>${esc(s.name)}</b>${leaveSet.has(s.id)?'<span class="pill hi">请假中</span>':''}
          <span class="pill ${presentOf(s)?'ok':'hi'}">${presentOf(s)?'✔ 在校':'✗ 未到'}</span>
          <span class="phone">${esc(s.parent_phone)||'未填'}</span>
        </div>`).join(''):'<div class="empty">暂无学生</div>'}</div>
      </div>`;
  };
  $('#main').innerHTML = `
    <div class="page-head"><div class="page-title">🏠 宿舍分配<small>共 ${DORMS.length} 个宿舍</small></div>
      <button class="btn primary" onclick="dormCheckModal()">📋 整班核对</button></div>
    <div class="statbar">
      <div class="st"><b>${inDorm.length}</b><span>应住宿舍</span></div>
      <div class="st warn"><b>${onLeaveAll}</b><span>当前请假</span></div>
      <div class="st"><b>${presentAll}</b><span>实到</span></div>
    </div>
    <div class="dorm-sec-title">👨 男宿舍</div><div class="dorm-grid">${maleDorms.map(dormCard).join('')}</div>
    <div class="dorm-sec-title">👩 女宿舍</div><div class="dorm-grid">${femaleDorms.map(dormCard).join('')}</div>`;
}
function dormAdjustModal(d){
  const td = today(), leaveSet = leaveIdsOn(td);
  const presentOf = s => { const c = S.dorm_checks.find(c=>c.student_id===s.id&&c.check_date===td); return c?!!c.present:!leaveSet.has(s.id); };
  const mem = S.students.filter(s=>s.dorm===d).sort((a,b)=>(a.bed||'99').localeCompare(b.bed||'99','zh',{numeric:true}));
  const others = stuSorted().filter(s=>s.dorm!==d);
  const m = openModal(`${modalHead('⚙ 调整宿舍 · '+d)}
    <div class="m-body">
      <div class="hint">修改床号、设宿舍长、改在校状态，或从下方把学生加入本宿舍。</div>
      <div id="da-members">${mem.map(s=>`
        <div class="da-row" data-id="${s.id}">
          <b>${esc(s.name)}</b>
          <label>床号<input class="da-bed" value="${esc(s.bed||'')}" style="width:64px"></label>
          <label class="check"><input type="checkbox" class="da-leader" ${s.dorm_leader?'checked':''}> 宿舍长</label>
          <label class="check"><input type="checkbox" class="da-present" ${presentOf(s)?'checked':''}> 在校</label>
          <button class="btn sm danger da-remove">移出</button>
        </div>`).join('')||'<div class="empty">本宿舍暂无学生</div>'}</div>
      <div class="field" style="margin-top:12px"><label>加入学生到本宿舍</label>
        <select id="da-add"><option value="">— 选择 —</option>${others.map(s=>`<option value="${s.id}">${esc(s.name)}（现 ${esc(s.dorm||'未分')}）</option>`).join('')}</select>
        <div class="hint">加入后默认床号为空，可在上方改。</div></div>
    </div>
    <div class="m-foot"><button class="btn" onclick="closeModal()">取消</button><button class="btn primary" id="da-save">保存</button></div>`, true);
  m.querySelector('#da-add').onchange = async (e) => {
    const sid = Number(e.target.value); if (!sid) return;
    await api('/students/'+sid,'PATCH',{dorm:d});
    closeModal(); await refresh(); toast('已加入 '+d);
  };
  m.querySelectorAll('.da-remove').forEach(b=>b.onclick=async()=>{
    const sid = Number(b.closest('.da-row').dataset.id);
    await api('/students/'+sid,'PATCH',{dorm:''});
    closeModal(); await refresh(); toast('已移出');
  });
  m.querySelector('#da-save').onclick = async () => {
    const presentMap = {};
    for (const row of m.querySelectorAll('#da-members .da-row')) {
      const sid = Number(row.dataset.id);
      const bed = row.querySelector('.da-bed').value.trim();
      const leader = row.querySelector('.da-leader').checked?1:0;
      const present = row.querySelector('.da-present').checked?1:0;
      presentMap[sid] = present;
      if (bed) { const taken = S.students.find(x=>x.id!==sid && x.dorm===d && x.bed===bed); if (taken) { alert('床号 '+bed+' 已被 '+taken.name+' 占用'); return; } }
      const cur = stuById(sid);
      if (cur.bed!==bed || cur.dorm_leader!==leader) await api('/students/'+sid,'PATCH',{bed, dorm_leader:leader});
    }
    await api('/dorm-check','PUT',{date:td, present:presentMap});
    closeModal(); await refresh(); toast('已保存');
  };
}
function dormCheckModal(){
  const td = today(), leaveSet = leaveIdsOn(td);
  const meta = S.settings.dorm_meta||{};
  const state = {}; // sid -> present
  for (const s of S.students) {
    const c = S.dorm_checks.find(c=>c.student_id===s.id&&c.check_date===td);
    state[s.id] = c ? !!c.present : !leaveSet.has(s.id);
  }
  const summary = () => {
    const onLeave = S.students.filter(s=>leaveSet.has(s.id)).length;
    const present = Object.values(state).filter(Boolean).length;
    const mismatch = S.students.filter(s=>!state[s.id]&&!leaveSet.has(s.id)).length;
    return `全班 ${S.students.length} 人：在校 ${present} 人 · 请假 ${onLeave} 人 · 实到不符 ${mismatch} 人`;
  };
  const dormBlock = (title, dorms) => {
    const mem = dorms.flatMap(membersOfDorm);
    function membersOfDorm(d){ return S.students.filter(s=>s.dorm===d).sort((a,b)=>(a.bed||'99').localeCompare(b.bed||'99','zh',{numeric:true})); }
    const onLeave = mem.filter(s=>leaveSet.has(s.id)).length;
    return `<div class="dorm-sec-title">${title}（${dorms.length} 间 · ${mem.length} 人）　在校 ${mem.filter(s=>state[s.id]).length}/${mem.length} 人 · 请假 ${onLeave} 人</div>` +
      dorms.map(d=>{
        const dm = membersOfDorm(d);
        const onL = dm.filter(s=>leaveSet.has(s.id)).length;
        return `<div class="field"><label><b>${d}</b>（${dm.length} 人）　在校 ${dm.filter(s=>state[s.id]).length}/${dm.length} 人 · 请假 ${onL} 人</label>
          <div class="person-pills">${dm.map(s=>
            `<span class="person-pill ${state[s.id]?'on':'off'} ${leaveSet.has(s.id)?'leave':''}" data-id="${s.id}">${esc(s.name)}${leaveSet.has(s.id)?'（请假）':''}</span>`).join('')}</div></div>`;
      }).join('');
  };
  const m = openModal(`${modalHead('🏠 宿舍人数核对')}
    <div class="m-body">
      <div class="hint">已自动把「请假中」标为不在校，其余标为在校；可点名字手动切换，保存后就餐/统计实时联动。</div>
      <div class="note-strip" id="dc-sum" style="background:#f8fafc;border-color:var(--line);color:var(--ink)">${summary()}</div>
      ${dormBlock('👦 男生宿舍', DORMS.filter(d=>d.endsWith('男')))}
      ${dormBlock('👧 女生宿舍', DORMS.filter(d=>d.endsWith('女')))}
    </div>
    <div class="m-foot">
      <button class="btn" onclick="closeModal()">取消</button>
      <button class="btn" id="dc-reset">按请假重置</button>
      <button class="btn" id="dc-all">全部在校</button>
      <button class="btn primary" id="dc-save">保存核对</button>
    </div>`, true);
  const updatePills = () => m.querySelectorAll('.person-pill').forEach(p=>{
    const on = state[p.dataset.id];
    p.classList.toggle('on', !!on); p.classList.toggle('off', !on);
    m.querySelector('#dc-sum').textContent = summary();
  });
  m.querySelectorAll('.person-pill').forEach(p=>p.onclick=()=>{ state[p.dataset.id]=!state[p.dataset.id]; updatePills(); });
  m.querySelector('#dc-all').onclick = ()=>{ for(const k in state) state[k]=true; updatePills(); };
  m.querySelector('#dc-reset').onclick = ()=>{ for(const s of S.students) state[s.id]=!leaveSet.has(s.id); updatePills(); };
  m.querySelector('#dc-save').onclick = async ()=>{
    await api('/dorm-check','PUT',{date:td, present:state});
    closeModal(); await refresh(); toast('核对已保存');
  };
}

/* ============ 页面：就餐 ============ */
function pgDining(){
  const date = tomorrow(), leaveSet = leaveIdsOn(date);
  const daily = S.dining_daily.find(d=>d.date===date) || {plus:0,minus:0};
  const optout = S.dining_optout.filter(o=>o.date===date).map(o=>o.student_id);
  const final = Math.max(0, S.students.length - leaveSet.size - optout.length + Number(daily.plus||0) - Number(daily.minus||0));
  const unseated = stuSorted().filter(s=>!S.seats.some(x=>x.student_id===s.id));
  const seatedN = S.seats.length;
  $('#main').innerHTML = `
    <div class="page-head"><div class="page-title">🍚 明日就餐上报<small>明日（${date}）就餐人数</small></div></div>
    <div class="card grid2" style="align-items:start">
      <div style="text-align:center;padding:12px 0">
        <div style="font-size:56px;font-weight:800;color:var(--red);line-height:1">${final} <span style="font-size:18px">人</span></div>
        <div class="head-actions" style="justify-content:center;margin-top:14px">
          <button class="btn" onclick="diningHistoryModal()">📋 上报记录</button>
          <button class="btn" onclick="diningCopy(${final},'${date}')">📄 复制文字</button>
        </div>
      </div>
      <div>
        <div class="field" style="display:flex;justify-content:space-between"><span>班级总人数</span><b>${S.students.length}</b></div>
        <div class="field" style="display:flex;justify-content:space-between"><span>请假学生</span><b style="color:var(--red)">-${leaveSet.size}</b></div>
        <div class="field" style="display:flex;justify-content:space-between"><span>不就餐</span><b style="color:var(--red)">-${optout.length}</b></div>
        <div class="field"><label>不吃名单（自动从就餐人数抵扣）</label>
          <div style="display:flex;gap:6px;margin-bottom:6px">
            <select id="dn-add" style="flex:1">${stuSorted().filter(s=>!optout.includes(s.id)).map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
            <button class="btn primary" onclick="diningOptoutAdd()">＋ 加入</button></div>
          <div>${optout.map(id=>`<span class="chip">${esc(stuName(id))} <span class="x" onclick="diningOptoutRemove(${id})">×</span></span>`).join(' ')||'<span class="hint">暂无（在校生全部计入就餐）</span>'}</div></div>
        <div class="grid2">
          <div class="field"><label>手动减少（请假不返）</label><input type="number" id="dn-minus" value="${daily.minus||0}" min="0"></div>
          <div class="field"><label>手动增加（回校就餐）</label><input type="number" id="dn-plus" value="${daily.plus||0}" min="0"></div>
        </div>
        <div class="field" style="display:flex;justify-content:space-between"><span>手动调整</span><b>${Number(daily.plus||0)-Number(daily.minus||0)}</b></div>
        <div class="field" style="display:flex;justify-content:space-between;background:#fef2f2;border-radius:8px;padding:8px 10px"><b>应就餐人数</b><b style="color:var(--red);font-size:18px">${final}</b></div>
      </div>
    </div>
    <div class="card">
      <div class="page-head"><div class="page-title">🍱 就餐席位安排<small>共 ${S.tables.length} 桌 · 已入座 ${seatedN} 人 · 改动自动保存</small></div>
        <button class="btn primary" onclick="tableAdd()">＋ 新建桌位</button></div>
      ${unseated.length?`<div class="hint">未入座（${unseated.length} 人）：${unseated.map(s=>esc(s.name)).join('、')}</div>`:'<div class="hint" style="color:var(--green)">✓ 全部入座</div>'}
      <div class="table-grid">${S.tables.map(tableCard).join('')||'<div class="empty">还没有桌位，点右上角新建。</div>'}</div>
    </div>`;
  const bindNum = (id,key)=>{ $('#'+id).onchange = async ()=>{ 
    await api('/dining','PUT',{date, plus:Number($('#dn-plus').value)||0, minus:Number($('#dn-minus').value)||0});
    await refresh(); }; };
  bindNum('dn-plus','plus'); bindNum('dn-minus','minus');
}
function tableCard(t){
  const members = S.seats.filter(x=>x.table_id===t.id).map(x=>x.student_id);
  const atOther = s => S.seats.some(x=>x.student_id===s.id);
  const candidates = stuSorted().filter(s=>!members.includes(s.id));
  return `<div class="seat-table-card">
    <div class="s-head"><span class="s-name">${esc(t.label)}</span><span class="pill warn">${members.length} 人</span>
      <span style="margin-left:auto;display:flex;gap:4px">
        <button class="btn sm" onclick="tableRename(${t.id})">✏ 编号</button>
        <button class="btn sm danger" onclick="tableDel(${t.id})">🗑</button></span></div>
    <div>${members.map(id=>`<span class="chip">${esc(stuName(id))} <span class="x" onclick="tableRemoveMember(${t.id},${id})">×</span></span>`).join(' ')||'<span class="hint">空桌</span>'}</div>
    <div style="display:flex;gap:6px;margin-top:8px">
      <select class="tb-add" style="flex:1">${candidates.map(s=>`<option value="${s.id}">${esc(s.name)}${atOther(s)?'（已在别桌，加入）':''}</option>`).join('')}</select>
      <button class="btn sm primary" onclick="tableAddMember(${t.id},this)">＋ 加入</button></div>
  </div>`;
}
async function diningOptoutAdd(){
  const id = Number($('#dn-add').value); if(!id) return;
  const date = tomorrow();
  const cur = S.dining_optout.filter(o=>o.date===date).map(o=>o.student_id);
  await api('/dining','PUT',{date, optout:[...cur,id], plus:Number($('#dn-plus').value)||0, minus:Number($('#dn-minus').value)||0});
  await refresh();
}
async function diningOptoutRemove(id){
  const date = tomorrow();
  const cur = S.dining_optout.filter(o=>o.date===date).map(o=>o.student_id).filter(x=>x!==id);
  await api('/dining','PUT',{date, optout:cur, plus:Number($('#dn-plus').value)||0, minus:Number($('#dn-minus').value)||0});
  await refresh();
}
function diningCopy(final, date){
  const txt = `明日（${date}）就餐人数：${final} 人`;
  navigator.clipboard.writeText(txt).then(()=>toast('已复制：'+txt));
}
function diningHistoryModal(){
  openModal(`${modalHead('📋 上报记录')}
    <div class="m-body">${S.dining_history.length?`<table class="tbl"><thead><tr><th>日期</th><th>应就餐</th><th>总人数</th><th>请假</th><th>不就餐</th><th>手动±</th></tr></thead><tbody>
      ${S.dining_history.map(h=>`<tr><td>${esc(h.date)}</td><td><b>${h.final}</b></td><td>${h.total}</td><td>${h.onleave}</td><td>${h.optout}</td><td>${h.plus-h.minus}</td></tr>`).join('')}
      </tbody></table>`:'<div class="empty">暂无上报记录（调整人数后自动记录）</div>'}</div>
    <div class="m-foot"><button class="btn primary" onclick="closeModal()">关闭</button></div>`);
}
async function tableAdd(){ await api('/tables','POST',{label:(S.tables.length+1)+'号桌'}); await refresh(); }
async function tableRename(id){ const t=S.tables.find(x=>x.id===id); const v=prompt('桌号',t.label); if(v===null)return;
  await api('/tables/'+id,'PATCH',{label:v}); await refresh(); }
async function tableDel(id){ if(!confirm('删除该桌位？桌上学生回到未入座。'))return; await api('/tables/'+id,'DELETE'); await refresh(); }
async function tableAddMember(tid, btn){
  const sel = btn.parentElement.querySelector('.tb-add'); const sid = Number(sel.value); if(!sid) return;
  // 调桌：先从其它桌移出该生，再加入本桌
  for (const t of S.tables) {
    if (t.id === tid) continue;
    const m = S.seats.filter(x=>x.table_id===t.id).map(x=>x.student_id);
    if (m.includes(sid)) await api('/tables/'+t.id+'/members','PUT',{members:m.filter(x=>x!==sid)});
  }
  const members = S.seats.filter(x=>x.table_id===tid).map(x=>x.student_id);
  await api('/tables/'+tid+'/members','PUT',{members:[...members,sid]}); await refresh();
}
async function tableRemoveMember(tid, sid){
  const members = S.seats.filter(x=>x.table_id===tid).map(x=>x.student_id).filter(x=>x!==sid);
  await api('/tables/'+tid+'/members','PUT',{members}); await refresh();
}

/* ============ 页面：座次表 ============ */
function pgSeating(){
  const seat = S.seating || {layout:[2,3,2], rows:[]};
  const layout = seat.layout, rows = seat.rows;
  const colsTotal = layout.reduce((a,b)=>a+b,0) + (layout.length-1);
  // 物理列 -> 是否走道
  const colMap = []; let gi = 0;
  for (let g=0; g<layout.length; g++){ for(let i=0;i<layout[g];i++) colMap.push({seat:true,g}); if(g<layout.length-1) colMap.push({seat:false}); }
  const perRow = layout.reduce((a,b)=>a+b,0);
  const used = rows.flat().filter(Boolean).length;
  $('#main').innerHTML = `
    <div class="page-head"><div class="page-title">🪑 座次表<small>排 ${used} 人 · ${layout.join('·')} · 第 1 排在最下方（靠近讲台）</small></div>
      <div class="seating-toolbar">
        <button class="btn" onclick="seatUndoPop()">↩ 撤销</button>
        <button class="btn" onclick="seatExportModal()">📤 导出座次表</button>
        <button class="btn" onclick="seatLayoutModal()">🔲 布局</button>
        <button class="btn" onclick="seatAuto()">⚡ 自动排座</button>
        <button class="btn danger" onclick="seatClear()">🗑 清空</button>
      </div></div>
    <div class="hint">点一个座位再点另一个即可对调；点空位可把选中的人移过去。</div>
    <div class="seating-wrap">
      ${[...rows.keys()].reverse().map(ri=>{
        const ri2 = ri;
        return `<div class="seat-row"><span class="row-label">第${ri2+1}排</span>
          ${colMap.map((cm,ci)=> cm.seat
            ? `<div class="seat-cell ${rows[ri2][ci]?'':'empty-seat'} ${seatSel.r===ri2&&seatSel.c===ci?'selected':''}"
                 onclick="seatClick(${ri2},${ci})">${rows[ri2][ci]?esc(rows[ri2][ci]):'空'}</div>`
            : `<div class="aisle"></div>`).join('')}
          <span class="row-label" style="text-align:left">${'窗'}</span></div>`;
      }).join('')}
      <div class="seating-footer"><div>🚪 门（讲台左侧）</div><div>📢 讲台（前面）</div><div>🪟 窗（讲台右侧）</div></div>
    </div>`;
}
function seatSnapshot(){ const s=S.seating||{layout:[2,3,2],rows:[]}; return JSON.parse(JSON.stringify(s)); }
async function seatSave(next){
  seatUndo.push(seatSnapshot()); if(seatUndo.length>30) seatUndo.shift();
  await api('/seating','PUT',next); await refresh();
}
function seatClick(r,c){
  const seat = S.seating||{layout:[],rows:[]};
  if (seatSel.r<0){ if (seat.rows[r][c]) { seatSel.r=r; seatSel.c=c; } else { seatNameModal(r,c); } }
  else {
    const a=seat.rows[seatSel.r][seatSel.c], b=seat.rows[r][c];
    seat.rows[r][c]=a; seat.rows[seatSel.r][seatSel.c]=b;
    seatSel.r=-1; seatSel.c=-1;
    seatSave(seat);
  }
  render();
}
function seatNameModal(r,c){
  const cur = (S.seating && S.seating.rows[r] && S.seating.rows[r][c]) || '';
  const v = prompt('填入学生姓名（留空=清空该座位）', cur); if (v===null) return;
  const seat = seatSnapshot();
  seat.rows[r] = seat.rows[r] || [];
  seat.rows[r][c] = v.trim();
  seatSave(seat);
}
function seatUndoPop(){ if(!seatUndo.length) return toast('没有可撤销的操作'); seatSave(seatUndo.pop()); }
function seatAuto(){
  const seat = seatSnapshot();
  const ids = S.students.map(s=>s.name);
  const perRow = seat.layout.reduce((a,b)=>a+b,0);
  const colTotal = perRow + seat.layout.length-1;
  const nRows = Math.max(1, Math.ceil(ids.length/perRow));
  const rows = Array.from({length:nRows},()=>Array(colTotal).fill(null));
  let k=0;
  const colMap=[]; for(let g=0;g<seat.layout.length;g++){ for(let i=0;i<seat.layout[g];i++) colMap.push(true); if(g<seat.layout.length-1) colMap.push(false); }
  for (let r=0;r<nRows;r++) for (let c=0;c<colTotal;c++) if (colMap[c] && k<ids.length) rows[r][c]=ids[k++];
  while (rows.length && rows[rows.length-1].every(x=>!x)) rows.pop();
  seatSave({...seat, rows});
}
function seatClear(){ if(!confirm('清空全部座位？'))return; const seat=seatSnapshot(); seat.rows=[]; seatSave(seat); }
function seatLayoutModal(){
  const seat = seatSnapshot();
  const m = openModal(`${modalHead('🔲 座次布局')}
    <div class="m-body">
      <div class="field"><label>当前布局：每排 ${seat.layout.join('·')}（左·中·右）</label>
        <div class="head-actions">${LAYOUT_PRESETS.map(l=>`<button class="btn sm lp ${l.join()===seat.layout.join()?'primary':''}" data-l="${l.join()}">${l.join('·')}</button>`).join('')}</div></div>
      <div class="field"><label>自定义（用 - 或 · 分隔，如 2-4-2）</label><input id="sl-custom" placeholder="2-3-2"></div>
      <div class="hint">修改布局后，现有座位按就近顺序自动重排到新列数（不丢人）。</div>
    </div>
    <div class="m-foot"><button class="btn" onclick="closeModal()">取消</button><button class="btn primary" id="sl-ok">确定</button></div>`);
  m.querySelectorAll('.lp').forEach(b=>b.onclick=()=>{ m.querySelector('#sl-custom').value=b.dataset.l.split(',').join('-'); });
  m.querySelector('#sl-ok').onclick=()=>{
    const v = m.querySelector('#sl-custom').value.trim();
    const layout = v.split(/[-·.×x]/).map(Number).filter(n=>n>0&&n<=8);
    if (!layout.length) return alert('布局格式不对，例：2-3-2');
    // 重排：按旧顺序铺人
    const old = seat.rows.flat().filter(Boolean);
    const perRow = layout.reduce((a,b)=>a+b,0);
    const colTotal = perRow + layout.length-1;
    const nRows = Math.max(1, Math.ceil(old.length/perRow));
    const rows = Array.from({length:nRows},()=>Array(colTotal).fill(null));
    const colMap=[]; for(let g=0;g<layout.length;g++){ for(let i=0;i<layout[g];i++) colMap.push(true); if(g<layout.length-1) colMap.push(false); }
    let k=0;
    for (let r=0;r<nRows;r++) for (let c=0;c<colTotal;c++) if (colMap[c] && k<old.length) rows[r][c]=old[k++];
    while (rows.length && rows[rows.length-1].every(x=>!x)) rows.pop();
    closeModal(); seatSave({layout, rows});
  };
}
function seatExportModal(){
  const seat = S.seating||{layout:[],rows:[]};
  const colMap=[]; for(let g=0;g<seat.layout.length;g++){ for(let i=0;i<seat.layout[g];i++) colMap.push(true); if(g<seat.layout.length-1) colMap.push(false); }
  const seatCols = colMap.map((v,i)=>v?i:-1).filter(i=>i>=0);
  const html = `<table border="1" style="border-collapse:collapse"><tr><th>排次</th>${seatCols.map((_,i)=>`<th>第${i+1}列</th>`).join('')}</tr>
    ${[...seat.rows.keys()].reverse().map(ri=>`<tr><td><b>第${ri+1}排</b></td>${seatCols.map(c=>`<td style="width:70px;text-align:center">${seat.rows[ri][c]?esc(seat.rows[ri][c]):''}</td>`).join('')}</tr>`).join('')}
    <tr><td colspan="${seatCols.length+1}" style="text-align:center">📢 讲台（前面）</td></tr></table>`;
  const m = openModal(`${modalHead('📤 导出座次表')}
    <div class="m-body"><div class="hint">下面是当前座次表（第1排在最下方、紧邻讲台）。可下载为表格文件（Excel 可直接打开），或复制后粘贴到 Word。</div>
      <div style="overflow:auto;max-height:320px;border:1px solid var(--line);border-radius:8px;padding:8px">${html}</div></div>
    <div class="m-foot"><button class="btn" onclick="closeModal()">关闭</button>
      <button class="btn" id="se-copy">📋 复制表格</button>
      <button class="btn primary" id="se-dl">⬇ 下载表格</button></div>`, true);
  m.querySelector('#se-copy').onclick=()=>{ navigator.clipboard.writeText(html).then(()=>toast('已复制 HTML 表格')); };
  m.querySelector('#se-dl').onclick=()=>{
    const blob=new Blob(['<meta charset="utf-8">'+html],{type:'application/vnd.ms-excel'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='座次表.xls'; a.click();
  };
}

/* ============ 页面：学籍 / 保险（同一套骨架） ============ */
function renderRegistry(cfg){
  const kw = (cfg.kw||'').trim();
  let list = [...S.students];
  list.sort((a,b)=> (a[cfg.field]-b[cfg.field]) ? (a[cfg.field]?1:-1) : a.name.localeCompare(b.name,'zh'));
  if (kw) list = list.filter(s=>s.name.includes(kw));
  const okN = S.students.filter(s=>s[cfg.field]).length;
  $('#main').innerHTML = `
    <div class="page-head"><div class="page-title">${cfg.title}<small>共 ${S.students.length} 人</small></div>
      <div class="head-actions"><input id="rg-kw" placeholder="🔍 搜索学生" value="${esc(cfg.kw||'')}" style="width:180px"></div></div>
    <div class="statbar">
      <div class="st"><b>${okN}</b><span>${cfg.okLabel}</span></div>
      <div class="st warn"><b>${S.students.length-okN}</b><span>待办理</span></div>
    </div>
    <div class="hint">${cfg.hint}</div>
    <div class="card" style="overflow-x:auto">
      ${list.length?`<table class="tbl"><thead><tr><th>姓名</th><th>性别</th><th>专业</th><th>${cfg.colLabel}</th><th>备注</th></tr></thead><tbody>
        ${list.map(s=>`<tr>
          <td><b>${esc(s.name)}</b></td>
          <td class="${s.gender==='女'?'g-female':'g-male'}">${s.gender}</td>
          <td>${s.major?`<a class="btn link" onclick="registryMajor(${s.id},'${cfg.kind}')">${esc(s.major)} ✎</a>`:`<a class="btn link" onclick="registryMajor(${s.id},'${cfg.kind}')">+ 专业</a>`}</td>
          <td><button class="btn sm ${s[cfg.field]?'':'danger'}" onclick="registryToggle(${s.id},'${cfg.field}')">${s[cfg.field]?cfg.okLabel:cfg.pendingLabel}</button></td>
          <td>${s[cfg.noteField]?`<a class="btn link" onclick="registryNotes(${s.id},'${cfg.kind}')">${esc(s[cfg.noteField])}</a>`:`<a class="btn link" onclick="registryNotes(${s.id},'${cfg.kind}')">+ 备注</a>`}</td>
        </tr>`).join('')}</tbody></table>`:'<div class="empty">暂无学生</div>'}
    </div>`;
  $('#rg-kw').oninput = e => { cfg.kw = e.target.value; renderRegistry(cfg); };
}
function pgXueji(){ renderRegistry({kind:'xueji', title:'🎓 学籍注册', field:'xueji_registered', noteField:'xueji_note', okLabel:'已注册', pendingLabel:'未注册', colLabel:'学籍注册', hint:'点击状态可切换；专业列点击修改；[备注] 列是学籍专属备注，不与花名册备注混用。', kw:pgXueji.kw}); }
function pgInsurance(){ renderRegistry({kind:'ins', title:'🛡 保险上缴（学平险）', field:'insurance_paid', noteField:'insurance_note', okLabel:'已上缴', pendingLabel:'未上缴', colLabel:'学平险', hint:'点击状态可切换；[备注] 列是保险专属备注，不与花名册备注混用。', kw:pgInsurance.kw}); }
async function registryToggle(id, field){
  const s = stuById(id);
  await api('/students/'+id,'PATCH',{[field]: s[field]?0:1});
  await refresh();
}
async function registryMajor(id){
  const s = stuById(id);
  const v = prompt('专业', s.major||''); if (v===null) return;
  await api('/students/'+id,'PATCH',{major:v}); await refresh();
}
async function registryNotes(id, kind){
  const s = stuById(id);
  const field = kind==='xueji' ? 'xueji_note' : 'insurance_note';
  const v = prompt(kind==='xueji'?'学籍备注':'保险备注', s[field]||''); if (v===null) return;
  await api('/students/'+id,'PATCH',{[field]:v}); await refresh();
}

/* ============ 页面：违规违纪 ============ */
function pgViolations(){
  const total = S.violations.length;
  const stuSet = new Set(S.violations.map(v=>v.student_id));
  const byType = {};
  for (const v of S.violations) byType[v.type]=(byType[v.type]||0)+1;
  const top = Object.entries(byType).sort((a,b)=>b[1]-a[1])[0];
  $('#main').innerHTML = `
    <div class="page-head"><div class="page-title">🚫 违规登记</div>
      <button class="btn primary" onclick="vioModal()">＋ 新增违规</button></div>
    <div class="statbar">
      <div class="st"><b>${total}</b><span>总违规次数</span></div>
      <div class="st"><b>${top?top[1]:0}</b><span>${top?esc(top[0]):'—'}</span></div>
      <div class="st"><b>${stuSet.size}</b><span>涉及学生</span></div>
    </div>
    ${S.violations.map(v=>`<div class="todo-card" style="margin-bottom:10px">
      <div class="t-head"><div class="t-title">${esc(stuName(v.student_id))}</div>
        <span class="pill mid">${esc(v.type)}</span></div>
      <div class="t-meta"><span class="chip">📅 ${esc(v.date)}</span></div>
      ${v.details?`<div class="t-notes">${esc(v.details)}</div>`:''}
      ${v.action?`<div class="hint">处理：${esc(v.action)}</div>`:''}
      <div class="t-acts"><button class="btn link red" onclick="vioDel(${v.id})">🗑 删除</button></div>
    </div>`).join('')||'<div class="empty">暂无违规记录</div>'}`;
}
function vioModal(){
  const m = openModal(`${modalHead('🚫 新增违规登记')}
    <div class="m-body">
      <div class="field"><label>学生姓名</label><select id="v-stu">${stuSorted().map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div>
      <div class="field"><label>违规类型</label><select id="v-type">${VIO_TYPES.map(t=>`<option>${t}</option>`).join('')}</select></div>
      <div class="field"><label>日期</label><input id="v-date" type="date" value="${today()}"></div>
      <div class="field"><label>详细情况</label><textarea id="v-details" placeholder="例：上课玩手机被老师发现"></textarea></div>
      <div class="field"><label>处理方式</label><input id="v-action" placeholder="例：批评教育、没收手机"></div>
    </div>
    <div class="m-foot"><button class="btn" onclick="closeModal()">取消</button><button class="btn primary" id="v-save">保存</button></div>`);
  m.querySelector('#v-save').onclick = async () => {
    await api('/violations','POST',{student_id:Number(m.querySelector('#v-stu').value),
      type:m.querySelector('#v-type').value, date:m.querySelector('#v-date').value||today(),
      details:m.querySelector('#v-details').value, action:m.querySelector('#v-action').value});
    closeModal(); await refresh(); toast('已登记');
  };
}
async function vioDel(id){ if(!confirm('确认删除该违规记录？'))return; await api('/violations/'+id,'DELETE'); await refresh(); }

/* ============ 页面：课程表（班级/个人共用） ============ */
function pgSchedule(kind){
  const data = (S.schedules[kind]||{});
  let n = 0; for (const p of PERIODS) for (const c of (data[p]||[])) if (c&&c.s) n++;
  const isClass = kind==='class';
  $('#main').innerHTML = `
    <div class="page-head"><div class="page-title">${isClass?'📅 班级课程表':'📆 个人课程表'}<small>${n} 节课</small></div>
      <div class="head-actions">
        <button class="btn" onclick="schedImport('${kind}')">📥 导入默认课表</button>
        <button class="btn" onclick="schedCopy('${kind}')">📄 复制文字</button>
        <button class="btn danger" onclick="schedClear('${kind}')">🗑 清空</button>
      </div></div>
    <div class="hint">点击任意格子填写 / 修改${isClass?'课程（科目、任课教师）':'（班次、班级备注）'}。</div>
    <table class="sched-grid"><thead><tr><th>节次</th>${DAYS.map(d=>`<th>${d}</th>`).join('')}</tr></thead><tbody>
      ${PERIODS.map(p=>`<tr><td class="period-cell">${p}</td>
        ${DAYS.map((d,di)=>{
          const cell=(data[p]||[])[di]||{};
          return `<td class="${p.startsWith('晚')?'even':''}" onclick="schedCellModal('${kind}','${p}',${di})">
            ${cell.s||cell.t?(
              isClass
                ? `${cell.s?`<div class="subj">${esc(cell.s)}</div>`:''}${cell.t?`<div class="teach">${esc(cell.t)}</div>`:''}`
                : `${cell.t?`<div class="subj">${esc(cell.t)}</div>`:''}${cell.s?`<div class="teach" style="color:var(--ink)">${esc(cell.s)}</div>`:''}`
            ):'<span style="color:#cbd5e1">＋</span>'}</td>`;
        }).join('')}</tr>`).join('')}
    </tbody></table>`;
}
function schedCellModal(kind, period, dayIdx){
  const data = JSON.parse(JSON.stringify(S.schedules[kind]||{}));
  const cell = (data[period]||[])[dayIdx]||{s:'',t:''};
  const isClass = kind==='class';
  const m = openModal(`${modalHead('✏ '+period+' · '+DAYS[dayIdx])}
    <div class="m-body">
      <div class="field"><label>${isClass?'科目':'班次'}</label><input id="sc-s" value="${esc(cell.s||'')}"></div>
      <div class="field"><label>${isClass?'任课教师':'备注'}</label><input id="sc-t" value="${esc(cell.t||'')}"></div>
    </div>
    <div class="m-foot"><button class="btn danger" id="sc-del">清除</button><button class="btn" onclick="closeModal()">取消</button><button class="btn primary" id="sc-save">保存</button></div>`);
  m.querySelector('#sc-save').onclick = async () => {
    data[period] = data[period]||Array(5).fill(null).map(()=>({s:'',t:''}));
    data[period][dayIdx] = {s:m.querySelector('#sc-s').value.trim(), t:m.querySelector('#sc-t').value.trim()};
    await api('/schedule/'+kind,'PUT',{data}); closeModal(); await refresh();
  };
  m.querySelector('#sc-del').onclick = async () => {
    data[period] = data[period]||Array(5).fill(null).map(()=>({s:'',t:''}));
    data[period][dayIdx] = {s:'',t:''};
    await api('/schedule/'+kind,'PUT',{data}); closeModal(); await refresh();
  };
}
async function schedClear(kind){
  if (!confirm('清空整张课程表？')) return;
  await api('/schedule/'+kind,'PUT',{data:{}}); await refresh();
}
async function schedImport(kind){
  if (!confirm('导入默认课表将覆盖当前'+(kind==='class'?'班级':'个人')+'课程表，确定？')) return;
  const def = JSON.parse(JSON.stringify(kind==='class'?DEFAULT_CLASS_SCHED:DEFAULT_PERSONAL_SCHED));
  await api('/schedule/'+kind,'PUT',{data:def});
  await refresh(); toast('已导入默认课表');
}
function schedCopy(kind){
  const data = S.schedules[kind]||{};
  const lines = ['\t'+DAYS.join('\t')];
  for (const p of PERIODS) {
    lines.push(p+'\t'+DAYS.map((d,i)=>{ const c=(data[p]||[])[i]; return c&&c.s?(c.s+(c.t?' '+c.t:'')):''; }).join('\t'));
  }
  navigator.clipboard.writeText(lines.join('\n')).then(()=>toast('已复制课程表文字'));
}

/* ---------- 顶栏动作 ---------- */
$('#btn-export').onclick = async () => {
  const data = await api('/export');
  const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'workbench-backup-'+today()+'.json';
  a.click();
};
$('#tb-teacher').onclick = async () => {
  const v = prompt('班主任姓名', S.settings.teacher_name||'');
  if (v===null) return;
  await api('/settings','PUT',{teacher_name:v});
  await refresh();
};

/* ---------- 启动 ---------- */
(async function init(){
  try {
    S = await api('/state');
    renderTop(); renderNav(); render();
  } catch (e) {
    $('#main').innerHTML = `<div class="card"><b>加载失败：</b>${esc(e.message)}<br><span class="hint">请确认已部署 Worker 并绑定 D1 数据库（见 DEPLOY.md）。</span></div>`;
  }
})();
