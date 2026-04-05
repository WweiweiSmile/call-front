import {useState, useCallback} from 'react';
import {Text, View} from '@tarojs/components';
import Taro from '@tarojs/taro';
import {Button, Form, Input, Toast} from '@nutui/nutui-react-taro';
import {useAuthStore} from '../../store/auth';
import './index.less';

type ModeType = 'login' | 'register';

interface FormValues {
  username: string;
  password: string;
  nickname?: string;
}

function LoginPage() {
  const {login, register, state} = useAuthStore();
  const [mode, setMode] = useState<ModeType>('login');
  const [form] = Form.useForm();

  // 提取重复的模式切换逻辑
  const switchMode = useCallback((newMode: ModeType) => {
    setMode(newMode);
    form.resetFields();
  }, [form]);

  const handleSubmit = async (values: FormValues) => {
    if (!values.username || !values.password) {
      Toast.show('login-toast', {content: '请填写完整信息'});
      return;
    }

    try {
      if (mode === 'login') {
        await login(values.username, values.password);
        Toast.show('login-toast', {content: <View data-testid="login-success">登录成功</View>});
      } else {
        await register(values.username, values.password, values.nickname || values.username);
        Toast.show('login-toast', {content: '注册成功'});
      }
      Taro.redirectTo({
        url: '/pages/index/index',
      });
    } catch (error: any) {
      Toast.show('login-toast', {content: <View data-testid="login-error">{error.message || '操作失败'}</View>});
    }
  };

  return (
    <View className="login-page">
      <Toast id="login-toast"/>
      <View className="login-header">
        <Text className="logo-icon">🎮</Text>
        <Text className="login-title">Call 游戏管理</Text>
        <Text className="login-subtitle">
          {mode === 'login' ? '欢迎回来' : '创建新账户'}
        </Text>
      </View>

      <View className="login-form">
        {/* Tab 切换 */}
        <View className="form-tabs">
          <View
            className={`tab-item ${mode === 'login' ? 'active' : ''}`}
            onClick={() => switchMode('login')}
            data-testid="tab-login"
          >
            登录
          </View>
          <View
            className={`tab-item ${mode === 'register' ? 'active' : ''}`}
            onClick={() => switchMode('register')}
            data-testid="tab-register"
          >
            注册
          </View>
          <View className={`tab-indicator ${mode === 'register' ? 'right' : ''}`}/>
        </View>

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
              data-testid="input-username"
            />
          </Form.Item>

          {mode === 'register' && (
            <Form.Item label="昵称" name="nickname">
              <Input
                type="text"
                placeholder="请输入昵称（可选）"
                data-testid="input-nickname"
              />
            </Form.Item>
          )}

          <Form.Item label="密码" name="password">
            <Input
              type="password"
              placeholder="请输入密码"
              data-testid="input-password"
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              size="large"
              loading={state.isLoading}
              block
              htmlType="submit"
              data-testid="btn-submit"
            >
              {mode === 'login' ? '登录' : '注册'}
            </Button>
          </Form.Item>
        </Form>
      </View>

      <View className="login-footer">
        <Text
          className="switch-mode"
          onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
          data-testid="btn-switch-mode"
        >
          {mode === 'login' ? '没有账户？去注册' : '已有账户？去登录'}
        </Text>
      </View>
    </View>
  );
}

export default LoginPage;
