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
        }
      }
    }
  }
} satisfies UserConfigExport<'vite'>
