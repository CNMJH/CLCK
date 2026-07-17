# CLCK 项目记录

> 最后整理：2026-07-17  
> 项目名称：CLCK  
> 网站名称：毕塔索的动画参考库  
> 项目说明：柳的网页  
> 当前状态：已上线运行

---

## 1. 项目概览

CLCK 是一个面向动画参考资料整理的轻量 Web 应用，主要用于收藏和管理 Bilibili 动画视频链接。网站采用“本地优先 + 手动云同步”的设计：日常数据保存在浏览器 localStorage 中，用户可手动把完整数据备份到 Cloudflare D1，并在其他设备上选择历史版本加载。

### 主要地址

- 正式网站：<https://ikik.site>
- GitHub 仓库：<https://github.com/CNMJH/CLCK>
- GitHub 所有者：`CNMJH`
- 默认分支：`main`
- Cloudflare Worker：`clckhome`
- Cloudflare D1 数据库：`clshujuk`
- D1 数据库 ID：`4c47ba25-7d77-426c-91f1-737c0e7a5638`

### 部署平台

- 托管平台：Cloudflare Workers Static Assets
- 部署方式：GitHub 仓库连接 Cloudflare，`main` 分支提交后自动构建部署
- 静态资源目录：`public/`
- Worker 入口：`worker.js`
- 配置文件：`wrangler.jsonc`
- 自定义域名：`ikik.site`

---

## 2. 当前目录结构

```text
CLCK/
├─ public/
│  └─ index.html       # 网站页面、样式和前端业务逻辑
├─ worker.js           # Cloudflare Worker 云备份 API
├─ wrangler.jsonc      # Worker、静态资源和 D1 绑定配置
└─ PROJECT_RECORD.md   # 本项目记录
```

项目目前没有构建步骤，也没有 npm 运行依赖。Tailwind CSS 与 Font Awesome 通过 CDN 加载。

---

## 3. 技术架构

### 前端

- 单页 HTML 应用
- Tailwind CSS CDN
- Font Awesome 4.7 CDN
- 原生 JavaScript
- localStorage 本地持久化

### 云端

- Cloudflare Workers：提供同域 API 和静态资源托管
- Cloudflare D1：保存云端历史备份
- GitHub：源代码版本管理及 Cloudflare 自动部署来源

### 外部服务

- Bilibili API：根据 BV 号取得视频封面地址
- `images.weserv.nl`：代理显示 B站封面，降低防盗链影响

### 数据流

```text
日常使用：
浏览器界面 ↔ localStorage

手动上传：
localStorage → /api/cloud-data → Worker 密码验证 → D1 新增历史版本

手动加载：
D1 历史版本 → /api/cloud-data → 浏览器 → localStorage → 重新渲染

封面显示：
B站视频链接 → 提取 BV 号 → B站 JSONP API → 封面 URL
→ images.weserv.nl → 浏览器显示
```

---

## 4. 网站功能

### 4.1 视频管理

- 添加 B站视频链接
- 手动输入视频标题
- 为视频选择多个标签
- 支持输入新标签
- 编辑视频标题和标签
- 删除视频
- 点击卡片跳转到 B站视频

### 4.2 搜索和筛选

- 按标题关键词搜索
- 按标签筛选
- 显示全部视频
- 标签新增和删除

### 4.3 本地数据管理

- 数据默认保存在浏览器 localStorage
- 本地导出为 JSON
- 从 JSON 文件导入并覆盖本地数据
- 导入前有确认提示

右上角四个图标从左到右为：

1. 上传云端
2. 加载云端
3. 本地下载（导出 JSON）
4. 本地加载（导入 JSON）

云端按钮只显示图标，使用 `title` 提供鼠标悬停说明。

### 4.4 跨设备云同步

网站采用手动同步，不会在每次修改时自动写入云端。

#### 上传云端

- 点击右上角“上传云端”图标
- 输入管理员密码
- 显示当前视频与标签数量并要求确认
- 将 `videos` 与 `tags` 上传到 D1
- 每次不同内容都创建一个新历史版本
- 如果和最新版本内容相同，则不重复保存
- 自动记录上传设备信息

#### 加载云端

- 点击右上角“加载云端”图标
- 输入管理员密码
- 获取最近 30 个历史版本
- 显示版本时间、视频数、标签数和设备信息
- 用户选择版本后再次确认
- 覆盖前把当前本地数据保存到 `animationBeforeCloudLoad`
- 将所选云端版本写入 localStorage 并刷新界面

#### 首次访问提醒

新设备、新浏览器、无痕环境或清除浏览器数据后，首次打开网站会显示：

> 记得先加载云端！不是CL请忽略

可选择“立即加载云端”或“暂不加载”。已显示状态保存在 `clckCloudReminderSeen`。

---

