import type { UserConfigExport } from "@tarojs/cli";

export default {
  mini: {},
  h5: {
    devServer: {
      port: 3000,
      proxy: {
        '/api': {
          target: 'http://localhost:8080',
          changeOrigin: true,
          secure: false,
        },
        '/health': {
          target: 'http://localhost:8080',
          changeOrigin: true,
          secure: false,
        },
        // 牌桌识别服务是另一个进程（~/codes/poker-ocr-poc），不是后端 8080。
        // 走代理是因为它没有 CORS 中间件，浏览器直连 8000 会被同源策略拦掉
        '/ocr': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
        },
        // 认证中心（~/codes/call-auth，:8020）。登录/注册/续期/登出都归它，
        // call-back 已经不再提供这些接口。
        //
        // 注意是 `rewrite` 不是 `pathRewrite`：Taro H5 的 devServer 底层是 Vite，
        // 用的是 Vite 的选项名。写成 http-proxy 那套 `pathRewrite` 不会报错，
        // 只是静默不生效 —— 请求会带着 /authsvc 前缀打到认证中心，然后 404
        '/authsvc': {
          target: 'http://localhost:8020',
          changeOrigin: true,
          secure: false,
          rewrite: (p) => p.replace(/^\/authsvc/, ''),
        }
      }
    }
  }
} satisfies UserConfigExport<'vite'>
