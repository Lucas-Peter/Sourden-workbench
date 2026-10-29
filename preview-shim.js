// 预览模式 shim：用浏览器 localStorage 模拟后端，镜像 worker.js 的全部路由逻辑。
// 由 _wb-build-preview.mjs 内联进 public/preview.html（不能以 <script src> 引用，保证双击/预览面板都能跑）。
(function () {
  const KEY = 'wb_preview_v2';
  const pad = n => String(n).padStart(2, '0');
  const today = new Date();
  const T = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());
  const TMd = new Date(Date.now() + 86400000);
  const TMS = TMd.getFullYear() + '-' + pad(TMd.getMonth() + 1) + '-' + pad(TMd.getDate());
  const now = Date.now();

  /* ---------------- 样本数据（一个真实的电商班） ---------------- */
  function seed() {
    function mk(id, name, gender, dorm, bed, phone, major, notes, leader, xueji, ins) {
      return { id, name, gender, dorm, bed, parent_phone: phone, major, notes,
        dorm_leader: leader, xueji_registered: xueji, insurance_paid: ins,
        xueji_note: '', insurance_note: '', created_at: now };
    }
    const students = [
      mk(1, '张志昊', '男', '413男', '8', '', '', '', 0, 0, 0),
      mk(2, '朱轶蕊', '女', '409女', '6', '15853043688', '电商', '', 1, 0, 0),
      mk(3, '王昶博', '男', '405男', '8', '', '', '', 0, 0, 0),
      mk(4, '李迪', '女', '410女', '4', '13287493692', '多媒体', '', 0, 0, 0),
      mk(5, '杨栋', '男', '413男', '2', '15865101092', '电商', '', 0, 0, 0),
      mk(6, '邵千千', '女', '405女', '6', '18253072331', '计算机', '一个村的，安排一个下铺', 0, 0, 0),
      mk(7, '袁艺珈', '女', '406女', '1', '13905404912', '计算机', '', 0, 0, 0),
      mk(8, '王子阳', '男', '407男', '6', '13854089448', '电商', '姬主任的亲戚，安排下铺。', 0, 0, 0),
      mk(9, '姚雨欣', '女', '406女', '4', '15764046076', '计算机', '', 0, 0, 0),
      mk(10, '曹鹏飞', '男', '405男', '3', '15990942082', '电商', '', 0, 0, 0),
      mk(11, '陈思颔', '女', '406女', '2', '', '', '', 1, 0, 0),
      mk(12, '谢清华', '男', '407男', '5', '', '', '', 0, 0, 0),
      mk(13, '牛天姿', '女', '411女', '8', '', '', '', 0, 0, 0),
      mk(14, '杨浩宇', '男', '413男', '1', '15853020421', '电商', '', 1, 0, 0),
      mk(15, '杨淑贞', '女', '411女', '1', '13455994996', '计算机', '', 0, 0, 0),
      mk(16, '宋佳展', '男', '406男', '6', '', '', '', 0, 0, 0),
      mk(17, '谢可馨', '女', '405女', '1', '18853081766', '多媒体', '', 0, 0, 0),
      mk(18, '崔振辉', '男', '407男', '2', '', '', '', 1, 0, 0),
      mk(19, '高珂馨', '女', '410女', '8', '15253061635', '电商', '', 0, 0, 0),
      mk(20, '刘若希', '男', '413男', '6', '', '', '', 0, 0, 0),
      mk(21, '刘一缘', '女', '411女', '4', '', '', '', 0, 0, 0),
      mk(22, '田雨泽', '男', '407男', '1', '', '', '', 0, 0, 0),
      mk(23, '安唱', '女', '409女', '4', '', '', '', 0, 0, 0),
      mk(24, '路智宇', '男', '406男', '4', '', '', '', 1, 0, 0),
      mk(25, '李涵涵', '女', '407女', '1', '18854013196', '餐饮转过来的，', '', 1, 0, 0),
      mk(26, '李卓然', '男', '413男', '4', '18953073800', '多媒体', '', 0, 0, 0),
      mk(27, '马伊琳', '女', '407女', '4', '13854058089', '抑郁症，有问题直接找张英老师，学生含张英老师姨', '', 0, 0, 0),
      mk(28, '姚鑫美', '女', '407女', '5', '19105402806', '魏鲁钰老师的学生，贫困生，', '', 0, 0, 0),
      mk(29, '师庆晗', '男', '405男', '7', '', '', '', 0, 0, 0),
      mk(30, '靳二凤', '女', '407女', '6', '', '面点转电商，找红姐要转专业确认单', '', 0, 0, 0),
      mk(31, '王家兴', '男', '405男', '2', '', '', '', 0, 0, 0),
      mk(32, '袁贾婷', '女', '407女', '3', '15953016105', '', '', 0, 0, 0),
      mk(33, '赵子栋', '男', '407男', '4', '', '', '', 0, 0, 0),
      mk(34, '仵梦瑶', '女', '407女', '8', '15020189006', '', '', 0, 0, 0),
      mk(35, '赵子默', '男', '405男', '4', '', '', '', 0, 0, 0),
      mk(36, '陈娇', '女', '406女', '6', '', '', '', 0, 0, 0),
      mk(37, '谷阳', '女', '409女', '2', '13336204448', '多媒体', '', 0, 0, 0),
      mk(38, '邓雪敏', '女', '406女', '5', '', '', '', 0, 0, 0),
      mk(39, '邵金金', '女', '405女', '8', '15098386088', '计算机', '', 1, 0, 0),
      mk(40, '马芷若', '女', '411女', '2', '17263345582', '电商', '', 1, 0, 0),
      mk(41, '张琳琳', '女', '410女', '6', '15169756528', '电商', '', 0, 0, 0),
      mk(42, '胡雨卓', '女', '410女', '2', '', '', '', 1, 0, 0),
      mk(43, '汪志远', '男', '406男', '2', '', '', '', 0, 0, 0),
      mk(44, '汪坤迪', '男', '406男', '3', '', '', '', 0, 0, 0),
      mk(45, '曹书瑜', '女', '405女', '2', '', '', '', 0, 0, 0),
      mk(46, '朱万壮', '男', '413男', '5', '', '', '', 0, 0, 0),
      mk(47, '李乐乐', '男', '406男', '5', '', '', '', 0, 0, 0),
    ];
    const leaves = [
      { id: 1, student_id: 1, start_date: '2026-09-01', end_date: null, reason: '请假（9月2号入校，入校后即离校）', status: '已返校', returned_at: '2026-10-15', created_at: 1 },
      { id: 2, student_id: 3, start_date: '2026-09-01', end_date: null, reason: '请假（9月2号）', status: '已返校', returned_at: '2026-10-15', created_at: 2 },
      { id: 3, student_id: 32, start_date: '2026-09-01', end_date: null, reason: '请假', status: '已返校', returned_at: '2026-10-15', created_at: 3 },
      { id: 4, student_id: 5, start_date: '2026-09-01', end_date: null, reason: '请假', status: '已返校', returned_at: '2026-10-15', created_at: 4 },
      { id: 5, student_id: 8, start_date: '2026-09-01', end_date: null, reason: '请假', status: '已返校', returned_at: '2026-10-15', created_at: 5 },
      { id: 6, student_id: 10, start_date: '2026-09-01', end_date: null, reason: '请假', status: '已返校', returned_at: '2026-10-15', created_at: 6 },
      { id: 7, student_id: 38, start_date: '2026-09-01', end_date: null, reason: '2', status: '已返校', returned_at: '2026-10-15', created_at: 7 },
      { id: 8, student_id: 12, start_date: '2026-09-01', end_date: null, reason: '2', status: '已返校', returned_at: '2026-10-15', created_at: 8 },
      { id: 9, student_id: 39, start_date: '2026-09-01', end_date: null, reason: '1', status: '已返校', returned_at: '2026-10-15', created_at: 9 },
      { id: 10, student_id: 40, start_date: '2026-09-01', end_date: null, reason: '1', status: '已返校', returned_at: '2026-10-15', created_at: 10 },
      { id: 11, student_id: 41, start_date: '2026-09-01', end_date: null, reason: '1', status: '已返校', returned_at: '2026-10-15', created_at: 11 },
      { id: 12, student_id: 42, start_date: '2026-09-01', end_date: null, reason: '1', status: '已返校', returned_at: '2026-10-15', created_at: 12 },
      { id: 13, student_id: 2, start_date: '2026-09-01', end_date: null, reason: '1', status: '已返校', returned_at: '2026-10-15', created_at: 13 },
      { id: 14, student_id: 4, start_date: '2026-09-01', end_date: null, reason: '1', status: '已返校', returned_at: '2026-10-15', created_at: 14 },
      { id: 15, student_id: 6, start_date: '2026-09-01', end_date: null, reason: '1', status: '已返校', returned_at: '2026-10-15', created_at: 15 },
      { id: 16, student_id: 7, start_date: '2026-09-01', end_date: null, reason: '1', status: '已返校', returned_at: '2026-10-15', created_at: 16 },
      { id: 17, student_id: 9, start_date: '2026-09-01', end_date: null, reason: '1', status: '已返校', returned_at: '2026-10-15', created_at: 17 },
      { id: 18, student_id: 11, start_date: '2026-09-01', end_date: null, reason: '1', status: '已返校', returned_at: '2026-10-15', created_at: 18 },
      { id: 19, student_id: 13, start_date: '2026-09-01', end_date: null, reason: '1', status: '已返校', returned_at: '2026-10-15', created_at: 19 },
      { id: 20, student_id: 15, start_date: '2026-09-01', end_date: null, reason: '1', status: '已返校', returned_at: '2026-10-15', created_at: 20 },
      { id: 21, student_id: 14, start_date: '2026-09-01', end_date: null, reason: '1', status: '已返校', returned_at: '2026-10-15', created_at: 21 },
      { id: 22, student_id: 16, start_date: '2026-09-01', end_date: null, reason: '1', status: '已返校', returned_at: '2026-10-15', created_at: 22 },
      { id: 23, student_id: 18, start_date: '2026-09-01', end_date: null, reason: '1', status: '已返校', returned_at: '2026-10-15', created_at: 23 },
      { id: 24, student_id: 20, start_date: '2026-09-01', end_date: null, reason: '1', status: '已返校', returned_at: '2026-10-15', created_at: 24 },
      { id: 25, student_id: 22, start_date: '2026-09-01', end_date: null, reason: '1', status: '已返校', returned_at: '2026-10-15', created_at: 25 },
      { id: 26, student_id: 24, start_date: '2026-09-01', end_date: null, reason: '1', status: '已返校', returned_at: '2026-10-15', created_at: 26 },
      { id: 27, student_id: 26, start_date: '2026-09-01', end_date: null, reason: '1', status: '已返校', returned_at: '2026-10-15', created_at: 27 },
      { id: 28, student_id: 17, start_date: '2026-09-01', end_date: null, reason: '1', status: '已返校', returned_at: '2026-10-15', created_at: 28 },
      { id: 29, student_id: 19, start_date: '2026-09-01', end_date: null, reason: '1', status: '已返校', returned_at: '2026-10-15', created_at: 29 },
      { id: 30, student_id: 1, start_date: '2026-10-06', end_date: '2026-10-15', reason: '就医', status: '请假中', returned_at: null, created_at: 30 },
      // 以下 5 条用于演示「统计起始日 = 10-18」之后的口径：窗口内 / 跨起始日 / 请假中未定
      { id: 31, student_id: 2, start_date: '2026-10-20', end_date: '2026-10-22', reason: '家中有事', status: '已返校', returned_at: '2026-10-22', created_at: 31 },
      { id: 32, student_id: 3, start_date: '2026-10-10', end_date: '2026-10-21', reason: '就医', status: '已返校', returned_at: '2026-10-21', created_at: 32 },
      { id: 33, student_id: 5, start_date: '2026-10-24', end_date: null, reason: '家里办事', status: '请假中', returned_at: null, created_at: 33 },
      { id: 34, student_id: 8, start_date: '2026-10-26', end_date: '2026-10-27', reason: '复诊', status: '已返校', returned_at: '2026-10-27', created_at: 34 },
      { id: 35, student_id: 10, start_date: '2026-10-19', end_date: '2026-10-19', reason: '临时请假', status: '已返校', returned_at: '2026-10-19', created_at: 35 },
    ];
    const violations = [
      { id: 1, student_id: 24, type: '沉迷手机', date: '2026-09-18', details: '宿舍熄灯后玩手机', action: '没收手机一周', created_at: 1 },
    ];
    const dining_history = [
      { id: 1, date: '2026-10-15', total: 46, onleave: 0, optout: 0, plus: 0, minus: 0, final: 46, saved_at: 1 },
    ];
    return {
      settings: { teacher_name: '林老师', dorm_meta: {} },
      students,
      leaves,
      todos: [
        { id: 1, title: '核对今晚宿舍人数', category: '宿舍', due_date: T, priority: '高', link_roster: 0, notes: '重点核对请假学生宿舍', done: 0, done_at: null, created_at: 1, postpone_count: 0 },
        { id: 2, title: '催办未缴学平险', category: '保险', due_date: null, priority: '中', link_roster: 1, notes: '', done: 0, done_at: null, created_at: 2, postpone_count: 0 },
        { id: 3, title: '已完成：更新班级黑板报', category: '其他', due_date: T, priority: '低', link_roster: 0, notes: '', done: 1, done_at: now, created_at: 3, postpone_count: 0 },
      ],
      todo_checks: students.map(s => ({ id: s.id, todo_id: 2, student_id: s.id, checked: s.id % 2 })),
      dorm_checks: [{ id: 1, student_id: 2, check_date: T, present: 0 }],
      dining_optout: [{ id: 1, date: TMS, student_id: 3 }],
      dining_daily: [{ id: 1, date: TMS, plus: 1, minus: 0 }],
      dining_history,
      tables: [{ id: 1, label: '1号桌', position: 1 }, { id: 2, label: '2号桌', position: 2 }],
      seats: [
        { id: 1, table_id: 1, student_id: 2, position: 0 }, { id: 2, table_id: 1, student_id: 4, position: 1 },
        { id: 3, table_id: 1, student_id: 6, position: 2 }, { id: 4, table_id: 1, student_id: 7, position: 3 },
        { id: 5, table_id: 2, student_id: 1, position: 0 }, { id: 6, table_id: 2, student_id: 3, position: 1 },
        { id: 7, table_id: 2, student_id: 5, position: 2 }, { id: 8, table_id: 2, student_id: 8, position: 3 },
      ],
      seating: (function () {
        const layout = [2, 3, 2];
        const rows = Array.from({ length: 7 }, () => Array(9).fill(null));
        const seatCols = [0, 1, 3, 4, 5, 7, 8];
        const ids = students.map(s => s.id);
        let k = 0;
        for (let r = 0; r < 7; r++) for (const c of seatCols) if (k < ids.length) rows[r][c] = ids[k++];
        return { layout, rows };
      })(),
      violations,
      schedules: {
        class: {
          '上午1': [{s:'计算机应用基础',t:'陈漱钰'},{s:'Excel表格制作',t:'陈漱钰'},{s:'Ps',t:'杨香玉'},{s:'计算机应用基础',t:'陈漱钰'},{s:'Ps',t:'杨香玉'}],
          '上午2': [{s:'计算机应用基础',t:'陈漱钰'},{s:'Excel表格制作',t:'陈漱钰'},{s:'Ps',t:'杨香玉'},{s:'计算机应用基础',t:'陈漱钰'},{s:'Ps',t:'杨香玉'}],
          '上午3': [{s:'计算机应用基础',t:'陈漱钰'},{s:'体育',t:'张舒'},{s:'Ps',t:'杨香玉'},{s:'安全教育',t:'刘兴杰'},{s:'Ps',t:'杨香玉'}],
          '上午4': [{s:'计算机应用基础',t:'陈漱钰'},{s:'体育',t:'张舒'},{s:'Ps',t:'杨香玉'},{s:'美术',t:'马硕'},{s:'Ps',t:'杨香玉'}],
          '下午1': [{s:'电子商务',t:'张学辉'},{s:'计算机组装维护',t:'吴巍'},{s:'物流',t:'张学辉'},{s:'音乐',t:'李沐庭'},{s:'班会',t:''}],
          '下午2': [{s:'电子商务',t:'张学辉'},{s:'计算机组装维护',t:'吴巍'},{s:'物流',t:'张学辉'},{s:'音乐',t:'李沐庭'},{s:'班会',t:''}],
          '下午3': [{s:'书法',t:''},{s:'文体活动',t:''},{s:'普通话',t:'武磊'},{s:'心理健康',t:'梁素佩'},{}],
          '晚上1': [{s:'计算机应用基础',t:'陈漱钰'},{s:'电子商务',t:'张学辉'},{s:'Ps',t:'杨香玉'},{s:'班主任',t:''},{}],
          '晚上2': [{s:'计算机应用基础',t:'陈漱钰'},{s:'物流',t:'张学辉'},{s:'Ps',t:'杨香玉'},{s:'班主任',t:''},{}],
        },
        personal: {
          '上午1': [{s:'推销实务 / 商务沟通与谈判',t:'25春考1班'},{},{s:'推销实务 / 商务沟通与谈判',t:'25春考1班'},{},{}],
          '上午2': [{s:'推销实务 / 商务沟通与谈判',t:'25春考1班'},{},{s:'推销实务 / 商务沟通与谈判',t:'25春考1班'},{},{}],
          '上午3': [{s:'推销实务 / 商务沟通与谈判',t:'24春考3班'},{},{},{},{}],
          '上午4': [{s:'推销实务 / 商务沟通与谈判',t:'24春考3班'},{},{},{},{}],
          '下午1': [{},{},{},{s:'推销实务 / 商务沟通与谈判',t:'24春考3班'},{}],
          '下午2': [{},{},{},{s:'推销实务 / 商务沟通与谈判',t:'24春考3班'},{}],
          '下午3': [{},{},{},{s:'推销实务 / 商务沟通与谈判',t:'25春考1班'},{}],
          '晚上1': [{},{s:'推销实务 / 商务沟通与谈判',t:'25春考1班'},{},{s:'班会',t:'26电商班'},{}],
          '晚上2': [{},{s:'推销实务 / 商务沟通与谈判',t:'25春考1班'},{},{s:'班会',t:'26电商班'},{}],
        },
      },
    };
  }
  let store;
  try { store = JSON.parse(localStorage.getItem(KEY)); } catch (e) { store = null; }
  if (!store || !Array.isArray(store.students)) { store = seed(); save(); }

  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }
  const nid = arr => arr.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;

  /* ---------------- 就餐自动上报（镜像 worker.js） ---------------- */
  function addDaysStr(d, n) {
    const [y, m, dd] = d.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10);
  }
  // 与 worker.js leaveCoversOn 同口径：销假日 > 预计结束日 > 未定（已销假且无日期则不算）
  function leaveCoversOn(l, date) {
    if (!l.start_date || l.start_date > date) return false;
    const stop = l.returned_at || l.end_date;
    if (stop) return stop >= date;
    return l.status === '请假中';
  }
  function diningStatsFor(date) {
    const total = store.students.length;
    // 按学生去重（重复登记只算一人），与前端 leaveIdsOn 的口径一致
    const onSet = new Set(store.leaves.filter(l => leaveCoversOn(l, date)).map(l => l.student_id));
    const onleave = onSet.size;
    const optout = store.dining_optout.filter(x => x.date === date).length;
    const daily = store.dining_daily.find(x => x.date === date) || {};
    const plus = Number(daily.plus || 0), minus = Number(daily.minus || 0);
    return { date, total, onleave, optout, plus, minus, final: Math.max(0, total - onleave - optout + plus - minus) };
  }
  function ensureDiningHistory() {
    store.dining_history = store.dining_history || [];
    const byDate = new Map(store.dining_history.map(r => [r.date, r]));
    const tomorrow = addDaysStr(T, 1);
    // 明天已有记录（老师已上报）才一起重算，避免凭空生成、也保证删掉的行不再复活
    const until = byDate.has(tomorrow) ? tomorrow : T;
    const starts = [T, ...store.dining_history.map(r => r.date), ...store.dining_daily.map(r => r.date),
      ...store.dining_optout.map(r => r.date), ...store.leaves.map(l => l.start_date)].filter(Boolean).sort();
    let from = starts[0] || T;
    const floor = addDaysStr(T, -6); // 只回溯最近 7 天（含今天）
    if (from < floor) from = floor;
    if (from > until) from = until;
    let changed = false;
    for (let d = from; d <= until; d = addDaysStr(d, 1)) {
      const old = byDate.get(d);
      if (old && old.source !== 'auto' && d < T) continue;  // 历史日的手动记录 = 定稿，不动
      const c = diningStatsFor(d);
      if (old && Number(old.final) === c.final && Number(old.total) === c.total && Number(old.onleave) === c.onleave
        && Number(old.optout) === c.optout && Number(old.plus) === c.plus && Number(old.minus) === c.minus) continue;
      // 今天/明天用手动覆盖时，记住被覆盖的手动值
      const overwritten = (old && old.source !== 'auto') ? Number(old.final) : undefined;
      if (old) Object.assign(old, c, { saved_at: now, source: 'auto',
        manual_final: overwritten !== undefined ? overwritten : (old.manual_final ?? null) });
      else store.dining_history.push({ id: nid(store.dining_history), ...c, saved_at: now, source: 'auto', manual_final: null });
      changed = true;
    }
    if (changed) save();
  }

  function getState() {
    ensureDiningHistory();
    const students = store.students.slice().sort((a, b) =>
      (a.gender < b.gender ? -1 : a.gender > b.gender ? 1 : a.name < b.name ? -1 : 1));
    const leaves = store.leaves.slice().sort((a, b) =>
      (b.start_date || '').localeCompare(a.start_date || '') || b.id - a.id);
    // 已完成超过 3 天的待办真正删除（含级联逐人勾选）
    const cutoff = now - 3 * 86400000;
    store.todo_checks = store.todo_checks.filter(c => {
      const t = store.todos.find(x => x.id === c.todo_id);
      return t && !(t.done && t.done_at && t.done_at < cutoff);
    });
    store.todos = store.todos.filter(t => !(t.done && t.done_at && t.done_at < cutoff));
    return {
      settings: store.settings || {}, students, leaves,
      todos: store.todos, todo_checks: store.todo_checks, dorm_checks: store.dorm_checks,
      dining_optout: store.dining_optout, dining_daily: store.dining_daily, dining_history: store.dining_history,
      tables: store.tables, seats: store.seats, seating: store.seating,
      violations: store.violations, schedules: store.schedules || {},
    };
  }

  /* ---------------- 路由（镜像 worker.js 的业务逻辑） ---------------- */
  function route(path, method, body) {
    const seg = path.split('/').filter(Boolean);
    const p = seg.join('/');
    if (method === 'GET' && p === 'state') return { status: 200, data: getState() };
    if (method === 'GET' && p === 'export') return { status: 200, data: { exported_at: new Date().toISOString(), data: {
      students: store.students, leaves: store.leaves, todos: store.todos, todo_checks: store.todo_checks,
      dorm_checks: store.dorm_checks, dining_optout: store.dining_optout, dining_daily: store.dining_daily,
      dining_history: store.dining_history, tables: store.tables, seats: store.seats,
      violations: store.violations, schedules: store.schedules, settings: store.settings, seating: store.seating } } };

    if (seg[0] === 'students') {
      if (method === 'POST' && seg.length === 1) {
        const dorm = String(body.dorm || ''), bed = String(body.bed || '');
        if (dorm && bed) { const taken = store.students.find(x => x.dorm === dorm && x.bed === bed); if (taken) return { status: 409, data: { error: 'bed_taken', name: taken.name } }; }
        const s = { id: nid(store.students), name: String(body.name || '').trim() || '（无名）',
          gender: body.gender === '女' ? '女' : '男', dorm, bed,
          parent_phone: String(body.parent_phone || ''), major: String(body.major || ''), notes: String(body.notes || ''),
          dorm_leader: body.dorm_leader ? 1 : 0, xueji_registered: body.xueji_registered ? 1 : 0,
          insurance_paid: body.insurance_paid ? 1 : 0, xueji_note: String(body.xueji_note || ''), insurance_note: String(body.insurance_note || ''),
          created_at: now };
        store.students.push(s); save(); return { status: 201, data: { ok: true, id: s.id } };
      }
      const id = Number(seg[1]);
      if (method === 'PATCH') {
        const cur = store.students.find(x => x.id === id); if (!cur) return { status: 404, data: { ok: false } };
        const f = (k, d) => body[k] !== undefined ? body[k] : d;
        const curDorm = String(cur.dorm || ''), curBed = String(cur.bed || '');
        const dorm = String(f('dorm', cur.dorm));
        // 换宿舍时：明确给了床号就照办（真撞车 409）；只给宿舍则优先沿用旧床号，
        // 旧床号在新宿舍已被占时退化为「只进宿舍、床号待排」。
        const dormChanged = body.dorm !== undefined && dorm !== curDorm;
        let bed = body.bed !== undefined ? String(body.bed) : curBed;
        if (dorm && bed) {
          const taken = store.students.find(x => x.dorm === dorm && x.bed === bed && x.id !== id);
          if (taken) {
            if (body.bed === undefined && dormChanged) bed = '';
            else return { status: 409, data: { error: 'bed_taken', name: taken.name, bed,
              message: `床号 ${bed} 已被 ${taken.name} 占用` } };
          }
        }
        cur.name = String(f('name', cur.name)).trim() || cur.name;
        cur.gender = f('gender', cur.gender) === '女' ? '女' : '男';
        cur.dorm = dorm; cur.bed = bed;
        cur.parent_phone = String(f('parent_phone', cur.parent_phone)); cur.major = String(f('major', cur.major));
        cur.notes = String(f('notes', cur.notes));
        cur.dorm_leader = f('dorm_leader', cur.dorm_leader) ? 1 : 0;
        cur.xueji_registered = f('xueji_registered', cur.xueji_registered) ? 1 : 0;
        cur.insurance_paid = f('insurance_paid', cur.insurance_paid) ? 1 : 0;
        cur.xueji_note = String(f('xueji_note', cur.xueji_note));
        cur.insurance_note = String(f('insurance_note', cur.insurance_note));
        if (body.dorm_leader === 1 && cur.dorm) store.students.forEach(o => { if (o.dorm === cur.dorm && o.id !== id) o.dorm_leader = 0; });
        save(); return { status: 200, data: { ok: true } };
      }
      if (method === 'DELETE') {
        const delName = (store.students.find(x => x.id === id) || {}).name;
        ['todo_checks', 'dorm_checks', 'dining_optout', 'seats', 'leaves', 'violations']
          .forEach(t => { store[t] = store[t].filter(x => x.student_id !== id); });
        // 座次表按学号存储：同步清掉该生座位（学号匹配 + 姓名匹配兜底旧数据）
        if (store.seating && Array.isArray(store.seating.rows)) {
          for (const row of store.seating.rows) for (let c = 0; c < row.length; c++) if (String(row[c]) === String(id) || row[c] === delName) row[c] = null;
        }
        store.students = store.students.filter(x => x.id !== id); save();
        return { status: 200, data: { ok: true } };
      }
    }

    if (seg[0] === 'dorm-assign' && method === 'PUT') {
      const target = String(body.dorm || '').trim();
      if (!target) return { status: 400, data: { error: 'no_dorm', message: '缺少目标宿舍' } };
      const members = Array.isArray(body.members) ? body.members : [];
      const removeIds = (Array.isArray(body.remove) ? body.remove : []).map(Number);
      const snapshot = store.students.map(s => ({ ...s }));
      const touched = new Set();
      for (const id of removeIds) {
        const s = store.students.find(x => x.id === id);
        if (!s) continue;
        s.dorm = ''; s.bed = ''; s.dorm_leader = 0; touched.add(id);
      }
      for (const mb of members) {
        const s = store.students.find(x => x.id === Number(mb.id));
        if (!s) continue;
        s.dorm = target; s.bed = String(mb.bed ?? '').trim(); s.dorm_leader = mb.leader ? 1 : 0;
        touched.add(s.id);
      }
      // 唯一性校验：只看本次涉及的学生（与 worker.js 的 assignDorm 一致）
      for (const id of touched) {
        const s = store.students.find(x => x.id === id);
        if (!s || !s.dorm || !s.bed) continue;
        const other = store.students.find(o => o.id !== id && o.dorm === s.dorm && o.bed === s.bed);
        if (other) {
          store.students = snapshot;
          return { status: 409, data: { error: 'bed_taken', name: other.name, bed: s.bed, dorm: s.dorm,
            message: `${s.dorm} 的 ${s.bed} 号床已被 ${other.name} 占用` } };
        }
      }
      // 宿舍长唯一：保留最后一个勾选的人
      const leaders = store.students.filter(x => x.dorm === target && x.dorm_leader);
      if (leaders.length > 1) {
        const keep = leaders[leaders.length - 1];
        store.students.forEach(x => { if (x.dorm === target && x.id !== keep.id) x.dorm_leader = 0; });
      }
      if (body.date && body.present && typeof body.present === 'object') {
        for (const [sid, val] of Object.entries(body.present)) {
          const c = store.dorm_checks.find(x => x.student_id === Number(sid) && x.check_date === body.date);
          if (c) c.present = val ? 1 : 0;
          else store.dorm_checks.push({ id: nid(store.dorm_checks), student_id: Number(sid), check_date: body.date, present: val ? 1 : 0 });
        }
      }
      save(); return { status: 200, data: { ok: true } };
    }

    if (seg[0] === 'leaves') {
      if (method === 'POST' && seg.length === 1) {
        const ids = Array.isArray(body.student_ids) ? body.student_ids : (body.student_id ? [body.student_id] : []);
        let n = 0;
        for (const sid of ids) { store.leaves.push({ id: nid(store.leaves), student_id: sid, start_date: body.start_date,
          end_date: body.end_date || null, reason: String(body.reason || ''), status: '请假中', returned_at: null, created_at: now }); n++; }
        save(); return { status: 201, data: { ok: true, added: n } };
      }
      const id = Number(seg[1]);
      if (method === 'PATCH' && seg.length === 2) {
        const cur = store.leaves.find(x => x.id === id); if (!cur) return { status: 404, data: { ok: false } };
        cur.start_date = body.start_date ?? cur.start_date; cur.end_date = body.end_date ?? cur.end_date;
        cur.reason = body.reason ?? cur.reason; cur.status = body.status ?? cur.status; save();
        return { status: 200, data: { ok: true } };
      }
      if (method === 'POST' && seg[2] === 'return') {
        const cur = store.leaves.find(x => x.id === id); if (cur) { cur.status = '已返校'; cur.returned_at = T; save(); }
        return { status: 200, data: { ok: true } };
      }
      if (method === 'DELETE') { store.leaves = store.leaves.filter(x => x.id !== id); save(); return { status: 200, data: { ok: true } }; }
    }

    if (seg[0] === 'todos') {
      if (method === 'POST' && seg.length === 1) {
        const t = { id: nid(store.todos), title: String(body.title || '').trim() || '（无标题）',
          category: String(body.category || '其他'), due_date: body.due_date || null,
          priority: ['高', '中', '低'].includes(body.priority) ? body.priority : '中',
          link_roster: body.link_roster ? 1 : 0, notes: String(body.notes || ''),
          created_at: now, done: 0, done_at: null, postpone_count: 0 };
        store.todos.push(t);
        if (t.link_roster) for (const s of store.students) store.todo_checks.push({ id: nid(store.todo_checks), todo_id: t.id, student_id: s.id, checked: 0 });
        save(); return { status: 201, data: { ok: true, id: t.id } };
      }
      const id = Number(seg[1]);
      if (method === 'PATCH' && seg.length === 2) {
        const cur = store.todos.find(x => x.id === id); if (!cur) return { status: 404, data: { ok: false } };
        const wasLinked = cur.link_roster;
        if (body.action === 'done') { cur.done = 1; cur.done_at = now; }
        else if (body.action === 'undone') { cur.done = 0; cur.done_at = null; }
        else if (body.action === 'postpone') {
          let next;
          if (cur.due_date && /^\d{4}-\d{2}-\d{2}$/.test(cur.due_date)) {
            const [y, m, d] = cur.due_date.split('-').map(Number);
            next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
          } else next = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
          cur.due_date = next; cur.postpone_count = (cur.postpone_count || 0) + 1;
        } else {
          cur.title = String(body.title ?? cur.title).trim() || cur.title;
          cur.category = String(body.category ?? cur.category);
          cur.due_date = body.due_date !== undefined ? (body.due_date || null) : cur.due_date;
          cur.priority = ['高', '中', '低'].includes(body.priority) ? body.priority : cur.priority;
          cur.link_roster = body.link_roster !== undefined ? (body.link_roster ? 1 : 0) : cur.link_roster;
          cur.notes = String(body.notes ?? cur.notes);
          if (body.link_roster === 1 && !wasLinked) for (const s of store.students) store.todo_checks.push({ id: nid(store.todo_checks), todo_id: id, student_id: s.id, checked: 0 });
        }
        save(); return { status: 200, data: { ok: true } };
      }
      if (method === 'DELETE' && seg.length === 2) {
        store.todo_checks = store.todo_checks.filter(x => x.todo_id !== id);
        store.todos = store.todos.filter(x => x.id !== id); save();
        return { status: 200, data: { ok: true } };
      }
      if (method === 'PUT' && seg[2] === 'checks') {
        const map = body.checks || {};
        for (const [sid, val] of Object.entries(map)) {
          const ex = store.todo_checks.find(x => x.todo_id === id && x.student_id === Number(sid));
          if (ex) ex.checked = val ? 1 : 0; else store.todo_checks.push({ id: nid(store.todo_checks), todo_id: id, student_id: Number(sid), checked: val ? 1 : 0 });
        }
        save(); return { status: 200, data: { ok: true } };
      }
    }

    if (seg[0] === 'dorm-check') {
      if (method === 'PUT') {
        const date = body.date, map = body.present || {};
        for (const [sid, val] of Object.entries(map)) {
          const ex = store.dorm_checks.find(x => x.student_id === Number(sid) && x.check_date === date);
          if (ex) ex.present = val ? 1 : 0; else store.dorm_checks.push({ id: nid(store.dorm_checks), student_id: Number(sid), check_date: date, present: val ? 1 : 0 });
        }
        save(); return { status: 200, data: { ok: true } };
      }
      if (method === 'DELETE') { store.dorm_checks = store.dorm_checks.filter(x => x.check_date !== body.date); save(); return { status: 200, data: { ok: true } }; }
    }

    if (seg[0] === 'dining' && method === 'PUT') {
      const date = body.date;
      if (Array.isArray(body.optout)) { store.dining_optout = store.dining_optout.filter(x => x.date !== date); for (const sid of body.optout) store.dining_optout.push({ id: nid(store.dining_optout), date, student_id: sid }); }
      const plus = Number(body.plus || 0), minus = Number(body.minus || 0);
      const ex = store.dining_daily.find(x => x.date === date);
      if (ex) { ex.plus = plus; ex.minus = minus; } else store.dining_daily.push({ id: nid(store.dining_daily), date, plus, minus });
      const c = diningStatsFor(date);
      const rec = { ...c, saved_at: now, source: 'manual', manual_final: null };  // 手动保存 → 清掉之前被覆盖的记录
      const hEx = store.dining_history.find(x => x.date === date);
      if (hEx) Object.assign(hEx, rec); else store.dining_history.push({ id: nid(store.dining_history), ...rec });
      save(); return { status: 200, data: { ok: true } };
    }

    if (seg[0] === 'tables') {
      if (method === 'POST' && seg.length === 1) {
        const maxPos = store.tables.reduce((m, t) => Math.max(m, t.position || 0), 0);
        const t = { id: nid(store.tables), label: String(body.label || '新桌'), position: maxPos + 1 };
        store.tables.push(t); save(); return { status: 201, data: { ok: true, id: t.id } };
      }
      const id = Number(seg[1]);
      if (method === 'PATCH') { const c = store.tables.find(x => x.id === id); if (c) { c.label = String(body.label || '桌'); save(); } return { status: 200, data: { ok: true } }; }
      if (method === 'DELETE') { store.seats = store.seats.filter(x => x.table_id !== id); store.tables = store.tables.filter(x => x.id !== id); save(); return { status: 200, data: { ok: true } }; }
      if (method === 'PUT' && seg[2] === 'members') {
        const members = Array.isArray(body.members) ? body.members : [];
        store.seats = store.seats.filter(x => x.table_id !== id); let pos = 0;
        for (const sid of members) store.seats.push({ id: nid(store.seats), table_id: id, student_id: sid, position: pos++ });
        save(); return { status: 200, data: { ok: true } };
      }
    }

    if (seg[0] === 'seating' && method === 'PUT') { store.seating = { layout: body.layout || [2, 3, 2], rows: body.rows || [] }; save(); return { status: 200, data: { ok: true } }; }

    if (seg[0] === 'violations') {
      if (method === 'POST' && seg.length === 1) {
        const v = { id: nid(store.violations), student_id: body.student_id, type: String(body.type || '其他违规'), date: body.date, details: String(body.details || ''), action: String(body.action || ''), created_at: now };
        store.violations.push(v); save(); return { status: 201, data: { ok: true, id: v.id } };
      }
      if (method === 'DELETE') { store.violations = store.violations.filter(x => x.id !== Number(seg[1])); save(); return { status: 200, data: { ok: true } }; }
    }

    if (seg[0] === 'schedule' && method === 'PUT') {
      const kind = seg[1] === 'personal' ? 'personal' : 'class';
      store.schedules = store.schedules || {}; store.schedules[kind] = body.data || {}; save();
      return { status: 200, data: { ok: true } };
    }

    if (seg[0] === 'settings' && method === 'PUT') {
      const k = Object.keys(body)[0]; store.settings = store.settings || {}; store.settings[k] = body[k]; save();
      return { status: 200, data: { ok: true } };
    }

    return { status: 404, data: { error: 'Not found: ' + p } };
  }

  window.fetch = async (url, opt = {}) => {
    const u = (typeof url === 'string') ? url : (url && url.url) || '';
    const path = u.replace(/^.*?\/api/, '');
    const method = (opt.method || 'GET').toUpperCase();
    let body = {};
    if (opt.body) { try { body = JSON.parse(opt.body); } catch (e) { body = {}; } }
    const res = route(path, method, body);
    const st = res.status || 200;
    return { ok: st >= 200 && st < 300, status: st, json: async () => res.data, text: async () => JSON.stringify(res.data) };
  };

  const rb = document.getElementById('btn-reset');
  if (rb) rb.addEventListener('click', () => { localStorage.removeItem(KEY); location.reload(); });
})();
