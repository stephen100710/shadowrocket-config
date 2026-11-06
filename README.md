# shadowrocket-config

Shadowrocket（小火箭）规则配置：自用代理分流 + 微博去广告。

## 文件

- `YYDS-3-v8.conf` — 主配置，导入小火箭即可用。脚本与规则列表全部引用本仓库的 raw 链接，不依赖第三方临时链接。
- `weibo-feed-filter.js` — 微博信息流 / 视频流 / 评论区 / 帖子详情 / 搜索去广告脚本（http-response）。
- `weibo-launch.js` — 微博开屏广告清缓存脚本（http-response）。
- `*.list` — 8 个 RULE-SET 规则列表，2026-11-06 自 ACL4SSR 同步的快照（保持原顺序）：
  `LocalAreaNetwork`、`UnBan`、`ChinaDomain`、`ChinaMedia`、`BanAD`、`BanProgramAD`、`ChinaCompanyIp`、`ChinaIp`。

## 使用

小火箭导入 `YYDS-3-v8.conf` 即可。配置内脚本与列表均走 `raw.githubusercontent.com/stephen100710/shadowrocket-config/main/...`，无需再单独导入 `.js`。

## 注意

- 规则列表是快照，不再随 ACL4SSR 自动更新；如需更新，重新从 ACL4SSR 同步后覆盖。
- 配置与脚本含个人使用的代理节点引用与 MITM 相关内容，仅供本人使用。
