import React, {useState} from 'react';
import {View, Text} from '@tarojs/components';
import {Button, Form, Input as NutInput, Toast, DatePicker} from '@nutui/nutui-react-taro';
import Taro from '@tarojs/taro';
import {useAppStore} from '../../store';
import type {FormInstance} from '@nutui/nutui-react-taro/dist/types/packages/form/types';
import type {PickerOption} from '@nutui/nutui-react-taro/dist/types/packages/picker';
import './index.less';
import CustomDatePicker from "../../components/date-picker";

const CreateGamePage: React.FC = () => {
  const {createGame} = useAppStore();
  const [form] = Form.useForm() as [FormInstance];
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);

  const handleSubmit = async (values: any) => {
    if (!values.name?.trim()) {
      (Toast.show as any)('请输入游戏名称');
      return;
    }

    try {
      await createGame({
        name: values.name,
        description: values.description || '',
        startTime: startTime ? startTime.toISOString() : '',
        endTime: '',
      });
      (Toast.show as any)('创建成功');
      Taro.navigateBack();
    } catch (error: any) {
      (Toast.show as any)(error.message || '创建失败');
    }
  };

  const handleTimeConfirm = (_selectedOptions: PickerOption[], selectedValue: (string | number)[]) => {
    // selectedValue 是 [year, month, day, hour, minute] 数组
    if (selectedValue && selectedValue.length >= 5) {
      const [year, month, day, hour, minute] = selectedValue;
      const date = new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute)
      );
      if (!isNaN(date.getTime())) {
        setStartTime(date);
      }
    }
    setShowTimePicker(false);
  };

  const formatDisplayTime = (date: Date | null) => {
    if (!date) return '';
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <View className='create-game-page'>
      <View className='header'>
        <View className='header-left' onClick={() => Taro.navigateBack()}>
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
            <NutInput placeholder='请输入游戏名称'/>
          </Form.Item>
          <Form.Item label='游戏描述 (选填)' name='description'>
            <NutInput type='textarea' placeholder='请输入游戏描述'/>
          </Form.Item>
          <Form.Item label='开始时间' required>
            <CustomDatePicker
              type={'datetime'}
            />
          </Form.Item>
          <Form.Item>
            <Button type='primary' size='large' block nativeType='submit'>
              创建游戏
            </Button>
          </Form.Item>
        </Form>
      </View>

      {/*<DatePicker*/}
      {/*  visible={showTimePicker}*/}
      {/*  type='datetime'*/}
      {/*  defaultValue={new Date()}*/}
      {/*  onConfirm={handleTimeConfirm}*/}
      {/*  onCancel={() => setShowTimePicker(false)}*/}
      {/*/>*/}
    </View>
  );
};

export default CreateGamePage;
