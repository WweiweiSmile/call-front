import {useEffect} from 'react'
import {useDidHide, useDidShow} from '@tarojs/taro'
import {ConfigProvider} from '@nutui/nutui-react-taro'
import zhCN from '@nutui/nutui-react-taro/dist/locales/zh-CN'
import {bootstrapAuth} from './store/auth'
// 全局样式
import './app.less'
import TicketHandler from "./components/TicketHandler";

// ⚠️ 这个文件**就是** Taro H5 实际使用的应用入口（app.ts 已删除）。
//
// 历史：以前入口是 src/app.ts（Taro 的入口解析优先取 `.ts`），于是这里的
// ConfigProvider 和 `import './app.less'`（主题/动画/common/nutui-override
// 一整套全局样式）**从来没有被加载过**。删掉 app.ts 之后这些都生效了 ——
// 全站观感会跟着变，改这个文件前先意识到自己在改全站
function App(props) {
  // 可以使用所有的 React Hooks
  useEffect(() => {
    // 启动时的用户信息同步
    bootstrapAuth()
    // 空依赖数组：只跑一次。原来是 useEffect(() => {})，没有第二个参数，
    // 那是"每次渲染都跑"
  }, [])

  // 对应 onShow
  useDidShow(() => {
  })

  // 对应 onHide
  useDidHide(() => {
  })

  return (
    <ConfigProvider locale={zhCN}>
      <TicketHandler>
        {props.children}
      </TicketHandler>
    </ConfigProvider>
  )
}

export default App
