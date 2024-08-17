import { Context, Schema } from "koishi";
import {} from "@koishijs/plugin-server";
import Handlebars from "handlebars";

export const name = "webhook-trigger";

export const inject = {
  required: ["server", "logger"],
};

interface Listenners {
  url: string;
  method: "get" | "post";
  headers: Record<string, string | null>;
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
        headers: Schema.dict(Schema.string()).role("table"),
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

export function apply(ctx: Context, config: Config) {
  // write your plugin here
  const logger = ctx.logger("wahaha216-webhook");

  logger.info("Register Handlebars Helper: if_equals");
  Handlebars.registerHelper("if_equals", function (p, q, options) {
    return p === q ? options.fn(this) : options.inverse(this);
  });

  logger.info("Register Handlebars Helper: if_not_equals");
  Handlebars.registerHelper("if_not_equals", function (p, q, options) {
    return p !== q ? options.fn(this) : options.inverse(this);
  });

  logger.info("Register Handlebars Helper: if_exist");
  Handlebars.registerHelper("if_exist", function (p, options) {
    return (this as Object).hasOwnProperty(p)
      ? options.fn(this)
      : options.inverse(this);
  });

  for (const ls of config.listeners) {
    const prefix = config.defaultPrefix ? `/webhook` : "";
    const url = ls.url.startsWith("/") ? ls.url : `/${ls.url}`;
    const fullUrl = `${prefix}${url}`;
    if (ls.method === "get") {
      ctx.server.get(
        fullUrl,
        (content, next) => {
          for (let httpheader in ls.headers) {
            // 检查头，如果不相等则返回400
            if (content.header[httpheader] != ls.headers[httpheader])
              return (content.status = 400);
          }
          next();
        },
        async (content) => {
          logger.info(`get: ${fullUrl}`);
          if (config.printData) {
            logger.info(content.request.query);
          }
          const template = Handlebars.compile(ls.msg);
          const result = template(content.request.query);
          if (config.printResult) {
            logger.info(result);
          }
          if (!result.length) return (content.status = 200);
          for (const bot of ctx.bots) {
            for (const channelId of ls.pushChannelIds) {
              await bot.sendMessage(channelId, result);
            }
            for (const privateId of ls.pushPrivateIds) {
              await bot.sendPrivateMessage(privateId, result);
            }
          }
          return (content.status = 200)
        }
      );
    } else {
      ctx.server.post(
        fullUrl,
        (content, next) => {
          for (let httpheader in ls.headers) {
            // 检查头，如果不相等则返回400
            if (content.header[httpheader] != ls.headers[httpheader])
              return (content.status = 400);
          }
          next();
        },
        async (content) => {
          logger.info(`post: ${fullUrl}`);
          if (config.printData) {
            logger.info(content.request.body);
          }
          const template = Handlebars.compile(ls.msg);
          const result = template(content.request.body);
          if (config.printResult) {
            logger.info(result);
          }
          if (!result.length) return (content.status = 200);
          for (const bot of ctx.bots) {
            for (const channelId of ls.pushChannelIds) {
              await bot.sendMessage(channelId, result);
            }
            for (const privateId of ls.pushPrivateIds) {
              await bot.sendPrivateMessage(privateId, result);
            }
          }
          return (content.status = 200);
        }
      );
    }
  }
}
