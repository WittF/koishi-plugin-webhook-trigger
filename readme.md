# 🚀 Koishi Webhook Trigger 插件

[![npm](https://img.shields.io/npm/v/koishi-plugin-webhook-trigger?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-webhook-trigger)

强大的 Webhook 处理插件，支持 [Handlebars](https://handlebarsjs.com/guide/) 模板语法和富文本消息（图片、AT、文本转图片等）。

## 📑 目录

- [✨ 主要功能](#-主要功能)
- [📦 安装](#-安装)
- [🧠 核心概念](#-核心概念)
- [🚀 快速开始](#-快速开始)
- [📖 模板语法指南](#-模板语法指南)
- [🎨 富文本消息](#-富文本消息)
- [📋 完整配置示例](#-完整配置示例)
- [🛠️ 高级功能](#️-高级功能)
- [❓ 常见问题](#-常见问题)

## ✨ 主要功能

- 🌐 **Webhook 接收** - 支持 GET/POST 请求，自定义 URL 和请求头验证
- 📝 **模板渲染** - 使用 Handlebars 语法处理动态内容
- 🎨 **富文本消息** - 发送图片、AT 用户、文本转图片
- 🔀 **条件判断** - 支持复杂的逻辑分支
- 📱 **多平台推送** - 同时推送到多个群组和私聊

## 📦 安装

```bash
npm install koishi-plugin-webhook-trigger
```

**可选依赖**（文本转图片功能）：
```bash
npm install @koishijs/plugin-puppeteer
```

## 🧠 核心概念

### 工作流程
1. **外部系统** → 发送HTTP请求到 `/webhook/your-url`
2. **插件接收** → 验证请求头，解析JSON数据
3. **模板处理** → 使用 Handlebars 语法替换变量
4. **消息发送** → 推送到指定群组/私聊

### 消息类型

本插件默认支持富文本消息，包括：
- 📝 **基础文本** - 普通文本消息
- 🖼️ **图片消息** - `{{image url}}`
- 👥 **AT消息** - `{{at user_id}}`
- 🎨 **文本转图片** - `{{text_to_image "text"}}`

### 支持功能

| 功能 | 语法 | 示例 |
|------|------|------|
| 基础文本 | `{{变量名}}` | `{{message}}` |
| 条件判断 | `{{#if_equals}}` | `{{#if_equals level "error"}}` |
| 发送图片 | `{{image url}}` | `{{image screenshot_url}}` |
| AT用户 | `{{at user_id}}` | `{{at "123456789"}}` |
| 文本转图片 | `{{text_to_image "内容"}}` | `{{text_to_image error_details}}` |
| **嵌套语法** | `{{text_to_image "{{变量}}"}}` | `{{text_to_image "状态：{{status}}"}}` |

## 🚀 快速开始

### 基础配置示例

```yaml
# koishi.yml
plugins:
  webhook-trigger:
    listeners:
      - url: "/alert"                    # webhook地址: /webhook/alert
        method: "post"                   # 请求方法

        pushChannelIds: ["123456789"]    # 推送到的群组ID
        pushPrivateIds: ["987654321"]    # 推送到的私聊ID
        msg: "收到告警: {{message}}"      # 消息模板
```

访问地址：`http://你的机器人地址/webhook/alert`

### 发送测试请求

```bash
curl -X POST http://localhost:5140/webhook/alert \
  -H "Content-Type: application/json" \
  -d '{"message": "数据库连接失败", "level": "critical"}'
```

## 📖 模板语法指南

### 1. 基础变量替换

**接收数据**：
```json
{
  "user": "张三",
  "action": "登录",
  "time": "2024-01-15 10:30:00"
}
```

**模板**：
```handlebars
用户 {{user}} 于 {{time}} 执行了 {{action}} 操作
```

**输出**：
```
用户 张三 于 2024-01-15 10:30:00 执行了 登录 操作
```

### 2. 条件判断

#### if_equals - 值相等判断
```handlebars
{{#if_equals level "critical"}}
🔴 严重告警：{{message}}
{{else if_equals level "warning"}}
🟡 警告：{{message}}
{{else}}
ℹ️ 普通信息：{{message}}
{{/if_equals}}
```

#### if_not_equals - 值不等判断
```handlebars
{{#if_not_equals status "success"}}
❌ 操作失败：{{error}}
{{else}}
✅ 操作成功
{{/if_not_equals}}
```

#### if_exist - 字段存在判断
```handlebars
{{#if_exist 'screenshot'}}
📷 错误截图：{{screenshot}}
{{/if_exist}}
```

## 🎨 富文本消息

### 富文本消息用法

插件默认支持富文本消息，无需额外配置：

```yaml
listeners:
  - url: "/rich"
    msg: |
      {{image image_url}}
      {{at user_id}}
```

### 发送图片

**方式一 - 变量方式**：
```handlebars
{{image screenshot_url}}
```

**方式二 - 直接URL**：
```handlebars
{{image "https://example.com/pic.jpg"}}
```

### AT用户

**AT单个用户**：
```handlebars
{{at "123456789"}} 请查看
{{at user_id}} 任务完成
```

**AT多个用户**：
```handlebars
{{at_users ["123456789", "987654321"]}}
{{at_users admin_list}}
```

### 文本转图片 🆕

将长文本、日志、报表等转换为美观的图片：

```handlebars
{{text_to_image "这段文字会被渲染成图片
支持换行
支持中文
样式美观"}}
```

**动态内容**：
```handlebars
{{text_to_image error_details}}
```

**嵌套语法支持** 🆕：
```handlebars
{{text_to_image "服务器状态：{{#if_equals status 'online'}}✅ 正常{{else}}❌ 异常{{/if_equals}}
主机名：{{hostname}}
时间：{{timestamp}}"}}
```

> 💡 **支持的嵌套**：`text_to_image` 支持嵌套基础变量和条件语法（`{{variable}}`、`{{#if_equals}}`）

> ⚠️ **不支持的嵌套**：`text_to_image` 内部不能再嵌套 `{{image}}` 或 `{{text_to_image}}`，会显示错误提示

## 📋 完整配置示例

### 服务器监控告警（图片模式）

这个例子展示如何将监控告警信息渲染成图片发送：

**监控系统发送的数据**：
```json
{
  "level": "critical",
  "message": "数据库连接失败",
  "timestamp": "2024-01-15 10:30:00",
  "hostname": "db-server-01",
  "error_code": "1045",
  "response_time": "超时",
  "affected_services": ["用户系统", "订单系统"],
  "admin_list": ["admin1", "admin2"]
}
```

**完整告警转图片配置**：
```yaml
listeners:
  - url: "/server-alert"
    method: "post" 
    pushChannelIds: ["alert-channel"]
    msg: |
      {{text_to_image "🚨 服务器告警
      
      级别：{{#if_equals level 'critical'}}🔴 严重告警{{else}}🟡 普通告警{{/if_equals}}
      内容：{{message}}
      
      📊 详细信息
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      🕒 时间：{{timestamp}}
      🖥️ 主机：{{hostname}}  
      ❌ 错误：{{error_code}}
      ⏱️ 响应：{{response_time}}
      🔧 影响：{{#each affected_services}}{{this}} {{/each}}
      
      请运维团队立即处理！"}}
      
      {{at_users admin_list}} 紧急处理
```

**实际效果**：告警信息会渲染成一张美观的图片，包含渐变背景和清晰的排版。

**配置方式二：分段显示**
```yaml
listeners:
  - url: "/server-alert"
    method: "post"

    pushChannelIds: ["alert-channel"]
    msg: |
      🚨 **服务器告警** {{#if_equals level "critical"}}[严重]{{/if_equals}}
      
      {{text_to_image "故障信息：
      ━━━━━━━━━━━━━━━━━━━━━━
      📋 告警内容：{{message}}
      🕒 发生时间：{{timestamp}}
      🖥️ 故障主机：{{hostname}}
      ❌ 错误代码：{{error_code}}
      ⏱️ 响应时间：{{response_time}}"}}
      
      {{#if_exist 'affected_services'}}
      {{text_to_image "受影响的服务：
      {{#each affected_services}}• {{this}}
      {{/each}}"}}
      {{/if_exist}}
      
      {{at_users admin_list}} 请立即处理

### GitHub推送通知

```yaml
listeners:
  - url: "/github"
    method: "post"

    pushChannelIds: ["dev-channel"]
    msg: |
      🔔 **{{repository.name}}** 代码推送
      
      👤 {{pusher.name}} 推送了 {{commits.length}} 个提交
      
      {{#if_exist 'head_commit.message'}}
      💬 最新提交：{{head_commit.message}}
      {{/if_exist}}
      
      🔗 查看：{{repository.html_url}}

## 🛠️ 高级功能

### 请求头验证

```yaml
listeners:
  - url: "/secure"
    headers:
      Authorization: "Bearer secret-token"
      X-API-Key: "your-api-key"
    msg: "安全的webhook请求：{{data}}"
```

### 多目标推送

```yaml
listeners:
  - url: "/broadcast"
    pushChannelIds: 
      - "group1"
      - "group2"
      - "group3"
    pushPrivateIds:
      - "user1"
      - "user2"
    msg: "广播消息：{{content}}"
```

### 调试模式

```yaml
# 全局设置
defaultPrefix: true      # URL前缀 /webhook
printData: true         # 打印接收数据
printResult: true       # 打印处理结果
```

## ❓ 常见问题

### Q: 图片不显示？
A: 确保图片URL可以公网访问，不能是本地文件路径

### Q: AT功能不工作？
A: 检查用户ID格式，确保是有效的QQ号

### Q: 文本转图片失败？
A: 确保安装了 `@koishijs/plugin-puppeteer` 插件

### Q: text_to_image 中的变量不显示？
A: 确认语法正确：`{{text_to_image "内容：{{variable}}"}}`，插件会先解析内部变量再生成图片

### Q: text_to_image 中嵌套 image 或 text_to_image 不工作？
A: 不支持富文本嵌套！正确做法：
```yaml
# ❌ 错误（不支持）
msg: |
  {{text_to_image "截图：{{image url}}"}}
  {{text_to_image "用户：{{at user_id}}"}}

# ✅ 正确
msg: |
  📊 错误报告
  {{text_to_image "错误详情：{{error_message}}
  时间：{{timestamp}}
  主机：{{hostname}}"}}
  📷 相关截图：
  {{image screenshot_url}}
  {{at admin_user}} 请处理
```

### Q: text_to_image 渲染失败？
A: 检查以下问题：
- 内容长度不要超过5000字符
- 确保内容不包含恶意HTML
- 检查 puppeteer 服务状态
- 查看日志中的具体错误信息

### Q: 如何测试配置？
A: 使用 curl 或 Postman 发送测试请求：
```bash
curl -X POST http://localhost:5140/webhook/test \
  -H "Content-Type: application/json" \
  -d '{"test": "hello world"}'
```

## 🔗 相关链接

- [Handlebars 官方文档](https://handlebarsjs.com/guide/)
- [Koishi 官方文档](https://koishi.chat/)
- [Puppeteer 插件](https://www.npmjs.com/package/@koishijs/plugin-puppeteer)