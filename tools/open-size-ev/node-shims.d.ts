// ============================================
// node 全局变量的最小声明
//
// 仓库里没装 @types/node（小程序前端用不到），而这份模拟器要跑在 node 上。
// 与其为一个离线工具引入 @types/node，不如只声明真正用到的那几个全局量：
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
