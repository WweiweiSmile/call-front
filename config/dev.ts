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
        }
      }
    }
  }
} satisfies UserConfigExport<'vite'>
