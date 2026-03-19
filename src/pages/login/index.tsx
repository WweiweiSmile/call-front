import {useState} from 'react';
import {Text, View} from '@tarojs/components';
import Taro from '@tarojs/taro';
import {Button, Form, Input, Toast} from '@nutui/nutui-react-taro';
import {useAuthStore} from '../../store/auth';
import './index.less';

function LoginPage() {
  const {login, register, state} = useAuthStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form] = Form.useForm();

  const handleSubmit = async (values: any) => {
    if (!values.username || !values.password) {
      Toast.show('login-toast', {content: '请填写完整信息'});
      return;
    }

    try {
      if (mode === 'login') {
        await login(values.username, values.password);
        Toast.show('login-toast', {content: '登录成功'});
      } else {
        await register(values.username, values.password, values.nickname || values.username);
        Toast.show('login-toast', {content: '注册成功'});
      }
      // 登录成功后跳转到主页
      Taro.redirectTo({
        url: '/pages/index/index',
      });
    } catch (error: any) {
      Toast.show('login-toast', {content: error.message || '操作失败'});
    }
  };

  return (
    <View className="login-page">
      <Toast id="login-toast"/>
      <View className="login-header">
        <Text className="login-title">Call 游戏管理</Text>
        <Text className="login-subtitle">
          {mode === 'login' ? '欢迎回来' : '创建新账户'}
        </Text>
      </View>

      <View className="login-form">
        <Form
          form={form}
          onFinish={handleSubmit}
          initialValues={{
            username: '',
            password: '',
            nickname: '',
          }}
        >
          <Form.Item label="用户名" name="username">
            <Input
              type="text"
              placeholder="请输入用户名"
            />
          </Form.Item>

          {mode === 'register' && (
            <Form.Item label="昵称" name="nickname">
              <Input
                type="text"
                placeholder="请输入昵称（可选）"
              />
            </Form.Item>
          )}

          <Form.Item label="密码" name="password">
            <Input
              type="password"
              placeholder="请输入密码"
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              size="large"
              loading={state.isLoading}
              block
              htmlType="submit"
            >
              {mode === 'login' ? '登录' : '注册'}
            </Button>
          </Form.Item>
        </Form>
      </View>

      <View className="login-footer">
        <Text
          className="switch-mode"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            form.resetFields();
          }}
        >
          {mode === 'login' ? '没有账户？去注册' : '已有账户？去登录'}
        </Text>
      </View>
    </View>
  );
}

export default LoginPage;
