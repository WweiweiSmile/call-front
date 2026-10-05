import React, {useEffect} from 'react'
import {useDidHide, useDidShow} from '@tarojs/taro'
import {ConfigProvider} from '@nutui/nutui-react-taro'
import zhCN from '@nutui/nutui-react-taro/dist/locales/zh-CN'
import {bootstrapAuth} from './store/auth'
// 全局样式
import './app.less'

// ⚠️ 这个文件目前**不生效** —— Taro H5 的入口解析到的是 ./app.ts。
// 详见 app.ts 里的说明。保留它是有意义的（它才是被设计成真正的那份），
// 但改这里的东西请先确认入口到底是谁，否则会改了没反应。
function App(props) {
  // 可以使用所有的 React Hooks
  useEffect(() => {
    // 启动时的用户信息同步。和 app.ts 调的是同一个函数 ——
    // 两边都写着，是为了哪天入口切换过去时不会漏
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
      {props.children}
    </ConfigProvider>
  )
}

export default App
