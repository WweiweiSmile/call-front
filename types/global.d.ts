/// <reference types="@tarojs/taro" />

declare module '*.png';
declare module '*.gif';
declare module '*.jpg';
declare module '*.jpeg';
declare module '*.svg';
declare module '*.css';
declare module '*.less';
declare module '*.scss';
declare module '*.sass';
declare module '*.styl';

declare namespace NodeJS {
  interface ProcessEnv {
    /** NODE 内置环境变量, 会影响到最终构建生成产物 */
    NODE_ENV: 'development' | 'production' | 'test',
    /** 当前构建的平台 */
    TARO_ENV: 'weapp' | 'swan' | 'alipay' | 'h5' | 'rn' | 'tt' | 'quickapp' | 'qq' | 'jd'
    /**
     * 当前构建的小程序 appid
     * @description 若不同环境有不同的小程序，可通过在 env 文件中配置环境变量`TARO_APP_ID`来方便快速切换 appid， 而不必手动去修改 dist/project.config.json 文件
     * @see https://taro-docs.jd.com/docs/next/env-mode-config#特殊环境变量-taro_app_id
     */
    TARO_APP_ID: string
    /** 后端地址，见 .env.production */
    TARO_APP_BASE_URL: string
    /** 健康检查地址，见 .env.development / .env.test */
    VITE_API_BASE_URL: string
  }
}

/**
 * 小程序和浏览器里都没有 Node 运行时，代码里的 `process.env.X` 是构建时被 bundler
 * 静态替换成字符串字面量的，运行时并不存在 process 这个对象。
 *
 * 这里只声明 `process.env`，不引入 @types/node——那会把整套 Node 全局（Buffer、
 * setTimeout 的 Node 签名等）塞进小程序代码的类型环境，反而容易掩盖问题。
 */
declare const process: { env: NodeJS.ProcessEnv };
