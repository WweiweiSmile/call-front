import { useEffect } from 'react'
import { bootstrapAuth } from './store/auth'

// ⚠️ 这个文件是 Taro H5 **实际使用的应用入口**，不是 src/app.tsx。
//
// 虽然 app.tsx 里写着 "This file is deprecated - use app.tsx instead"，
// 但 Taro 的入口解析优先取 .ts：生成的入口模块里明确是
// `import component from "/app.ts"`（可以直接 curl /app.config.ts 看）。
// 也就是说 **app.tsx 从来没有生效过**，它里面的 ConfigProvider 和
// `import './app.less'`（主题/动画/common/nutui-override 一套全局样式）
// 一直没被加载。
//
// 两处内容不一致时**以本文件为准**。要切到 app.tsx 是个独立的决定 ——
// 那会一次性激活上面那些全局样式，是全站观感变化，得单独确认，别顺手改。
export default function App(props) {
  useEffect(() => {
    // 启动时用服务端的 user 覆盖本地缓存。
    //
    // storage 里那份是**登录那一刻的快照**，role 之后被改过（比如管理员被降级）
    // 它会一直显示错的 —— 而前端据此渲染管理员入口。权限判定在后端，
    // 显示错了不致命，但别让它一直错着
    bootstrapAuth()
    // 空依赖数组：只跑一次。没有第二个参数的话是"每次渲染都跑"
  }, [])

  return props.children;
}