## 5. localStorage 数据

### 主要键

| 键名 | 用途 |
|---|---|
| `animationVideos` | 视频卡片数据数组 |
| `animationTags` | 标签数组 |
| `animationBeforeCloudLoad` | 加载云端前的本地临时备份 |
| `clckCloudReminderSeen` | 首次云端提醒是否显示过 |

### 视频对象示例

```json
{
  "id": "时间戳字符串",
  "url": "https://www.bilibili.com/video/BV...",
  "title": "视频标题",
  "tags": ["3D动画", "参考"],
  "cover": "https://i*.hdslb.com/bfs/archive/*.jpg@320w_180h.jpg",
  "bvid": "BV...",
  "createdAt": "ISO 8601 时间"
}
```

### 本地导出结构

```json
{
  "videos": [],
  "tags": [],
  "exportTime": "ISO 8601 时间"
}
```

---

## 6. B站封面方案

### 当前方案

1. 从 B站 URL 中正则提取 BV 号：`BV[a-zA-Z0-9]+`
2. 浏览器通过 JSONP 请求：

```text
https://api.bilibili.com/x/web-interface/view?bvid=...&jsonp=jsonp&callback=...
```

3. 从 `data.pic` 读取 B站封面 URL
4. 统一转为 HTTPS，并追加 `@320w_180h.jpg`
5. 将封面 URL 保存在视频对象的 `cover` 字段
6. 显示时经过：

```text
https://images.weserv.nl/?url=编码后的封面地址
```

7. 封面加载失败时，会尝试重新解析并更新 localStorage；仍失败则显示内置占位图

### 历史方案及结论

曾尝试由 Cloudflare Worker 服务端调用 B站 API 并代理缓存封面，但 B站会拒绝部分 Cloudflare 数据中心出口，线上接口返回 502，因此已撤销。当前采用旧项目验证过的“浏览器 JSONP + weserv 图片代理”方案。

### 已知依赖风险

- B站 JSONP API 可能调整或限制访问
- `images.weserv.nl` 是外部服务，国内访问速度和长期可用性不完全受控
- 本项目只保存封面 URL，不保存封面图片文件

---

## 7. Cloudflare D1 云备份设计

### 绑定配置

`wrangler.jsonc` 中的 D1 绑定：

```json
{
  "binding": "DB",
  "database_name": "clshujuk",
  "database_id": "4c47ba25-7d77-426c-91f1-737c0e7a5638"
}
```

Worker 通过 `env.DB` 访问数据库。

### 数据表

Worker 在第一次合法访问时自动创建：

