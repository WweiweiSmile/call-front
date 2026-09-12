import React, {useCallback} from 'react';
import {View} from '@tarojs/components';
import {Button, Form, Input as NutInput, Toast} from '@nutui/nutui-react-taro';
import Taro from '@tarojs/taro';
import {useAppStore} from '../../store';
import {useAuthStore} from '../../store/auth';
import {useRequireAuth, PageHeader, PageLayout} from '../../components';
import type {FormInstance} from '@nutui/nutui-react-taro/dist/types/packages/form/types';
import './index.less';

interface FormValues {
  name: string;
  description?: string;
}

const CreateGamePage: React.FC = () => {
  const {isAuthenticated} = useRequireAuth();
  const {createGame} = useAppStore();
  const {user} = useAuthStore();
  const [form] = Form.useForm() as [FormInstance];

  const handleSubmit = useCallback(async (values: FormValues) => {
    if (!values.name?.trim() || !user) {
      Toast.show('create-game-toast', {content: '请输入游戏名称'});
      return;
    }

    try {
      await createGame({
        name: values.name,
        description: values.description || '',
      });
      Toast.show('create-game-toast', {content: '创建成功'});
      await Taro.navigateBack();
    } catch (error: any) {
      Toast.show('create-game-toast', {content: error.message || '创建失败'});
    }
  }, [user, createGame]);

  // 如果未认证，不渲染内容（会自动跳转）
  if (!isAuthenticated || !user) {
    return <View/>;
  }

  return (
    <PageLayout
      className='create-game-page'
      contentClassName='content'
      header={
        <>
          <Toast id="create-game-toast"/>
          <PageHeader title='创建游戏' showBack />
        </>
      }
    >
        <Form
          form={form}
          onFinish={handleSubmit}
          initialValues={{
            name: '',
            description: '',
          }}
        >
          <Form.Item label='游戏名称' name='name' required>
            <NutInput placeholder='请输入游戏名称' data-testid="input-game-name"/>
          </Form.Item>
          <Form.Item label='游戏描述 (选填)' name='description'>
            <NutInput type='textarea' placeholder='请输入游戏描述' data-testid="input-game-description"/>
          </Form.Item>
          <Form.Item>
            <Button type='primary' size='large' block nativeType='submit' data-testid="btn-create-game-submit">
              创建游戏
            </Button>
          </Form.Item>
        </Form>
    </PageLayout>
  );
};

export default CreateGamePage;
