import { defineConfig, type UserConfigExport } from '@tarojs/cli'
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin'
import devConfig from './dev'
import testConfig from './test'
import prodConfig from './prod'
import vitePluginImp from 'vite-plugin-imp'
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
      vitePlugins: [vitePluginImp({
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
      })],
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
      // 否则刷新/直达会被 nginx 直接 404。publicPath 已经是 '/'，这是前提
      router: {
        mode: 'browser',
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
