import React, {useEffect} from 'react'
import {useDidHide, useDidShow} from '@tarojs/taro'
import {ConfigProvider} from '@nutui/nutui-react-taro'
import zhCN from '@nutui/nutui-react-taro/dist/locales/zh-CN'
// 全局样式
import './app.less'

function App(props) {
  // 可以使用所有的 React Hooks
  useEffect(() => {
  })

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
