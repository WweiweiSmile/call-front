import { defineConfig, type UserConfigExport } from '@tarojs/cli'
import connectHistoryApiFallback from 'connect-history-api-fallback'
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin'
import devConfig from './dev'
import testConfig from './test'
import prodConfig from './prod'
import vitePluginImp from 'vite-plugin-imp'

// h5 路由模式。抽成常量是因为下面 vite 插件里也要读它 —— 插件里的闭包拿不到
// baseConfig，直接写 h5.router.mode 会是一个未定义变量
const H5_ROUTER_MODE = 'browser'

// https://taro-docs.jd.com/docs/next/config#defineconfig-辅助函数
export default defineConfig<'vite'>(async (merge, { command, mode }) => {
  const baseConfig: UserConfigExport<'vite'> = {
    projectName: 'call',
    date: '2026-3-7',
    designWidth: 375,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      375: 2,
      828: 1.81 / 2
    },
    sourceRoot: 'src',
    outputRoot: 'dist',
    plugins: ['@tarojs/plugin-html'],
    defineConstants: {
    },
    copy: {
      patterns: [
      ],
      options: {
      }
    },
    framework: 'react',
    compiler: {
      vitePlugins: [
        vitePluginImp({
          libList: [
            {
              libName: '@nutui/nutui-react-taro',
              style: (name) => {
                return `@nutui/nutui-react-taro/dist/esm/${name}/style/css`
              },
              replaceOldImport: false,
              camel2DashComponentName: false,
            }
          ]
        }),
        // dev server 的 SPA 回落：把 `/pages/xxx/index` 这类**页面路由**当文档处理，
        // 改写成 /index.html，交给前端路由自己决定渲染哪一页。
        //
        // 为什么非加不可：Taro 把 Vite 的 root 设成了 src（见 h5/config.js 的
        // `root: sourceDir`），于是 `/pages/games/index` 在 dev server 眼里就是
        // `src/pages/games/index.tsx` 这个**真实模块**。Vite 自带的 SPA 回落
        // （htmlFallbackMiddleware）排在 transformMiddleware 后面，等它轮到的时候
        // 模块早就被解析成 JS 返回了 —— 表现为「直接访问 / 刷新深链接，页面白屏，
        // 浏览器把一段 JS 当 HTML 啃」。SSO 回调正好就是深链接（
        // `/pages/games/index?ticket=..`），所以这不是边角情况。
        //
        // configureServer 里**直接**调 middlewares.use 注册的是 pre 中间件，排在
        // Vite 内部那串之前，才能抢在 transformMiddleware 前面改写。
        //
        // htmlAcceptHeaders 只留 text/html：connect-history-api-fallback 默认
        // 还认 `*/*`，那会把模块请求（`/@vite/client`、`/@react-refresh` 这些浏览器
        // 是以 `*/*` 拉的）一并改写成 index.html，整个应用直接起不来。
        // 另外不设 disableDotRule，保留「带点不回落」的默认行为 —— 页面模块是按
        // `/pages/xxx/index.tsx`（带扩展名）动态 import 的，少这条规则，
        // 客户端跳转会被回落的 HTML 顶掉。
        {
          name: 'configure-server',
          configureServer(server) {
            if (process.env.TARO_ENV === 'h5' && H5_ROUTER_MODE === 'browser') {
              server.middlewares.use(
                connectHistoryApiFallback({
                  htmlAcceptHeaders: ['text/html', 'application/xhtml+xml'],
                })
              )
            }
          },
        },
      ],
      type: 'vite'
    },
    mini: {
      postcss: {
        pxtransform: {
          enable: true,
          config: {
            selectorBlackList: ['nut-']
          }
        },
        cssModules: {
          enable: false, // 默认为 false，如需使用 css modules 功能，则设为 true
          config: {
            namingPattern: 'module', // 转换模式，取值为 global/module
            generateScopedName: '[name]__[local]___[hash:base64:5]'
          }
        }
      },
    },
    h5: {
      publicPath: '/',
      staticDirectory: 'static',

      // history 模式（Taro 默认是 hash）。改这个是为了让 SSO 的回调地址不带 `#`：
      // 认证中心把 ticket 拼在真正的 query 上（`/pages/book/index?ticket=..`），
      // 而不是拼进 fragment（`#/pages/book/index?ticket=..`）。
      //
      // ⚠️ **部署必须配合**：history 模式下 `/pages/book/index` 是真实路径，
      // nginx 要加 `try_files $uri $uri/ /index.html;` 回落到 index.html，
      // 否则刷新/直达会被 nginx 直接 404。publicPath 已经是 '/'，这是前提。
      // dev server 那一侧的回落见上面 compiler.vitePlugins 里的 configure-server
      router: {
        mode: H5_ROUTER_MODE,
      },

      miniCssExtractPluginOption: {
        ignoreOrder: true,
        filename: 'css/[name].[hash].css',
        chunkFilename: 'css/[name].[chunkhash].css'
      },
      postcss: {
        autoprefixer: {
          enable: true,
          config: {}
        },
        cssModules: {
          enable: false, // 默认为 false，如需使用 css modules 功能，则设为 true
          config: {
            namingPattern: 'module', // 转换模式，取值为 global/module
            generateScopedName: '[name]__[local]___[hash:base64:5]'
          }
        }
      },
    },
    rn: {
      appName: 'taroDemo',
      postcss: {
        cssModules: {
          enable: false, // 默认为 false，如需使用 css modules 功能，则设为 true
        }
      }
    }
  }
  
  // 根据环境选择配置
  if (process.env.NODE_ENV === 'development') {
    // 本地开发构建配置（不混淆压缩）
    return merge({}, baseConfig, devConfig)
  } else if (process.env.NODE_ENV === 'test') {
    // 测试环境构建配置
    return merge({}, baseConfig, testConfig)
  }
  // 生产构建配置（默认开启压缩混淆等）
  return merge({}, baseConfig, prodConfig)
})
