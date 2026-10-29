-- 班主任工作台 · D1 数据库结构（全模块）
-- 花名册 students 是唯一数据源；请假/宿舍/就餐/学籍/保险/违规都关联 student_id。

-- 班级花名册（唯一数据源）
CREATE TABLE IF NOT EXISTS students (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  gender          TEXT    NOT NULL DEFAULT '男',   -- 男 / 女
  dorm            TEXT    DEFAULT '',              -- 宿舍（如 405男）
  bed             TEXT    DEFAULT '',              -- 床号
  parent_phone    TEXT    DEFAULT '',              -- 家长电话
  major           TEXT    DEFAULT '',              -- 专业
  notes           TEXT    DEFAULT '',              -- 备注（性格/家庭情况等）
  dorm_leader     INTEGER NOT NULL DEFAULT 0,      -- 宿舍长
  xueji_registered INTEGER NOT NULL DEFAULT 0,     -- 学籍注册
  insurance_paid  INTEGER NOT NULL DEFAULT 0,      -- 学平险已上缴
  xueji_note      TEXT    DEFAULT '',              -- 学籍备注（独立，不复制花名册备注）
  insurance_note  TEXT    DEFAULT '',              -- 保险备注（独立，不复制花名册备注）
  created_at      INTEGER NOT NULL
);

-- 请假记录（关联花名册；就餐/宿舍自动联动）
CREATE TABLE IF NOT EXISTS leaves (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER NOT NULL,
  start_date  TEXT    NOT NULL,                 -- YYYY-MM-DD
  end_date    TEXT,                             -- 预计结束，NULL=未定
  reason      TEXT    DEFAULT '',
  status      TEXT    NOT NULL DEFAULT '请假中', -- 请假中 / 已返校
  returned_at TEXT,                             -- 销假日期
  created_at  INTEGER NOT NULL
);

-- 待办事项
CREATE TABLE IF NOT EXISTS todos (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  title          TEXT    NOT NULL,
  category       TEXT    NOT NULL DEFAULT '其他', -- 宿舍/就餐/请假/学籍/保险/教学/其他
  due_date       TEXT,                            -- NULL=无期限
  priority       TEXT    NOT NULL DEFAULT '中',   -- 高/中/低
  link_roster    INTEGER NOT NULL DEFAULT 0,      -- 关联花名册（逐人勾选）
  notes          TEXT    DEFAULT '',
  done           INTEGER NOT NULL DEFAULT 0,
  done_at        INTEGER,
  created_at     INTEGER NOT NULL,
  postpone_count INTEGER NOT NULL DEFAULT 0
);

-- 待办 × 花名册 逐人勾选（link_roster=1 时用）
CREATE TABLE IF NOT EXISTS todo_checks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  todo_id    INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  checked    INTEGER NOT NULL DEFAULT 0
);

-- 宿舍每日核对（请假中自动"不在校"，可手动改）
CREATE TABLE IF NOT EXISTS dorm_checks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  check_date TEXT    NOT NULL,
  present    INTEGER NOT NULL DEFAULT 1
);

-- 就餐：每日不吃名单 + 手动增减
CREATE TABLE IF NOT EXISTS dining_optout (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT    NOT NULL,
  student_id INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS dining_daily (
  date      TEXT PRIMARY KEY,
  plus      INTEGER NOT NULL DEFAULT 0,   -- 手动增加（回校就餐）
  minus     INTEGER NOT NULL DEFAULT 0    -- 手动减少（请假不返）
);

-- 就餐席位（桌位 + 桌上成员按序）
CREATE TABLE IF NOT EXISTS dining_tables (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  label    TEXT    NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS dining_seats (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  table_id   INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0
);

-- 座次表（单行；data 存 JSON：{layout:[2,3,2], rows:[[studentId|null,...],...]}）
CREATE TABLE IF NOT EXISTS seating (
  id   INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL DEFAULT '{}'
);

-- 违规违纪
CREATE TABLE IF NOT EXISTS violations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  type       TEXT    NOT NULL DEFAULT '其他违规', -- 沉迷手机/课堂违规/其他违规
  date       TEXT    NOT NULL,
  details    TEXT    DEFAULT '',
  action     TEXT    DEFAULT '',                  -- 处理方式
  created_at INTEGER NOT NULL
);

-- 课程表（kind: class 班级 / personal 个人；data 存 JSON）
CREATE TABLE IF NOT EXISTS schedules (
  kind TEXT PRIMARY KEY,
  data TEXT NOT NULL DEFAULT '{}'
);

-- 设置（teacher_name、dorm_meta 宿舍床位等）
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

-- 就餐上报历史快照（手动保存 / 系统自动补报）
CREATE TABLE IF NOT EXISTS dining_history (
  date      TEXT PRIMARY KEY,
  total     INTEGER NOT NULL DEFAULT 0,
  onleave   INTEGER NOT NULL DEFAULT 0,
  optout    INTEGER NOT NULL DEFAULT 0,
  plus      INTEGER NOT NULL DEFAULT 0,
  minus     INTEGER NOT NULL DEFAULT 0,
  final     INTEGER NOT NULL DEFAULT 0,
  saved_at  INTEGER,
  source       TEXT NOT NULL DEFAULT 'manual',  -- manual=老师手动上报 / auto=系统按当前数据自动上报
  manual_final INTEGER                          -- 自动覆盖手动时，留一手动值备查（界面显示「曾手动 42」）
);

CREATE INDEX IF NOT EXISTS idx_leaves_student ON leaves(student_id);
CREATE INDEX IF NOT EXISTS idx_todos_done ON todos(done);
CREATE INDEX IF NOT EXISTS idx_checks_todo ON todo_checks(todo_id);
