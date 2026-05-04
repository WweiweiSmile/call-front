import React, {useCallback, useState} from 'react';
import {Text, View} from '@tarojs/components';
import {Button, Form, Input as NutInput, Toast} from '@nutui/nutui-react-taro';
import Taro from '@tarojs/taro';
import {useAppStore} from '../../store';
import {useAuthStore} from '../../store/auth';
import {useRequireAuth} from '../../components/RequireAuth';
import type {FormInstance} from '@nutui/nutui-react-taro/dist/types/packages/form/types';
import './index.less';
import CustomDatePicker from "../../components/date-picker";

interface FormValues {
  name: string;
  description?: string;
}

const CreateGamePage: React.FC = () => {
  const {isAuthenticated} = useRequireAuth();
  const {createGame} = useAppStore();
  const {state: authState} = useAuthStore();
  const [form] = Form.useForm() as [FormInstance];
  const [startTime, setStartTime] = useState<Date | null>(null);

  const handleSubmit = useCallback(async (values: FormValues) => {
    if (!values.name?.trim() || !authState.user || !startTime) {
      if (!values.name?.trim()) {
        Toast.show('create-game-toast', {content: '请输入游戏名称'});
      }
      if (!startTime) {
        Toast.show('create-game-toast', {content: '请选择开始时间'});
      }
      return;
    }

    try {
      await createGame({
        name: values.name,
        description: values.description || '',
        startTime: startTime.toISOString(),
      });
      Toast.show('create-game-toast', {content: '创建成功'});
      await Taro.navigateBack();
    } catch (error: any) {
      Toast.show('create-game-toast', {content: error.message || '创建失败'});
    }
  }, [authState.user, createGame, startTime]);

  // 如果未认证，不渲染内容（会自动跳转）
  if (!isAuthenticated || !authState.user) {
    return <View/>;
  }

  return (
    <View className='create-game-page'>
      <Toast id="create-game-toast"/>
      <View className='header'>
        <View className='header-left' onClick={() => Taro.navigateBack()} data-testid="btn-back">
          <Text className='back-icon'>←</Text>
        </View>
        <View className='header-center'>
          <Text className='title'>创建游戏</Text>
        </View>
        <View className='header-right'/>
      </View>

      <View className='content'>
        <Form
          form={form}
          onFinish={handleSubmit}
          initialValues={{
            name: '',
            description: '',
          }}
          className='create-form'
        >
          <Form.Item label='游戏名称' name='name' required>
            <NutInput placeholder='请输入游戏名称' data-testid="input-game-name"/>
          </Form.Item>
          <Form.Item label='游戏描述 (选填)' name='description'>
            <NutInput type='textarea' placeholder='请输入游戏描述' data-testid="input-game-description"/>
          </Form.Item>
          <Form.Item label='开始时间' name="startTime" required>
            <CustomDatePicker
              type={'datetime'}
              value={startTime}
              onChange={(date) => setStartTime(date)}
            />
          </Form.Item>
          <Form.Item>
            <Button type='primary' size='large' block nativeType='submit' data-testid="btn-create-game-submit">
              创建游戏
            </Button>
          </Form.Item>
        </Form>
      </View>
    </View>
  );
};

export default CreateGamePage;
