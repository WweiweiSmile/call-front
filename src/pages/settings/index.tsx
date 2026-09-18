import React, { useCallback, useState } from 'react';
import { Input, Text, View } from '@tarojs/components';
import { Button } from '@nutui/nutui-react-taro';
import Taro from '@tarojs/taro';
import { useRequest } from 'ahooks';
import { Loading, PageHeader, PageLayout, useRequireAuth } from '../../components';
import { usePageData } from '../../hooks';
import { preferenceApi } from '../../services/api';
import {
  DEFAULT_TABLE_SIZE,
  bbToInput,
  formatBB,
  inputToBb,
  preflopPotBb,
} from '../../utils/poker';
import './index.less';

/**
 * 设置页。
 *
 * 目前只有复盘录入用的默认盲注，但页面本身是按"以后还会加别的设置项"搭的：
 * 每个设置项一个 section，互不依赖
 */
const SettingsPage: React.FC = () => {
  const { isAuthenticated } = useRequireAuth();

  const [smallBlindBb, setSmallBlindBb] = useState('');
  const [bigBlindBb, setBigBlindBb] = useState('');
  const [anteBb, setAnteBb] = useState('');
  /** 服务端的值是否已经填进表单。没填过就不允许保存，否则会把空值写回去覆盖掉 */
  const [loaded, setLoaded] = useState(false);

  const { isFirstLoading, refresh } = usePageData(
    () => preferenceApi.getPreferences(),
    {
      // 这是表单页，重新可见时重新取数会把用户改了一半的值冲掉
      refreshOnShow: false,
      onSuccess: (pref) => {
        setSmallBlindBb(bbToInput(pref.smallBlindBb));
        setBigBlindBb(bbToInput(pref.bigBlindBb));
        setAnteBb(bbToInput(pref.anteBb));
        setLoaded(true);
      },
      onError: (e) =>
        Taro.showToast({ title: e?.message || '设置加载失败', icon: 'none', duration: 2500 }),
    }
  );

  const { run: save, loading: saving } = useRequest(
    () =>
      preferenceApi.updatePreferences({
        smallBlindBb: inputToBb(smallBlindBb),
        bigBlindBb: inputToBb(bigBlindBb),
        anteBb: inputToBb(anteBb),
      }),
    {
      manual: true,
      onSuccess: () => {
        Taro.showToast({ title: '已保存', icon: 'success' });
        setTimeout(() => Taro.navigateBack(), 600);
      },
      onError: (e) =>
        Taro.showToast({ title: e?.message || '保存失败', icon: 'none', duration: 2500 }),
    }
  );

  const handleSave = useCallback(() => {
    // 与后端 utils.ValidateBlinds 同一份口径。这里先拦一道是为了不让用户白等一次往返，
    // 真正的把关仍然在后端
    const big = inputToBb(bigBlindBb);
    const small = inputToBb(smallBlindBb);
    const ante = inputToBb(anteBb);

    if (big === 0 && (small > 0 || ante > 0)) {
      Taro.showToast({ title: '填了小盲或前注，就必须填大盲', icon: 'none', duration: 2500 });
      return;
    }
    if (big > 0 && small > big) {
      Taro.showToast({ title: '小盲不能大于大盲', icon: 'none', duration: 2500 });
      return;
    }

    save();
  }, [smallBlindBb, bigBlindBb, anteBb, save]);

  if (!isAuthenticated) return <View />;
  if (isFirstLoading) return <Loading fullPage text='加载设置' />;

  // 前注要按牌桌人数折算，而人数是每手牌各自记的，这里只能拿默认人数举例说明
  const examplePot = preflopPotBb({
    smallBlindBb: inputToBb(smallBlindBb),
    bigBlindBb: inputToBb(bigBlindBb),
    anteBb: inputToBb(anteBb),
    tableSize: DEFAULT_TABLE_SIZE,
    // 这里只是拿默认人数举例说明前注怎么折算，不涉及具体的人
    heroPosition: '',
    villainPositions: [],
    legacyVillainPosition: '',
  });

  return (
    <PageLayout
      className='settings-page'
      contentClassName='settings-content'
      header={<PageHeader title='设置' showBack />}
      bottom={
        <View className='page-footer'>
          <Button
            type='primary'
            block
            loading={saving}
            disabled={saving || !loaded}
            onClick={handleSave}
          >
            保存
          </Button>
        </View>
      }
    >
      {!loaded && (
        <View className='section'>
          <Text className='section-title'>设置没能加载出来</Text>
          <Text className='section-hint'>
            拿不到当前设置就不该保存，否则会把已有的默认值覆盖成空
          </Text>
          <View className='retry-btn' onClick={() => refresh()}>
            <Text className='retry-text'>重新加载</Text>
          </View>
        </View>
      )}

      <View className='section'>
        <Text className='section-title'>默认盲注</Text>
        <Text className='section-hint'>
          记录手牌时会自动带上这几个值，不用每手都重新填。录入页里仍然可以针对单手牌改
        </Text>

        <View className='field-row'>
          <View className='field half'>
            <Text className='field-label'>小盲</Text>
            <View className='input-box'>
              <Input
                className='input'
                type='digit'
                value={smallBlindBb}
                placeholder='0.5'
                onInput={(e) => setSmallBlindBb(e.detail.value)}
              />
              <Text className='unit'>bb</Text>
            </View>
          </View>
          <View className='field half'>
            <Text className='field-label'>大盲</Text>
            <View className='input-box'>
              <Input
                className='input'
                type='digit'
                value={bigBlindBb}
                placeholder='1'
                onInput={(e) => setBigBlindBb(e.detail.value)}
              />
              <Text className='unit'>bb</Text>
            </View>
          </View>
        </View>

        <View className='field'>
          <Text className='field-label'>前注</Text>
          <View className='input-box'>
            <Input
              className='input'
              type='digit'
              value={anteBb}
              placeholder='不打前注就留空'
              onInput={(e) => setAnteBb(e.detail.value)}
            />
            <Text className='unit'>bb</Text>
          </View>
          <Text className='field-note'>前注是每人一份，开局按牌桌人数折算</Text>
        </View>

        <Text className='pot-preview'>
          以 {DEFAULT_TABLE_SIZE} 人桌为例，翻前起始底池 {formatBB(examplePot)} bb
        </Text>
      </View>

      <View className='section'>
        <Text className='section-title'>关于这三个值</Text>
        <Text className='section-hint'>
          全站（有效筹码、金额、底池）都以大盲为单位，所以这里填的是「几个大盲」，
          不是筹码数。线下 5/10 的局就是小盲 0.5、大盲 1。
          三个都留空表示不记盲注，底池会退回不含盲注的估算口径
        </Text>
      </View>

      <View className='bottom-space' />
    </PageLayout>
  );
};

export default SettingsPage;
