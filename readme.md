# @wahaha216/koishi-plugin-webhook-trigger

[![npm](https://img.shields.io/npm/v/@wahaha216/koishi-plugin-webhook-trigger?style=flat-square)](https://www.npmjs.com/package/@wahaha216/koishi-plugin-webhook-trigger)

处理 webhook 请求，并使用[handlebars](https://handlebarsjs.com/guide/)格式化

插件已扩展三个用法 `if_equals` 、 `if_not_equals` 、 `if_exist`

### if_equals

判断某个键的值是否与指定值相等，使用示例：

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

### if_not_equals

判断某个键的值是否不等于指定值，与 `if_equals` 用法相同

### if_exist

判断某个键是否存在于传入的数据中
```tex
{{#if_exist 'some_key'}}
...
{{/if_exist}}
```