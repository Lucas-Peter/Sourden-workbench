# 班主任工作台 · 部署指引（难猜子域名 · 免登录）

> **访问方式：免登录，靠难猜的专属子域名做隔离。** 不用 Cloudflare Access，也不设密码；只要网址够随机、不外泄，一般人就找不到。适合内部班级数据（非机密）。
> 沿用你 sourden.com 的「GitHub 上传 → Cloudflare 构建」习惯，但这次是 **Cloudflare Worker + D1**（不是纯静态站），所以多了「建数据库 + 绑 D1」两步。整体流程：

## 1. 建数据库（一次性）
Cloudflare 后台 → **D1** → Create database → 名称填 `sourden-workbench` → 建好后点进库，把 **database_id** 复制到本目录 `wrangler.toml` 的 `database_id` 处（替换 `REPLACE_WITH_YOUR_D1_ID`）。
然后在该库的 **Console** 里把 `schema.sql` 的全部语句执行一遍（建表）。

## 2. 上传代码
在 GitHub 新建一个仓库（如 `workbench`），把这几个文件/文件夹传上去（注意 `public` 是文件夹，先建文件夹再传里面的文件）：
`worker.js` / `wrangler.toml` / `schema.sql` / `public/index.html` / `public/style.css` / `public/app.js` /
`public/widget.html` / `public/manifest.webmanifest` / `public/sw.js` / `public/icon-192.png` / `public/icon-512.png` / `public/apple-touch-icon.png`
（可选：`dining-auto-console.sql` 只是迁移说明；`public/preview.html` 是本地预览页，建议不要传线上；`_wb-build-preview.mjs`、`_wb-make-icons.mjs` 是本地脚本，不需要上传。）

## 3. 连接 Cloudflare
Cloudflare 后台 → **Workers & Pages** → Create → 选「连接 GitHub 仓库」→ 选 `workbench` 仓库。
- 框架预设：选 **Workers**（不是 Pages 框架）。
- 构建命令：留空；部署命令：`wrangler deploy`（默认）。
- 部署后进入该 Worker → **Settings → Variables → D1 绑定**，确认已有 `DB` 绑定（来自 wrangler.toml，但要在界面里点一下确认生效）。

## 4. 绑一个难猜的子域名（代替登录）
不要用 `app.sourden.com` 这种好猜的。本仓库已生成一个随机子域名示例：

```
wb-yhbthz7mnbnfa8.sourden.com
```

- 进入该 Worker → **Settings → Custom Domains** → 输入上面这个（或你自己另起一个同样随机的，例如 `wb-` + 14 位随机字母数字）→ 自动签发 SSL。
- （这条记录会自动出现在 Cloudflare → DNS 里，无需手动加 CNAME。）
- **这个网址就是「钥匙」**：只发给你和要进来的人，别公开、别写进任何公开页面。谁拿到链接谁就能看/改数据。
- 想换链接时，删掉这个 Custom Domain、再加一个新的随机子域名即可（旧链接立刻失效，D1 数据不受影响）。

## 5. 验证（直接打开链接，无需登录）
打开你第 4 步绑的那个随机子域名（如 `wb-yhbthz7mnbnfa8.sourden.com`）→ 在「今日待办」加一条、标记完成、顺延一天，确认都正常；点「导出备份」应能下载 JSON。

## 6. 关于本地预览文件
本目录 `public/preview.html` 是一个**本地预览页**：用浏览器本地存储模拟后端，加载真实的 `app.js`，双击即可点开全部功能（数据存在你这台浏览器里，不会上传）。
- 它仅供你先在电脑上试用；**部署到 Cloudflare 前建议删掉 `public/preview.html`**，否则线上也会多出一个用浏览器本地存储的演示页，与 D1 正式数据不互通，容易混淆。
- 想重新本地预览：把 `public/preview.html` 放回 `public/` 即可；改完 `app.js`/`preview-shim.js` 后执行 `node _wb-build-preview.mjs` 重新内联。

## 7. 就餐自动上报（2026-10-29 起）
- **口径**：就餐人数 = 总人数 − 当天请假（按学生去重，销假日优先）− 不就餐 + 手动增 − 手动减。前后端用同一套 `leaveCoversOn`，所以页面大红字、统计表、上报记录三处数字一定对得上。
- **覆盖规则**：今天和明天的数据还会变，**自动上报（跑得更晚）会覆盖更早的手动上报**，被覆盖的手动人数记在 `manual_final`，界面来源里显示「自动 + 曾手动 42」；今天以前的手动记录视为定稿，永不被改写。
- **触发时机**：① 任何人打开工作台时补齐最近 7 天（含今天）缺的记录；② `wrangler.toml` 里的 `[triggers] crons = ["0 15 * * *"]`（每天 **23:00 北京时间**，即 15:00 UTC）兜底跑一次。23:00 之后如又有学生请假/调整，下一次打开工作台会把这条记录更新到最新值。
- **范围**：最近 7 天；「明天」只在已经有一条记录时才重算（不会凭空生成，也保证你删掉的周末那行不会复活）。
- **数据库**：`dining_history` 新增 `source`（manual/auto）、`manual_final`（被覆盖的手动人数）两列。Worker 第一次请求会自动 `ALTER TABLE` 补上，**不需要手动执行 SQL**；想手动加就执行 `dining-auto-console.sql`。
- **注意**：新增的 cron 触发器需要重新部署一次才生效（GitHub 提交后 Cloudflare 自动构建即可）。

