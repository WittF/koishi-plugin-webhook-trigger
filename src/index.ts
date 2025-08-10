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
  debug: boolean;
  listeners: Listenners[];
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    defaultPrefix: Schema.boolean().default(true),
    debug: Schema.boolean().default(false).description("启用调试模式，显示详细的处理日志"),
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
  const logger = ctx.logger("webhook");

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
    /**
     * 将文本中的emoji转换为图片标签
     */
    convertEmojiToImages(html: string): string {
      // 使用BootCDN emoji图片 - 国内访问更稳定
      const emojiBaseUrl = 'https://cdn.bootcdn.net/ajax/libs/twemoji/16.0.1/72x72/'
      
      // 使用更完整的Unicode范围匹配emoji
      const emojiRegex = /(?:[\u2600-\u26FF\u2700-\u27BF]|(?:\uD83C[\uDF00-\uDFFF])|(?:\uD83D[\uDC00-\uDE4F])|(?:\uD83D[\uDE80-\uDEFF])|(?:\uD83E[\uDD00-\uDDFF])|(?:\uD83E[\uDE00-\uDEFF])|(?:\uD83C[\uDDE6-\uDDFF])|(?:\uD83C[\uDDF0-\uDDFF])|[\u23E9-\u23F3\u23F8-\u23FA\u2600-\u2604\u260E\u2611\u2614-\u2615\u2618\u261D\u2620\u2622-\u2623\u2626\u262A\u262E-\u262F\u2638-\u263A\u2640\u2642\u2648-\u2653\u2660\u2663\u2665-\u2666\u2668\u267B\u267F\u2692-\u2697\u2699\u269B-\u269C\u26A0-\u26A1\u26AA-\u26AB\u26B0-\u26B1\u26BD-\u26BE\u26C4-\u26C5\u26C8\u26CE-\u26CF\u26D1\u26D3-\u26D4\u26E9-\u26EA\u26F0-\u26F5\u26F7-\u26FA\u26FD\u2702\u2705\u2708-\u270D\u270F\u2712\u2714\u2716\u271D\u2721\u2728\u2733-\u2734\u2744\u2747\u274C\u274E\u2753-\u2755\u2757\u2763-\u2764\u2795-\u2797\u27A1\u27B0\u27BF\u2934-\u2935\u2B05-\u2B07\u2B1B-\u2B1C\u2B50\u2B55\u3030\u303D\u3297\u3299]|(?:\uD83C\uDFF4\uDB40\uDC67\uDB40\uDC62(?:\uDB40\uDC77\uDB40\uDC6C\uDB40\uDC73|\uDB40\uDC73\uDB40\uDC63\uDB40\uDC74|\uDB40\uDC65\uDB40\uDC6E\uDB40\uDC67)\uDB40\uDC7F))/g
      
      let convertedCount = 0
      const result = html.replace(emojiRegex, (match) => {
        try {
          // 将emoji转换为Unicode码点
          const codePoint = this.getEmojiCodePoint(match)
          if (codePoint) {
            convertedCount++
            // 转义特殊字符
            const escapedMatch = match.replace(/["'<>&]/g, (char) => {
              switch (char) {
                case '"': return '&quot;'
                case "'": return '&#39;'
                case '<': return '&lt;'
                case '>': return '&gt;'
                case '&': return '&amp;'
                default: return char
              }
            })
            return `<img class="emoji" src="${emojiBaseUrl}${codePoint}.png" alt="${escapedMatch}" loading="eager" onerror="this.style.display='none'">`
          }
          return match
        } catch (error) {
          if (config.debug) {
            logger.debug(`无法转换emoji: ${match}`, error)
          }
          return match
        }
      })
      
      if (config.debug && convertedCount > 0) {
        logger.info(`🖼️ 转换了${convertedCount}个emoji为CDN图片`)
      }
      
      return result
    },

    /**
     * 获取emoji的Unicode码点
     */
    getEmojiCodePoint(emoji: string): string | null {
      try {
        const codePoints = []
        let i = 0
        
        while (i < emoji.length) {
          const code = emoji.codePointAt(i)
          if (code) {
            // 过滤掉变体选择器（U+FE0F）和其他修饰符
            if (code !== 0xFE0F && code !== 0x200D) {
              codePoints.push(code.toString(16))
            }
            
            // 如果是代理对，跳过下一个字符
            if (code > 0xFFFF) {
              i += 2
            } else {
              i += 1
            }
          } else {
            i += 1
          }
        }
        
        // 对于某些特殊emoji，可能需要特殊处理
        let result = codePoints.join('-')
        
        // 处理一些特殊情况，如带有肤色修饰符的emoji
        if (result.includes('1f3fb') || result.includes('1f3fc') || result.includes('1f3fd') || result.includes('1f3fe') || result.includes('1f3ff')) {
          // 对于带有肤色修饰符的emoji，保留第一个码点
          result = codePoints[0]
        }
        
        return result.length > 0 ? result : null
      } catch (error) {
        if (config.debug) {
          logger.debug(`获取emoji码点失败: ${emoji}`, error)
        }
        return null
      }
    },

    async convertTextToImage(content: string): Promise<string> {
      if (config.debug) {
        logger.info(`开始转换文本为图片，内容: "${content}"`);
      }
      
      // 检查是否有 puppeteer 服务
      const puppeteer = (ctx as any).puppeteer;
      if (!puppeteer) {
        logger.error('Puppeteer 服务未启用，无法使用文本转图片功能');
        return '';
      }
      
      if (config.debug) {
        logger.info('Puppeteer 服务已找到，开始渲染...');
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
              
              /* Emoji图片样式 */
              .emoji {
                display: inline-block;
                width: 1.2em;
                height: 1.2em;
                vertical-align: -0.125em;
                margin: 0 0.05em;
                object-fit: contain;
              }
              
              /* 确保emoji文本有正确的字体回退 */
              .emoji-text {
                font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Twemoji Mozilla', 'Noto Color Emoji', 'Android Emoji', 'EmojiOne Color', 'EmojiOne', 'Symbola', 'Noto Emoji', 'Noto Sans Emoji', 'NotoColorEmoji', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft Yahei', sans-serif;
              }
            </style>
          </head>
          <body>
            <div class="content">${(() => {
              // 先进行基础的HTML转义（不影响emoji）
              let processedContent = content
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
              
              // 转换emoji为图片标签
              processedContent = textToImageService.convertEmojiToImages(processedContent);
              
              // 最后处理换行符
              return processedContent.replace(/\n/g, '<br>');
            })()}</div>
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
          
          // 等待emoji图片加载完成
          if (config.debug) {
            logger.info('等待emoji图片加载完成...');
          }
          
          await page.evaluate(() => {
            return new Promise((resolve) => {
              const emojiImages = document.querySelectorAll('img.emoji')
              let loadedCount = 0
              const totalImages = emojiImages.length
              
              if (totalImages === 0) {
                console.log('没有找到emoji图片')
                resolve(undefined)
                return
              }
              
              console.log(`找到${totalImages}个emoji图片，开始加载`)
              
              const checkAllLoaded = () => {
                loadedCount++
                console.log(`emoji图片加载进度: ${loadedCount}/${totalImages}`)
                
                if (loadedCount >= totalImages) {
                  console.log('✅ 所有emoji图片加载完成')
                  resolve(undefined)
                }
              }
              
              emojiImages.forEach((img) => {
                const image = img as HTMLImageElement
                if (image.complete) {
                  checkAllLoaded()
                } else {
                  image.onload = checkAllLoaded
                  image.onerror = () => {
                    console.log(`⚠️ emoji图片加载失败: ${image.src}`)
                    checkAllLoaded()
                  }
                }
              })
              
              // 设置超时，避免无限等待
              setTimeout(() => {
                if (loadedCount < totalImages) {
                  console.log(`⏰ emoji图片加载超时，已加载${loadedCount}/${totalImages}`)
                }
                resolve(undefined)
              }, 5000)
            })
          });
          
          if (config.debug) {
            logger.info('emoji图片加载完成');
          }
          
          // 额外等待确保渲染完成
          await new Promise(resolve => setTimeout(resolve, 300));
          
          const element = await page.$('.content');
          if (!element) {
            throw new Error('找不到内容元素');
          }
          
          // 获取元素边界框
          const boundingBox = await element.boundingBox();
          if (!boundingBox) {
            throw new Error('无法获取内容区域尺寸');
          }
          
          // 截取页面截图，而不是元素截图
          const screenshot = await page.screenshot({
            type: 'png',
            clip: {
              x: Math.max(0, boundingBox.x - 20),
              y: Math.max(0, boundingBox.y - 20),
              width: boundingBox.width + 40,
              height: boundingBox.height + 40
            }
          });
          
          if (config.debug) {
            logger.info('文本转图片截图成功');
          }
          return screenshot;
        } catch (renderError) {
          logger.error('页面渲染失败:', renderError);
          throw renderError;
        }
      });

        // 将 Buffer/Uint8Array 转换为 base64 字符串
        const imageData = Buffer.isBuffer(imageBuffer) ? imageBuffer : Buffer.from(imageBuffer);
        const base64 = imageData.toString('base64');
        if (config.debug) {
          logger.info(`生成图片 base64 长度: ${base64.length}`);
        }
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

    if (config.debug) {
      logger.info(`解析富文本消息: "${message}"`);
    }
    const elements: Element[] = [];
    
    // 🔧 优化分割逻辑，处理特殊标记
    const regex = /<(image|at|text2img):([^>]+)>/g;
    let lastIndex = 0;
    let match;
    
    // 检查是否包含富文本标记
    const hasRichContent = regex.test(message);
    regex.lastIndex = 0; // 重置正则表达式
    if (config.debug) {
      logger.info(`富文本标记检测结果: ${hasRichContent}`);
    }
    
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
              if (config.debug) {
                logger.info(`正在将文本转换为图片: "${textContent}"`);
              }
              const imageUrl = await textToImageService.convertTextToImage(textContent);
              if (imageUrl) {
                if (config.debug) {
                  logger.info('文本转图片成功，图片URL长度:', imageUrl.length);
                }
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
        if (config.debug) {
          logger.info("接收到的数据:", data);
        }
        const template = Handlebars.compile(t);
        const result = template(data);
        if (config.debug) {
          logger.info("模板渲染结果:", result);
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
