# 🚀 Koishi Webhook Trigger 插件

## 📖 功能语法

| 功能 | 语法 | 示例 |
|------|------|------|
| 基础文本 | `{{变量名}}` | `{{message}}` |
| 条件判断 | `{{#if_equals level "error"}}...{{/if_equals}}` | 错误时显示特殊内容 |
| 发送图片 | `{{image url}}` | `{{image screenshot_url}}` |
| AT用户 | `{{at user_id}}` | `{{at "123456789"}}` |
| AT全体 | `{{at_all}}` | `{{at_all}} 重要通知` |
| 文本转图片 | `{{text_to_image "内容"}}` | 长文本转为图片发送 |
