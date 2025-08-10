import { Context, Schema, h, Element } from "koishi";
import {} from "@koishijs/plugin-server";
import Handlebars from "handlebars";

export const name = "webhook-trigger";

export const inject = {
  required: ["server", "logger"],
  optional: ["puppeteer"],  // 可选：用于文本转图片功能
};

interface Listenners {
  url: string;
  method: "get" | "post";
  headers: Record<string, string>;
  pushChannelIds: string[];
  pushPrivateIds: string[];
  msg: string;
}
export interface Config {
  defaultPrefix: boolean;
  printData: boolean;
  printResult: boolean;
  listeners: Listenners[];
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    defaultPrefix: Schema.boolean().default(true),
    printData: Schema.boolean().default(false),
    printResult: Schema.boolean().default(false),
  }),
  Schema.object({
    listeners: Schema.array(
      Schema.object({
        url: Schema.string().required(),
        method: Schema.union(["get", "post"]).default("post"),
        headers: Schema.dict(Schema.string()).role("table").default({}),
        pushChannelIds: Schema.array(String),
        pushPrivateIds: Schema.array(String),
        msg: Schema.string().role("textarea"),
      })
    ),
  }),
]).i18n({
  "zh-CN": require("./locales/zh-CN")._config,
  "en-US": require("./locales/en-US")._config,
});

