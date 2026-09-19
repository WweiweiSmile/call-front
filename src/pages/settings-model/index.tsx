import React, { useCallback, useState } from 'react';
import { Input, Text, View } from '@tarojs/components';
import { Button } from '@nutui/nutui-react-taro';
import Taro from '@tarojs/taro';
import { useRequest } from 'ahooks';
import {
  ConfirmDialog,
  Loading,
  PageHeader,
  PageLayout,
  useRequireAuth,
} from '../../components';
import { usePageData } from '../../hooks';
import { preferenceApi } from '../../services/api';
import {
  AI_MODEL_MAX_LENGTH,
  AI_PRESET_CUSTOM,
  API_KEY_MAX_LENGTH,
  type AIModelPreset,
  type UpdateAIModelSettingsRequest,
} from '../../models/service';
import './index.less';

/**
 * 按地址与模型名反查该高亮哪个预设。
 *
 * 对不上就返回「自定义」：用户选中预设之后又手改了地址，高亮继续停在原预设上
 * 会撒谎。自定义预设本身不参与比对（它的两个值是空的）
 */
const matchPresetKey = (
  baseUrl: string,
  model: string,
  presets: AIModelPreset[]
): string => {
  const hit = presets.find(
    (preset) =>
      preset.key !== AI_PRESET_CUSTOM &&
      preset.baseUrl === baseUrl.trim() &&
      preset.model === model.trim()
  );
  return hit ? hit.key : AI_PRESET_CUSTOM;
};

/**
 * 模型设置页：用户自带 API Key（BYOK）。
 *
 * 三条不能破的规矩：
 *  1. **明文 Key 永不回填**。服务端只给掩码，输入框永远从空串开始
 *  2. **没动过输入框就不提交 apiKey 字段**。服务端把"不传"理解为"不改动"，
 *     一旦带上空串就把用户已存的 Key 清掉了
 *  3. 输入框的 maxlength 必须显式给足，见 API_KEY_MAX_LENGTH 的说明
 */
