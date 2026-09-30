import React from 'react';
import { Text, View } from '@tarojs/components';
import { STREET_LABEL, UNNAMED_VILLAIN_LABEL, positionLabel, tableSizeLabel } from '../../utils/poker';
import type { OcrTableDraft } from '../../models/service/ocr';
import './index.less';

interface OcrTablePreviewProps {
  /** 待确认的识别结果。为 null 时渲染空（弹窗关闭态） */
  draft: OcrTableDraft | null;
}

/**
 * OCR 识别结果的预览，塞在确认框里。
 *
 * 存在的意义是让用户在**覆盖之前**看清两件事：会写入什么，以及会丢掉什么
 * （现有的对手与行动记录）。这两件事只靠 toast 说不清
 */
const OcrTablePreview: React.FC<OcrTablePreviewProps> = ({ draft }) => {
  if (!draft) return null;

  const { tableSize, heroPosition, heroStackBb, villains } = draft;
  const heroPositionText = heroPosition
    ? positionLabel(heroPosition, tableSize)
    : '位置待选';
  const droppedStreets = draft.droppedActionStreets
    .map((street) => STREET_LABEL[street])
    .join('、');

  return (
    <View className='ocr-preview'>
      <Text className='ocr-summary'>
        {tableSizeLabel(tableSize)} · 我在 {heroPositionText} · 有效筹码{' '}
        {heroStackBb ? `${heroStackBb}bb` : '未读到'} · {villains.length} 个对手
      </Text>

      <View className='ocr-seat-list'>
        {villains.map((villain) => (
          <View key={villain.sourceIndex} className='ocr-seat'>
            <Text className={`ocr-seat-position ${villain.position ? '' : 'missing'}`}>
              {villain.position ? positionLabel(villain.position, tableSize) : '待选'}
            </Text>
            <Text className='ocr-seat-name'>{villain.name || UNNAMED_VILLAIN_LABEL}</Text>
            <Text className={`ocr-seat-stack ${villain.stackBb ? '' : 'missing'}`}>
              {villain.stackBb ? `${villain.stackBb}bb` : '无筹码'}
            </Text>
          </View>
        ))}
      </View>

      {/* 覆盖的代价：现有对手会被整个换掉，指向消失位置的行动会一起删。
          真有东西会丢时才用告警色，空表单说"不涉及替换"不该是红的 */}
      <Text
        className={`ocr-cost ${
          draft.replacedVillainCount > 0 || draft.droppedActionCount > 0 ? 'destructive' : ''
        }`}
      >
        {draft.replacedVillainCount > 0
          ? `会替换掉现有的 ${draft.replacedVillainCount} 个对手`
          : '现有对手列表是空的，不涉及替换'}
        {draft.droppedActionCount > 0
          ? `，并删掉 ${draft.droppedActionCount} 条行动记录（${droppedStreets}）`
          : ''}
      </Text>

      {/* 识别服务自报的缺陷 */}
      {draft.warnings.length > 0 && (
        <View className='ocr-note-group'>
          <Text className='ocr-note-title'>识别服务的提示</Text>
          {draft.warnings.map((warning) => (
            <Text key={warning} className='ocr-note warn'>
              · {warning}
            </Text>
          ))}
        </View>
      )}

      {/* 映射过程中被留空/截断的东西，比上面的 warnings 更具体 */}
      {draft.issues.length > 0 && (
        <View className='ocr-note-group'>
          <Text className='ocr-note-title'>这些要你补一下</Text>
          {draft.issues.map((issue) => (
            <Text key={issue} className='ocr-note'>
              · {issue}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
};

export default OcrTablePreview;
