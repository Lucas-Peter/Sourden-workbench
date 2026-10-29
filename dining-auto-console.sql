-- 就餐自动上报（2026-10-29）：给 dining_history 加两列
--   source       手动上报 / 自动上报
--   manual_final 自动覆盖手动时，留一手动值备查
-- Worker 会在第一次请求时自动尝试加这两列；如果你更想手动执行，就把下面两句贴进
-- Cloudflare → D1 → sourden-workbench → Console 跑一次（已经加过会报 duplicate column，忽略即可）。
ALTER TABLE dining_history ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE dining_history ADD COLUMN manual_final INTEGER;

-- 可选：把历史上「老师没手动调整、所以没记录」的就餐日补齐，由 Worker 自动完成（打开页面或每天 23:00 定时任务）。
-- 不需要手动 INSERT，这里只是留档说明。