export async function apply(ctx: Context, config: Config) {
  // write your plugin here
  const logger = ctx.logger("wahaha216-webhook");

  logger.info("Register Handlebars Helper: if_equals");
  Handlebars.registerHelper("if_equals", function (this: any, p: any, q: any, options: any) {
    return p === q ? options.fn(this) : options.inverse(this);
  });

  logger.info("Register Handlebars Helper: if_not_equals");
  Handlebars.registerHelper("if_not_equals", function (this: any, p: any, q: any, options: any) {
    return p !== q ? options.fn(this) : options.inverse(this);
  });

  logger.info("Register Handlebars Helper: if_exist");
  Handlebars.registerHelper("if_exist", function (this: any, p: string, options: any) {
    return (this as Object).hasOwnProperty(p)
      ? options.fn(this)
      : options.inverse(this);
  });

  // 🚀 图片消息
  logger.info("Register Handlebars Helper: image");
  Handlebars.registerHelper("image", function (url: string) {
    if (!url) return "";
    return `<image:${url}>`;
  });

  // 🚀 AT消息
  logger.info("Register Handlebars Helper: at");
  Handlebars.registerHelper("at", function (userId: string) {
    if (!userId) return "";
    return `<at:${userId}>`;
  });

  // 🚀 多个AT
  logger.info("Register Handlebars Helper: at_users");
  Handlebars.registerHelper("at_users", function (userIds: string | string[]) {
    if (!userIds) return "";
    const users = Array.isArray(userIds) ? userIds : [userIds];
    return users.map(id => `<at:${id}>`).join("");
  });

  // 🚀 文本转图片
  logger.info("Register Handlebars Helper: text_to_image");
  Handlebars.registerHelper("text_to_image", function (this: any, content: string, options: any) {
    if (!content) return "";
    
    // ⚠️ 检测不支持的嵌套情况（富文本 helper）
    if (/\{\{\s*(image|text_to_image|at|at_users)\s+/.test(content)) {
      logger.warn("text_to_image 不支持嵌套富文本 helper (image/text_to_image/at/at_users)");
      const warningContent = "⚠️ 不支持的嵌套语法\n请将富文本元素与 text_to_image 分开使用";
      return `<text2img:${Buffer.from(warningContent).toString('base64')}>`;
    }
    
    // 🔧 先渲染内部的 Handlebars 语法（基础变量和条件）
    try {
      const innerTemplate = Handlebars.compile(content);
      // 🎯 使用正确的数据上下文
      const context = options?.data?.root || this;
      const renderedContent = innerTemplate(context);
      
      // 🛡️ 二次检查：确保渲染后没有出现富文本标记
      if (renderedContent.includes('<image:') || renderedContent.includes('<text2img:') || renderedContent.includes('<at:')) {
        logger.warn("text_to_image 内容包含富文本标记，可能存在不当嵌套");
        const cleanContent = renderedContent.replace(/<(image|text2img|at):[^>]+>/g, '[不支持的嵌套元素]');
        return `<text2img:${Buffer.from(cleanContent).toString('base64')}>`;
      }
      
      // 📏 内容长度检查
      if (renderedContent.length > 5000) {
        logger.warn("text_to_image 内容过长，可能影响渲染性能");
        const truncatedContent = renderedContent.substring(0, 5000) + "\n...[内容过长已截断]";
        return `<text2img:${Buffer.from(truncatedContent).toString('base64')}>`;
      }
      
      return `<text2img:${Buffer.from(renderedContent).toString('base64')}>`;
    } catch (error) {
      // 如果内部模板解析失败，使用原始内容
      logger.error("text_to_image 内部模板解析失败:", error);
      const errorContent = `❌ 模板解析错误\n原始内容：${content}`;
      return `<text2img:${Buffer.from(errorContent).toString('base64')}>`;
    }
  });

  // 🚀 文本转图片服务
  const textToImageService = {
    async convertTextToImage(content: string): Promise<string> {
      // 检查是否有 puppeteer 服务
      const puppeteer = (ctx as any).puppeteer;
      if (!puppeteer) {
        logger.warn('Puppeteer 服务未启用，无法使用文本转图片功能');
        return '';
      }

      try {
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'Noto Sans', sans-serif, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei';
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                margin: 0;
                padding: 40px;
                min-height: 200px;
                display: flex;
                align-items: center;
                justify-content: center;
              }
              .content {
                background: white;
                padding: 30px;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.1);
                max-width: 800px;
                font-size: 16px;
                line-height: 1.6;
                color: #333;
                white-space: pre-wrap;
                word-wrap: break-word;
              }
            </style>
          </head>
          <body>
            <div class="content">${content
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;')
              .replace(/\n/g, '<br>')
            }</div>
          </body>
          </html>
        `;

              const imageBuffer = await puppeteer.render(html, async (page: any, next: any) => {
        try {
          // 🎯 设置页面视口和超时
          await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 2 });
          
          // ⏰ 设置超时时间
          page.setDefaultTimeout(10000); // 10秒超时
          
          // 等待内容加载
          await page.waitForSelector('.content', { timeout: 5000 });
          
          // 等待字体加载（如果有的话）
          await page.evaluate(() => {
            return document.fonts ? document.fonts.ready : Promise.resolve();
          });
          
          // 额外等待确保渲染完成
          await new Promise(resolve => setTimeout(resolve, 300));
          
          const element = await page.$('.content');
          if (!element) {
            throw new Error('找不到内容元素');
          }
          
          const screenshot = await element.screenshot({ 
            type: 'png',
            omitBackground: false,
            captureBeyondViewport: true 
          });
          
          logger.info('文本转图片截图成功');
          return screenshot;
        } catch (renderError) {
          logger.error('页面渲染失败:', renderError);
          throw renderError;
        }
      });

        // 这里应该将图片上传到图床，返回URL
        // 为了简化，我们返回 base64 data URL
        const base64 = imageBuffer.toString('base64');
        return `data:image/png;base64,${base64}`;
      } catch (error) {
        logger.error('文本转图片失败:', error);
        return '';
      }
    }
  };

  // 🚀 解析富文本消息标记为 Element 数组
  const parseRichMessage = async (message: string): Promise<Element[]> => {
    if (!message) return [];

    const elements: Element[] = [];
    
    // 🔧 优化分割逻辑，处理特殊标记
    const regex = /<(image|at|text2img):([^>]+)>/g;
    let lastIndex = 0;
    let match;
    
    while ((match = regex.exec(message)) !== null) {
      // 添加标记前的文本
      const beforeText = message.substring(lastIndex, match.index);
      if (beforeText.trim()) {
        elements.push(h.text(beforeText));
      }
      
      const [fullMatch, type, content] = match;
      
      try {
        switch (type) {
          case 'image':
            // 🖼️ 处理图片
            if (content && (content.startsWith('http://') || content.startsWith('https://') || content.startsWith('data:image/'))) {
              elements.push(h.image(content));
            } else {
              logger.warn(`无效的图片URL: ${content}`);
              elements.push(h.text(`[无效图片: ${content}]`));
            }
            break;
            
          case 'at':
            // 👥 处理AT
            if (content && /^\d+$/.test(content)) {
              elements.push(h.at(content));
            } else {
              logger.warn(`无效的用户ID: ${content}`);
              elements.push(h.text(`@${content}`));
            }
            break;
            
          case 'text2img':
            // 🎨 处理文本转图片
            try {
              const textContent = Buffer.from(content, 'base64').toString('utf8');
              logger.info(`正在将文本转换为图片: "${textContent}"`);
              const imageUrl = await textToImageService.convertTextToImage(textContent);
              if (imageUrl) {
                logger.info('文本转图片成功，图片URL长度:', imageUrl.length);
                elements.push(h.image(imageUrl));
              } else {
                logger.warn('文本转图片失败，回退到文本显示');
                // 如果转图片失败，回退到文本
                elements.push(h.text(textContent));
              }
            } catch (decodeError) {
              logger.error('解析文本转图片内容失败:', decodeError);
              elements.push(h.text('[文本转图片解析失败]'));
            }
            break;
            
          default:
            logger.warn(`未知的富文本类型: ${type}`);
            elements.push(h.text(fullMatch));
        }
      } catch (error) {
        logger.error(`处理富文本元素失败 [${type}]:`, error);
        elements.push(h.text(`[${type}处理失败]`));
      }
      
      lastIndex = regex.lastIndex;
    }
    
    // 添加最后剩余的文本
    const remainingText = message.substring(lastIndex);
    if (remainingText.trim()) {
      elements.push(h.text(remainingText));
    }
    
    return elements.length > 0 ? elements : [h.text(message)];
  };

  const pushMsg = async (type: "get" | "post", ls: Listenners, t: string) => {
    const prefix = config.defaultPrefix ? `/webhook` : "";
    const url = ls.url.startsWith("/") ? ls.url : `/${ls.url}`;
    const fullUrl = `${prefix}${url}`;
    ctx.server[type](
      fullUrl,
      (content, next) => {
        for (let httpheader in ls.headers) {
          // 检查头，如果不相等则返回400
          if (content.header[httpheader] != ls.headers[httpheader]) {
            content.status = 400;
            content.body = "header not match";
            return;
          }
        }
        next();
      },
      async (content) => {
        let data =
          type === "get" ? content.request.query : content.request.body;
        logger.info(`${type}: ${fullUrl}, incoming data type: ${typeof data}`);
        if (typeof data === "string") {
          try {
            data = JSON.parse(data);
          } catch (error) {
            logger.error(error);
          }
        }
        if (config.printData) {
          logger.info(data);
        }
        const template = Handlebars.compile(t);
        const result = template(data);
        if (config.printResult) {
          logger.info(result);
        }
        if (result.length) {
          // 🚀 富文本消息（默认启用）
          const elements = await parseRichMessage(result);
          for (const bot of ctx.bots) {
            for (const channelId of ls.pushChannelIds) {
              await bot.sendMessage(channelId, elements);
            }
            for (const privateId of ls.pushPrivateIds) {
              await bot.sendPrivateMessage(privateId, elements);
            }
          }
        }
        content.status = 200;
        content.body = "ok";
      }
    );
  };

  for (const ls of config.listeners) {
    await pushMsg(ls.method, ls, ls.msg);
  }
}