## 8. 写库性能约定（重要，改代码前先看）
Cloudflare D1 免费版限制：**一次 Worker 请求最多执行 50 条查询**（`db.batch()` 整体只算 1 条）。
所以凡是「一次操作要写全班数据」的地方，都必须用批量写法，不能逐人 `await run()`：

| 场景 | 做法 | 查询条数（47 人） |
|---|---|---|
| 逐人核对（待办） | `DELETE` + `INSERT ... SELECT FROM students` + 一条 `IN (...)` 更新 | 3 |
| 宿舍人数核对 | 一条 `DELETE ... IN` + 多行 `VALUES` 插入（每句 ≤33 行） | 2 |
| 不吃名单 / 桌位成员 | `db.batch([...])` | 1 |

历史教训：2026-11-01 之前逐人核对是「每人 SELECT + UPDATE」，47 人 = 94 条查询 → 超限后请求中途失败，
表现为「点保存没反应 / 只存进去一部分人」，而且前端没有 catch，连报错都看不到。

## 9. 待办提醒（PushPlus 推微信）与桌面卡片（2026-11-05 起）
### 9.1 怎么开启（一次性，3 分钟）
1. 手机/电脑打开 **pushplus.plus** → 微信扫码登录 → 在首页「一对一推送」里复制 **token**（32 位）。
2. 打开工作台 → 右上角 **🔔 提醒** → 粘贴 token → **保存** → 点 **发送测试**。
3. 微信会收到一条消息，点进去关注公众号即可（之后所有提醒都走这里）。

### 9.2 提醒规则
| 提醒 | 触发时间 | 说明 |
|---|---|---|
| 快要到点 | 截止时间 − 提前量（默认 30 分钟） | 每条待办可单独设 15 分 / 30 分 / 1 小时 / 2 小时 / 1 天，或关闭 |
| 每日汇总 | 每天 08:00 后第一次定时任务 | 今日待办 + 逾期未完成 + 今日请假人数 + 明日就餐人数 |
| 逾期催办 | 跟着每日汇总 | 过了截止日期还没勾完成的，每天催一次（可在 🔔 提醒 里关掉） |

- 实现：`wrangler.toml` 增加 `*/5 * * * *` 定时任务，每 5 分钟扫一遍；`todo_reminders` 表用唯一索引
  `(todo_id, kind, fire_date)` 去重，**同一件事一天只推一次**，推送失败不记账（下一轮会重试）。
- 待办时间留空时按当天 08:00 计算，等于「早上提醒我今天有这件事」。
- 页面开着时还有一层本地兜底：浏览器通知 + 提示音 + 标题闪烁（需在 🔔 提醒 里点「申请桌面通知权限」）。

### 9.3 桌面卡片（PWA 小窗）
1. 工作台 → 🔔 提醒 → **打开待办小卡片**（或直接访问 `你的域名/widget`）。
2. 在打开的小窗里点地址栏右侧 **安装**（Edge/Chrome），勾选「固定到任务栏」；桌面会多一个图标。
3. 开机自启：`Win + R` → 输入 `shell:startup` → 把那个快捷方式拖进去。
4. 想让它一直压在其它窗口上面：装微软官方 **PowerToys**，选中小窗按 `Win + Ctrl + T`。

卡片特性：340×470 独立窗口、30 秒自动刷新、点 ✓ 直接标记完成、显示请假人数、适配深色模式。
相关文件：`public/widget.html`、`public/manifest.webmanifest`、`public/sw.js`、`public/icon-192/512.png`
（图标由 `node _wb-make-icons.mjs` 生成，改配色后重跑即可）。

### 9.4 数据库
`todos` 增加 `due_time` / `remind_before` / `remind_on`，新增 `todo_reminders` 表。Worker 首次请求会自动
`ALTER TABLE`，**不需要手动跑 SQL**；校验见 `schema.sql`。

## 更新代码
改完文件后在 GitHub 重新上传/提交，Cloudflare 自动重新构建（**数据在 D1，不会因更新代码丢失**）。

## 备份（双重保险）
除 D1 外，界面右上角「导出备份」可随时下载全部数据为 JSON，存本地即可。
