import React from 'react';
import { Text, View } from '@tarojs/components';
import { Button } from '@nutui/nutui-react-taro';
import { STREET_LABEL } from '../../utils/poker';
import type {
  AlternativeItem,
  FrontendAIStatus,
  FrontendAnalysis,
  LeakItem,
  StrengthItem,
  StreetVerdict,
} from '../../models/types/review';
import './index.less';

interface AnalysisPanelProps {
  analysis: FrontendAnalysis | null;
  /** AI 可用状态，为 null 表示还没拉到 */
  aiStatus: FrontendAIStatus | null;
  /** 标签 code -> 中文名，用于把模型的 tagCode 渲染成人话 */
  tagNameByCode: Record<string, string>;
  /** 触发分析 / 重试 */
  onAnalyze: () => void;
  triggering: boolean;
}

/** 逐街评价的结论样式 */
const VERDICT_TEXT: Record<StreetVerdict, string> = {
  ok: '合理',
  marginal: '可商榷',
  mistake: '有问题',
};

/** 严重度文案 */
const SEVERITY_TEXT: Record<number, string> = {
  1: '轻微',
  2: '明显',
  3: '严重',
};

const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  analysis,
  aiStatus,
  tagNameByCode,
  onAnalyze,
  triggering,
}) => {
  const status = analysis?.status;
  const result = analysis?.result;
  const running = status === 'pending' || status === 'running';

  // 拿标签中文名。字典还没加载出来时退回 code，总比显示空白强
  const leakName = (item: LeakItem) => tagNameByCode[item.tagCode] || item.tagCode;

  const renderLeakList = (items: LeakItem[]) => {
    if (!items || items.length === 0) return null;
    return (
      <View className='tag-block'>
        {items.map((item, i) => (
          <View key={`${item.tagCode}-${i}`} className='leak-item leak'>
            <View className='leak-head'>
              <Text className='leak-name'>{leakName(item)}</Text>
              <Text className={`severity s${item.severity}`}>
                {SEVERITY_TEXT[item.severity] || ''}
              </Text>
            </View>
            {/* 证据是防止"随口贴标签"的抓手，必须展示出来 */}
            <Text className='leak-evidence'>{item.evidence}</Text>
          </View>
        ))}
      </View>
    );
  };

  // 优点没有标签，只是一段文字
  const renderStrengths = (items: StrengthItem[]) => {
    if (!items || items.length === 0) return null;
    return (
      <View className='tag-block'>
        {items.map((item, i) => (
          <View key={i} className='strength-item'>
            <Text className='strength-text'>{item.text}</Text>
          </View>
        ))}
      </View>
    );
  };

  return (
    <View className='analysis-panel'>
      <View className='panel-head'>
        <Text className='panel-title'>AI 分析</Text>
        {aiStatus && aiStatus.enabled && (
          <Text className='quota-hint'>
            今日剩余 {aiStatus.remaining}/{aiStatus.dailyLimit} 次
          </Text>
        )}
      </View>

      {/* ---------- 未启用 ---------- */}
      {aiStatus && !aiStatus.enabled && (
        <Text className='state-text'>服务端未配置 AI，暂时无法分析</Text>
      )}

      {/* ---------- 无分析：引导触发 ---------- */}
      {!analysis && aiStatus?.enabled && (
        <View className='empty-state'>
          <Text className='state-text'>
            让 AI 逐街点评这手牌，指出关键错误并给出替代线路。
          </Text>
          <Text className='cost-hint'>
            会结合你写下的想法来评估你的判断，一次分析约需 20~60 秒
          </Text>
          <Button
            type='primary'
            size='small'
            loading={triggering}
            disabled={triggering || (aiStatus?.remaining ?? 0) <= 0}
            onClick={onAnalyze}
          >
            {(aiStatus?.remaining ?? 0) <= 0 ? '今日次数已用完' : '开始分析'}
          </Button>
        </View>
      )}

      {/* ---------- 进行中 ---------- */}
      {running && (
        <View className='running-state'>
          <View className='pulse-dot' />
          <Text className='state-text'>正在分析，通常需要 20~60 秒…</Text>
          <Text className='cost-hint'>可以先退出，结果会保留下来</Text>
        </View>
      )}

      {/* ---------- 失败 ---------- */}
      {status === 'failed' && (
        <View className='failed-state'>
          <Text className='error-text'>{analysis?.errorMsg || '分析失败'}</Text>
          <Button
            type='default'
            size='small'
            loading={triggering}
            disabled={triggering}
            onClick={onAnalyze}
          >
            重试
          </Button>
        </View>
      )}

      {/* ---------- 完成 ---------- */}
      {status === 'done' && result && (
        <View className='result-body'>
          {result.handSummary && (
            <View className='summary-block'>
              <Text className='summary-text'>{result.handSummary}</Text>
            </View>
          )}

          {/* 逐街评价 */}
          {result.streetAnalysis && result.streetAnalysis.length > 0 && (
            <View className='section-block'>
              <Text className='block-title'>逐街评价</Text>
              {result.streetAnalysis.map((item, i) => (
                <View key={`${item.street}-${i}`} className='street-item'>
                  <View className='street-head'>
                    <Text className='street-label'>
                      {STREET_LABEL[item.street] || item.street}
                    </Text>
                    <Text className={`verdict ${item.verdict}`}>
                      {VERDICT_TEXT[item.verdict] || item.verdict}
                    </Text>
                  </View>
                  <Text className='street-comment'>{item.comment}</Text>
                </View>
              ))}
            </View>
          )}

          {/* 关键错误 */}
          {result.keyMistake && (
            <View className='section-block key-mistake'>
              <View className='street-head'>
                <Text className='block-title'>关键错误</Text>
                <Text className='street-label'>
                  {STREET_LABEL[result.keyMistake.street] || result.keyMistake.street}
                </Text>
              </View>
              <View className='mistake-row'>
                <Text className='row-label'>我做了什么</Text>
                <Text className='row-text'>{result.keyMistake.what}</Text>
              </View>
              <View className='mistake-row'>
                <Text className='row-label'>为什么是错的</Text>
                <Text className='row-text'>{result.keyMistake.why}</Text>
              </View>
              <View className='mistake-row better'>
                <Text className='row-label'>更好的线路</Text>
                <Text className='row-text'>{result.keyMistake.betterLine}</Text>
              </View>
            </View>
          )}

          {/* 替代线路 */}
          {result.alternatives && result.alternatives.length > 0 && (
            <View className='section-block'>
              <Text className='block-title'>替代线路</Text>
              {result.alternatives.map((alt: AlternativeItem, i: number) => (
                <View key={i} className='alt-item'>
                  <Text className='alt-line'>{alt.line}</Text>
                  {alt.note ? <Text className='alt-note'>{alt.note}</Text> : null}
                </View>
              ))}
            </View>
          )}

          {/* 漏洞与优点 */}
          {result.leaks && result.leaks.length > 0 && (
            <View className='section-block'>
              <Text className='block-title'>暴露的问题</Text>
              {renderLeakList(result.leaks)}
            </View>
          )}
          {result.strengths && result.strengths.length > 0 && (
            <View className='section-block'>
              <Text className='block-title'>做得好的地方</Text>
              {renderStrengths(result.strengths)}
            </View>
          )}

          {/* 练习建议 */}
          {result.drills && result.drills.length > 0 && (
            <View className='section-block'>
              <Text className='block-title'>练习建议</Text>
              {result.drills.map((d, i) => (
                <View key={i} className='drill-item'>
                  <Text className='drill-index'>{i + 1}</Text>
                  <Text className='drill-text'>{d}</Text>
                </View>
              ))}
            </View>
          )}

          {/* 模型提议但未入字典的标签，不给用户看，只在有值时提示运营 */}
          {result.suggestedTags && result.suggestedTags.length > 0 && (
            <Text className='suggest-hint'>
              本次分析中有 {result.suggestedTags.length} 个标签不在字典内，已转入待审队列
            </Text>
          )}

          {/* 免责声明：没有求解器就不要暗示精确性 */}
          <Text className='disclaimer'>
            AI 建议仅供参考。此处不提供精确 EV 与胜率数字，结论请结合你自己的判断。
          </Text>

          <View className='panel-footer'>
            <Text className='meta-text'>
              {analysis?.model} · {analysis?.promptVersion}
              {analysis?.durationMs ? ` · ${(analysis.durationMs / 1000).toFixed(1)}s` : ''}
            </Text>
            <Button
              type='default'
              size='mini'
              loading={triggering}
              disabled={triggering || (aiStatus?.remaining ?? 0) <= 0}
              onClick={onAnalyze}
            >
              重新分析
            </Button>
          </View>
        </View>
      )}
    </View>
  );
};

export default AnalysisPanel;