```sql
CREATE TABLE IF NOT EXISTS cloud_backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL,
  data_hash TEXT NOT NULL,
  video_count INTEGER NOT NULL DEFAULT 0,
  tag_count INTEGER NOT NULL DEFAULT 0,
  device_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

索引：

```sql
CREATE INDEX IF NOT EXISTS idx_cloud_backups_created_at
ON cloud_backups(created_at DESC);
```

### 版本策略

- 每次上传不同数据新增一行
- 最多保留最近 30 份
- 超过 30 份后自动删除最旧版本
- 使用 SHA-256 摘要判断是否与最新版本重复
- 单次上传最大 2MB
- 云端只保存 JSON 和封面 URL，不保存图片

### 云端 API

统一入口：

```text
/api/cloud-data
```

#### 上传新版本

```http
PUT /api/cloud-data
Authorization: Bearer <管理员密码>
Content-Type: application/json
```

请求体：

```json
{
  "data": {
    "videos": [],
    "tags": []
  },
  "deviceName": "Windows · 电脑"
}
```

#### 获取版本列表

```http
GET /api/cloud-data?action=list
Authorization: Bearer <管理员密码>
```

#### 加载指定版本

```http
GET /api/cloud-data?id=<版本ID>
Authorization: Bearer <管理员密码>
```

不传 `id` 时返回最新版本。

---

## 8. 安全设计

### 管理员密码

Cloudflare 运行时必须配置：

```text
ADMIN_PASSWORD
```

要求：

- 放在 Worker 运行时“变量和机密”中
- 应点击“加密”，保存为 Secret/机密
- 不应写入 GitHub 仓库
- 不应通过聊天、截图或 URL 公开
- 不要误放到仅构建期可见的“构建环境变量”

前端每次上传或加载时临时询问密码，不把密码保存到 localStorage。

Worker 使用固定时间比较方式验证密码，并区分：

- 未配置 `ADMIN_PASSWORD`：HTTP 503
- 密码错误：HTTP 401
- 服务内部错误：HTTP 500

### 已发生的凭据事件

项目搭建过程中曾有 GitHub Token、Cloudflare API Token 和 R2 S3 密钥被直接发送到聊天。此类凭据应视为已暴露并立即撤销重建。项目代码和本文档不记录其具体值。

D1 同步功能不需要 R2 访问密钥。

---

## 9. 部署与运维

### 自动部署

Cloudflare 已连接：

```text
Git 仓库：CNMJH/CLCK
生产分支：main
```

向 `main` 推送后，Cloudflare 自动构建和部署。当前配置显示：

- 构建命令：无
- 部署命令：`npx wrangler deploy`
- 版本命令：`npx wrangler deploy`
- 根目录：`/`

### 部署检查

部署后应验证：

1. 打开 <https://ikik.site>
2. 按 `Ctrl + F5` 强制刷新
3. 检查右上角四个图标
4. 新环境应显示首次加载提醒
5. 使用管理员密码测试上传
6. 在另一浏览器测试版本列表与加载
7. 检查视频封面是否显示

### 常见故障

#### 管理员密码错误

检查：

- 变量名必须准确为 `ADMIN_PASSWORD`
- 必须位于运行时变量和机密，不是构建环境变量
- 前后不要有空格
- 不要把引号作为密码的一部分
- 保存后必要时重新部署

#### 云端服务暂时不可用

检查：

- `wrangler.jsonc` 中是否有 `DB` 绑定
- 数据库名称和 ID 是否正确
- Cloudflare 部署是否使用最新提交
- D1 是否可用

#### 封面无法加载

可能原因：

- B站 JSONP API 访问失败
- BV 号无效
- weserv 图片代理不可用
- B站原始封面已失效

#### workers.dev 无法访问

中国大陆部分网络会污染或阻断 `workers.dev`。项目已绑定自定义域名 `ikik.site`，正式访问应使用该地址。

---

## 10. Git 提交历史

| 提交 | 内容 |
|---|---|
| `e96f8cc` | 添加网站首页 |
| `6065721` | 改用 Worker 代理并缓存 B站封面（后续撤销该封面路径） |
| `3e94614` | 改用旧项目的 B站封面加载方案 |
| `ebea4c4` | 增加 D1 云端多版本备份与跨设备加载 |
| `7b39857` | 区分云端密码未配置与密码错误 |
| `b0ad560` | 调整云端按钮到添加视频同一行（后续再次调整） |
| `5c3d268` | 将云端按钮移到本地导入导出旁 |
| `7686721` | 云端操作按钮仅保留图标 |

---

## 11. 当前使用流程

### 原设备首次上传

1. 打开 <https://ikik.site>
2. 确认本地视频和标签完整
3. 点击右上角“上传云端”图标
4. 输入管理员密码
5. 确认上传
6. 看到“已创建新的云端历史版本”即完成

### 新设备加载

1. 打开网站
2. 在提醒弹窗点击“立即加载云端”
3. 输入管理员密码
4. 从历史列表选择一个版本
5. 确认覆盖本地数据
6. 加载成功后开始使用

### 多设备正确习惯

```text
换设备 → 先加载云端 → 修改数据 → 再上传云端
```

如果两台设备同时修改，最后上传的一台不会删除历史版本，但最新版本会代表最后一次上传内容。需要恢复时，可从版本列表加载较早版本。

---

## 12. 已知限制与后续建议

### 当前限制

- 同步是手动的，不是实时同步
- 管理员密码由多人共享时无法区分操作者
- 本地加载前备份只保存在当前浏览器
- 云端版本只能加载，当前界面不能单独删除某个版本
- 搜索只匹配标题
- 前端使用 CDN 版 Tailwind 与 Font Awesome
- 用户输入通过模板字符串插入部分页面，未来若开放给不可信用户，应做更严格的 HTML 转义

### 建议的后续优化

1. 显示“云端最后上传时间”
2. 上传前提示云端是否比本地更新
3. 增加“恢复加载前本地备份”按钮
4. 增加云端版本备注
5. 增加版本删除功能
6. 增加管理员登录会话，避免每次输入密码
7. 将管理员认证升级为 Cloudflare Access 或一次性会话令牌
8. 将 Tailwind 和 Font Awesome 静态化，减少境外 CDN 依赖
9. 为云端 API 增加速率限制
10. 对用户输入统一做安全转义

---

## 13. 隐私与备份说明

- 网站数据含用户整理的视频标题、标签、B站链接和封面 URL
- 本地数据保存在浏览器中
- 云端备份保存在 Cloudflare D1
- 封面图片本体保存在 B站，并由 weserv 代理显示
- GitHub 仓库是公开仓库，任何写入源代码的内容都会公开
- 不得把密码、Token、Secret 或访问密钥提交到仓库

建议定期同时保留：

- D1 最近 30 个历史版本
- 本地 JSON 导出文件
- GitHub 源码版本

这样可以覆盖数据库误操作、本地浏览器清空和代码回滚三类风险。