const SettingsModelPage: React.FC = () => {
  const { isAuthenticated } = useRequireAuth();

  const [loaded, setLoaded] = useState(false);
  const [presets, setPresets] = useState<AIModelPreset[]>([]);
  const [presetKey, setPresetKey] = useState(AI_PRESET_CUSTOM);
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  /** 用户这次输入的 Key。**永远从空串开始**，服务端的掩码不回填到这里 */
  const [apiKey, setApiKey] = useState('');
  /** 用户是否动过 Key 输入框。决定提交时带不带 apiKey 字段 */
  const [keyDirty, setKeyDirty] = useState(false);
  const [keyVisible, setKeyVisible] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKeyHint, setApiKeyHint] = useState('');
  const [clearVisible, setClearVisible] = useState(false);

  const notify = useCallback((title: string) => {
    Taro.showToast({ title, icon: 'none', duration: 2500 });
  }, []);

  const { isFirstLoading, refresh } = usePageData(
    () => preferenceApi.getAISettings(),
    {
      // 表单页：重新可见时重拉会把用户填了一半的内容冲掉
      refreshOnShow: false,
      onSuccess: (data) => {
        const list = data.presets ?? [];
        setPresets(list);
        setBaseUrl(data.baseUrl);
        setModel(data.model);
        setHasApiKey(data.hasApiKey);
        setApiKeyHint(data.apiKeyHint);
        // 按当前值反查该高亮哪个预设：用户选中预设后又手改了地址，
        // 高亮回落到「自定义」才是诚实的
        setPresetKey(matchPresetKey(data.baseUrl, data.model, list));
        setApiKey('');
        setKeyDirty(false);
        setLoaded(true);
      },
      onError: (e) =>
        Taro.showToast({ title: e?.message || '模型设置加载失败', icon: 'none', duration: 2500 }),
    }
  );

  const { run: save, loading: saving } = useRequest(
    (payload: UpdateAIModelSettingsRequest) => preferenceApi.updateAISettings(payload),
    {
      manual: true,
      onSuccess: (data) => {
        setHasApiKey(data.hasApiKey);
        setApiKeyHint(data.apiKeyHint);
        // 保存后清空输入框与脏标记：明文不留在页面上，也不留在内存里
        setApiKey('');
        setKeyDirty(false);
        setClearVisible(false);
        Taro.showToast({ title: '已保存', icon: 'success' });
        setTimeout(() => Taro.navigateBack(), 600);
      },
      onError: (e) =>
        Taro.showToast({ title: e?.message || '保存失败', icon: 'none', duration: 2500 }),
    }
  );

  const handlePickPreset = useCallback((preset: AIModelPreset) => {
    setPresetKey(preset.key);
    // 自定义预设的两个值是空的：选中它只切高亮，绝不把空值灌进输入框
    if (preset.baseUrl) setBaseUrl(preset.baseUrl);
    if (preset.model) setModel(preset.model);
  }, []);

  /** 只改地址或模型名时，把高亮降级到「自定义」——否则高亮会撒谎 */
  const handleEditBaseUrl = useCallback((value: string) => {
    setBaseUrl(value);
    setPresetKey(AI_PRESET_CUSTOM);
  }, []);

  const handleEditModel = useCallback((value: string) => {
    setModel(value);
    setPresetKey(AI_PRESET_CUSTOM);
  }, []);

  const handleSave = useCallback(() => {
    const trimmedBaseUrl = baseUrl.trim();
    const trimmedModel = model.trim();
    const trimmedKey = apiKey.trim();

    // 与后端 utils.ValidateAIBaseURL / ValidateAIModel 同一份口径，
    // 先拦一道是为了不让用户白等一次往返；真正的把关在后端
    if (!trimmedBaseUrl) {
      notify('请填写 BaseURL');
      return;
    }
    if (!/^https?:\/\//i.test(trimmedBaseUrl)) {
      notify('BaseURL 只支持 http/https 地址');
      return;
    }
    if (!trimmedModel) {
      notify('请填写模型名');
      return;
    }
    if (!hasApiKey && !trimmedKey) {
      notify('请填写你的 API Key');
      return;
    }
    if (keyDirty && !trimmedKey) {
      // 输入框动过又被清空 = 想删掉已存的 Key。这是个破坏性动作，走二次确认
      setClearVisible(true);
      return;
    }

    save({
      baseUrl: trimmedBaseUrl,
      model: trimmedModel,
      // 关键：没动过输入框就**完全不带**这个字段，服务端据此保留原 Key
      ...(keyDirty ? { apiKey: trimmedKey } : {}),
    });
  }, [baseUrl, model, apiKey, keyDirty, hasApiKey, notify, save]);

  const handleConfirmClear = useCallback(() => {
    const trimmedBaseUrl = baseUrl.trim();
    const trimmedModel = model.trim();

    // 确认弹窗是异步的，期间用户可能改了地址，这里再校验一次
    if (!trimmedBaseUrl || !/^https?:\/\//i.test(trimmedBaseUrl)) {
      setClearVisible(false);
      notify('BaseURL 只支持 http/https 地址');
      return;
    }
    if (!trimmedModel) {
      setClearVisible(false);
      notify('请填写模型名');
      return;
    }

    // 空串就是服务端三态里的"清除"
    save({ baseUrl: trimmedBaseUrl, model: trimmedModel, apiKey: '' });
  }, [baseUrl, model, notify, save]);

  if (!isAuthenticated) return <View />;
  if (isFirstLoading) return <Loading fullPage text='加载模型设置' />;

  return (
    <>
    <PageLayout
      className='settings-form settings-model-page'
      contentClassName='settings-form-content'
      header={<PageHeader title='模型设置' showBack />}
      bottom={
        <View className='page-footer'>
          <Button
            type='primary'
            block
            loading={saving}
            disabled={saving || !loaded}
            onClick={handleSave}
            data-testid='btn-save-model'
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
            拿不到当前配置就不该保存，否则会把已有的地址与模型名覆盖成空
          </Text>
          <View className='retry-btn' onClick={() => refresh()} data-testid='btn-reload-model'>
            <Text className='retry-text'>重新加载</Text>
          </View>
        </View>
      )}

      <View className='section'>
        <Text className='section-title'>我的模型</Text>
        <Text className='section-hint'>
          AI 分析用你自己的 API Key 调用模型，不再走服务端的公共额度。
          每日最多 30 次分析，与使用哪家模型无关
        </Text>

        <View className={`key-status ${hasApiKey ? 'ok' : 'warn'}`} data-testid='ai-key-status'>
          <Text className={`key-status-text ${hasApiKey ? 'ok' : 'warn'}`}>
            {hasApiKey ? `当前已配置：${apiKeyHint}` : '还没有配置 API Key，AI 分析不可用'}
          </Text>
        </View>
      </View>

      <View className='section'>
        <Text className='section-title'>供应商预设</Text>
        <Text className='section-hint'>
          选中后会自动填好地址与模型名，仍然可以按需改。用中转或自建服务就直接选「自定义」
        </Text>

        <View className='preset-chips'>
          {presets.map((preset) => (
            <View
              key={preset.key}
              className={`preset-chip ${presetKey === preset.key ? 'active' : ''}`}
              onClick={() => handlePickPreset(preset)}
              data-testid={`preset-${preset.key}`}
            >
              <Text className='preset-chip-text'>{preset.name}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className='section'>
        <Text className='section-title'>接口配置</Text>

        <View className='field'>
          <Text className='field-label'>BaseURL</Text>
          <View className='input-box'>
            <Input
              className='input'
              value={baseUrl}
              placeholder='https://api.deepseek.com'
              onInput={(e) => handleEditBaseUrl(e.detail.value)}
              data-testid='input-base-url'
            />
          </View>
          <Text className='field-note'>
            填到 /v1 这一层就行，不要带 /chat/completions。只支持公网地址
          </Text>
        </View>

        <View className='field'>
          <Text className='field-label'>模型名</Text>
          <View className='input-box'>
            <Input
              className='input'
              value={model}
              placeholder='deepseek-chat'
              maxlength={AI_MODEL_MAX_LENGTH}
              onInput={(e) => handleEditModel(e.detail.value)}
              data-testid='input-model'
            />
          </View>
        </View>

        <View className='field'>
          <Text className='field-label'>API Key</Text>
          <View className='input-box'>
            <Input
              className='input'
              // Taro Input 的密码态要用 password 布尔 prop。
              // 写 type='password' 是 TS 编译错误 —— Type 联合里没有这个成员
              password={!keyVisible}
              // ⚠️ 必须显式给：默认只有 140，长 Key（sk-proj-…）会被静默截断，
              // 表现是"保存成功但一直鉴权失败"，极像用户自己填错了
              maxlength={API_KEY_MAX_LENGTH}
              value={apiKey}
              placeholder={hasApiKey ? `已保存 ${apiKeyHint}，留空则不改动` : '粘贴你的 API Key'}
              onInput={(e) => {
                setApiKey(e.detail.value);
                setKeyDirty(true);
              }}
              data-testid='input-api-key'
            />
            <Text
              className='unit-tap'
              onClick={() => setKeyVisible((v) => !v)}
              data-testid='btn-toggle-key'
            >
              {keyVisible ? '🙈' : '👁'}
            </Text>
          </View>
          <Text className='field-note'>
            Key 加密后存在服务端，明文不会回显；只有你重新填写才能修改
          </Text>

          {hasApiKey && (
            <View
              className='link-btn'
              onClick={() => setClearVisible(true)}
              data-testid='btn-clear-key'
            >
              <Text className='link-text'>清除已保存的 API Key</Text>
            </View>
          )}
        </View>
      </View>

      <View className='bottom-space' />
    </PageLayout>

      <ConfirmDialog
        visible={clearVisible}
        title='清除 API Key'
        content='清除后 AI 分析不可用，需要重新填写。确定要清除吗？'
        confirmText='清除'
        confirmType='danger'
        loading={saving}
        onConfirm={handleConfirmClear}
        onCancel={() => setClearVisible(false)}
      />
    </>
  );
};

export default SettingsModelPage;
