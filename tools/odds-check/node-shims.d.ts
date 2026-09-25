// ============================================
// node 全局变量的最小声明
//
// 仓库里没装 @types/node（小程序前端用不到），而这份对拍脚本要跑在 node 上。
// 与 tools/open-size-ev/node-shims.d.ts 同样的取舍：只声明真正用到的全局量，
// 用到的越少，这份声明越不容易过期
// ============================================

declare const console: {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
};

declare const process: {
  argv: string[];
  exitCode: number | undefined;
};
