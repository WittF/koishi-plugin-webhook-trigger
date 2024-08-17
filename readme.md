# @wahaha216/koishi-plugin-webhook-trigger

[![npm](https://img.shields.io/npm/v/@wahaha216/koishi-plugin-webhook-trigger?style=flat-square)](https://www.npmjs.com/package/@wahaha216/koishi-plugin-webhook-trigger)

处理webhook请求，并使用[handlebars](https://handlebarsjs.com/guide/)格式化

插件已扩展一个用法 `if_equals` ，判断某个键的值是否与指定值相等，使用示例：

接收的数据
```json
{
  "test": "test",
  "a": "aaaaaaaa",
  "type": "add",
  "b": "bbbbbb"
}
```
格式化消息体
```tex
这是测试消息，{{ test }}
{{#if_equals type 'add'}}
{{a}}
{{else}}
{{b}}
{{/if_equals}}
```
结果
```tex
这是测试消息，test
aaaaaaaa
```