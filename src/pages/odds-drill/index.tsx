import React from 'react';
import { Input, Text, View } from '@tarojs/components';
import { Button } from '@nutui/nutui-react-taro';
import { useRequireAuth } from '../../components';
import FilterTabs from '../../components/FilterTabs';
import PageHeader from '../../components/PageHeader';
import PageLayout from '../../components/PageLayout';
import { docPercent, formatPercent, fractionLabel } from '../../utils/potOdds';
import type { Drill, DrillKind } from '../../utils/oddsDrill';
import { accuracyOf, formatSeconds } from '../../utils/oddsDrillProgress';
import {
  AVAILABLE_DIFFICULTIES,
  DIFFICULTY_LABEL,
  useOddsDrill,
} from './useOddsDrill';
import './index.less';

const DIFFICULTY_TABS = AVAILABLE_DIFFICULTIES.map((value) => ({
  value,
  label: DIFFICULTY_LABEL[value],
}));

const KIND_LABEL: Record<DrillKind, string> = {
  'face-bet': '面对下注',
  'after-raise': '加注之后',
  'outs-to-equity': '听牌换算',
  'max-call': '反查可跟尺度',
  'call-or-fold': '这个跟注对吗',
};

/** 题型展示顺序。累计里只列答过的那些 */
const KIND_ORDER: DrillKind[] = [
  'face-bet',
  'after-raise',
  'outs-to-equity',
  'max-call',
  'call-or-fold',
];

/** 选项/答案的文案：反查题是档位，其余是百分比 */
function valueText(drill: Drill, value: number): string {
  return drill.answerKind === 'fraction'
    ? fractionLabel(value)
    : `${docPercent(value)}%`;
}

/** 正确答案的完整说法，解释卡与答错提示共用 */
function correctText(drill: Drill): string {
  if (drill.answerKind === 'fraction') return fractionLabel(drill.expected);
  if (drill.answerKind === 'verdict') {
    return drill.verdict === 'call' ? '该跟注' : '该弃牌';
  }
  return `${docPercent(drill.expected)}%（精确 ${formatPercent(drill.expected)}）`;
}

/** 用户选了什么的说法 */
function pickedText(drill: Drill, picked: number): string {
  if (drill.answerKind === 'fraction') return fractionLabel(picked);
  if (drill.answerKind === 'verdict') return picked === 1 ? '跟注' : '弃牌';
  return `${docPercent(picked)}%`;
}

/**
 * 赔率快速训练页。
 *
 * 练的是 odds-table.md 里的算术（门槛、加注后的门槛、听牌换算、反查、判断），
 * 答案与教练说的话同源 —— 数值口径见 赔率训练设计文档.md §2，
 * 正确性由 `npm run check:odds` 常驻守着
 */
const OddsDrillPage: React.FC = () => {
  const { isAuthenticated } = useRequireAuth();
  const {
    current,
    difficulty,
    drillsTotal,
    index,
    isLast,
    picked,
    grade,
    answered,
    finished,
    stats,
    isFillIn,
    isRetry,
    avgMs,
    wrongInSet,
    progress,
    draft,
    setDraft,
    draftInvalid,
    submitDraft,
    accuracy,
    answer,
    next,
    restart,
    retryWrong,
    changeDifficulty,
  } = useOddsDrill();

  if (!isAuthenticated) return <View />;

  // 小结：本组表现 + 错题 + 累计
  if (finished) {
    const studiedKinds = KIND_ORDER.filter((kind) => (progress.byKind[kind]?.total ?? 0) > 0);

    return (
      <PageLayout
        className='odds-drill-page'
        contentClassName='odds-drill-content'
        header={<PageHeader title='赔率快速训练' showBack />}
        bottom={
          <View className='page-footer footer-stack'>
            {progress.wrong.length > 0 && (
              <Button
                type='primary'
                block
                onClick={retryWrong}
                data-testid='btn-retry-wrong'
              >
                {/* 按钮重练的是**累计**错题，所以数也要用累计的 ——
                    用本组的数量会在「以前还错着别的题」时骗人 */}
                重练错题（共 {progress.wrong.length} 道）
              </Button>
            )}
            <Button
              block
              type={wrongInSet.length > 0 ? 'default' : 'primary'}
              onClick={restart}
              data-testid='btn-drill-restart'
            >
              再来一组
            </Button>
          </View>
        }
      >
        <View className='summary-card' data-testid='drill-summary'>
          <Text className='summary-title'>本组完成</Text>
          <Text className='summary-sub'>
            {isRetry ? '错题重练' : `${DIFFICULTY_LABEL[difficulty]}档`} · 共 {drillsTotal} 题
          </Text>

          <View className='summary-grid'>
            <View className='summary-item'>
              <Text className='summary-value'>{accuracy}%</Text>
              <Text className='summary-label'>正确率</Text>
            </View>
            <View className='summary-item'>
              <Text className='summary-value'>
                {stats.correct}/{drillsTotal}
              </Text>
              <Text className='summary-label'>答对</Text>
            </View>
            <View className='summary-item'>
              <Text className='summary-value'>{stats.bestStreak}</Text>
              <Text className='summary-label'>最高连击</Text>
            </View>
            <View className='summary-item'>
              <Text className='summary-value'>{formatSeconds(avgMs)}</Text>
              <Text className='summary-label'>平均用时(秒)</Text>
            </View>
          </View>
        </View>

        {wrongInSet.length > 0 && (
          <View className='list-card' data-testid='drill-wrong-list'>
            <Text className='card-title'>本组错题 {wrongInSet.length} 道</Text>
            {wrongInSet.map((item) => (
              <View className='list-row' key={item.drill.prompt}>
                <Text className='list-row-title'>{item.drill.prompt}</Text>
                <Text className='list-row-sub'>
                  你答 {pickedText(item.drill, item.input)} ｜ 正确{' '}
                  {correctText(item.drill)}
                </Text>
              </View>
            ))}
            <Text className='card-hint'>
              下面的「重练错题」会把累计还没答对的题原样再出一遍；
              答对之后这些题就自动从错题里出列
            </Text>
          </View>
        )}

        <View className='list-card' data-testid='drill-total'>
          <Text className='card-title'>累计</Text>
          <View className='summary-grid'>
            <View className='summary-item'>
              <Text className='summary-value'>{progress.total}</Text>
              <Text className='summary-label'>总题数</Text>
            </View>
            <View className='summary-item'>
              <Text className='summary-value'>{accuracyOf(progress)}%</Text>
              <Text className='summary-label'>总正确率</Text>
            </View>
            <View className='summary-item'>
              <Text className='summary-value'>{progress.bestStreak}</Text>
              <Text className='summary-label'>历史最高连击</Text>
            </View>
          </View>

          {studiedKinds.length > 0 && (
            <View className='kind-rows'>
              {studiedKinds.map((kind) => {
                const stat = progress.byKind[kind];
                const rate = Math.round((stat.correct / stat.total) * 100);
                return (
                  <View className='kind-row' key={kind}>
                    <Text className='kind-name'>{KIND_LABEL[kind]}</Text>
                    <Text className='kind-value'>
                      {rate}%（{stat.correct}/{stat.total}）
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {progress.wrong.length > 0 && (
            <Text className='card-hint'>
              还有 {progress.wrong.length} 道题没答对过，会一直留在错题里
            </Text>
          )}
        </View>

        <View className='tip-card'>
          <Text className='tip-title'>这组题练的是什么</Text>
          <Text className='tip-text'>
            门槛 = 跟注额 ÷ 跟注后的底池。记住几个锚点就够用了：
            1/3 池 → 20%、1/2 池 → 25%、1 倍池 → 33%、2 倍池 → 40%。
            下注再大也只趋近 50%，永远到不了一半
          </Text>
        </View>

        <View className='bottom-space' />
      </PageLayout>
    );
  }

  const needsDraft = isFillIn && !answered;

  return (
    <PageLayout
      className='odds-drill-page'
      contentClassName='odds-drill-content'
      header={<PageHeader title='赔率快速训练' showBack />}
      bottom={
        <View className='page-footer'>
          <Button
            type='primary'
            block
            disabled={!answered && !needsDraft}
            onClick={needsDraft ? submitDraft : next}
            data-testid={needsDraft ? 'btn-submit-drill' : 'btn-next-drill'}
          >
            {needsDraft ? '确认' : isLast ? '看小结' : '下一题'}
          </Button>
        </View>
      }
    >
      {/* 重练错题时不显示难度切换：这一组是按错题拼的，与档位无关 */}
      {isRetry ? (
        <View className='retry-banner'>
          <Text className='retry-text'>错题重练 · 共 {drillsTotal} 题</Text>
          <Text className='retry-tap' onClick={restart} data-testid='btn-quit-retry'>
            退出重练
          </Text>
        </View>
      ) : (
        <View className='difficulty-row'>
          <FilterTabs
            tabs={DIFFICULTY_TABS}
            activeValue={difficulty}
            onChange={changeDifficulty}
          />
        </View>
      )}

      <View className='progress-card' data-testid='drill-progress'>
        <View className='progress-head'>
          <Text className='progress-index'>
            第 {index + 1}/{drillsTotal} 题
          </Text>
          <Text className='progress-streak'>连击 {stats.streak}</Text>
          <Text className='progress-accuracy'>正确率 {accuracy}%</Text>
        </View>
        <View className='progress-track'>
          <View
            className='progress-fill'
            style={{ width: `${((index + 1) / drillsTotal) * 100}%` }}
          />
        </View>
      </View>

      <View className='question-card'>
        <Text className='question-kind'>{KIND_LABEL[current.kind]}</Text>
        <Text className='question-prompt' data-testid='drill-prompt'>
          {current.prompt}
        </Text>
      </View>

      {/* 选择题：一键作答，练的是条件反射 */}
      {current.choices.length > 0 && (
        <View className='choice-grid'>
          {current.choices.map((choice, choiceIndex) => {
            const isPicked = picked === choice;
            const isAnswer =
              current.answerKind === 'fraction'
                ? Math.abs(choice - current.expected) < 1e-9
                : Math.abs(choice - current.expected) <= current.tolerance;
            // 答完之后才染色：选错时同时标出自己选的和正确的那个
            const state = !answered
              ? ''
              : isAnswer
                ? 'correct'
                : isPicked
                  ? 'wrong'
                  : 'dim';
            return (
              <View
                key={choice}
                className={`choice-item ${state}`}
                onClick={() => answer(choice)}
                data-testid={`choice-${choiceIndex}`}
              >
                <Text className='choice-text'>{valueText(current, choice)}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* 判断题：两个按钮，考的是「够不够跟」这个结论 */}
      {current.answerKind === 'verdict' && (
        <View className='verdict-choices'>
          {[
            { label: '跟注', value: 1, testId: 'verdict-call' },
            { label: '弃牌', value: 0, testId: 'verdict-fold' },
          ].map((option) => {
            const isPicked = picked === option.value;
            const isAnswer = current.expected === option.value;
            const state = !answered
              ? ''
              : isAnswer
                ? 'correct'
                : isPicked
                  ? 'wrong'
                  : 'dim';
            return (
              <View
                key={option.label}
                className={`choice-item ${state}`}
                onClick={() => answer(option.value)}
                data-testid={option.testId}
              >
                <Text className='choice-text'>{option.label}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* 填空题：进阶档考公式本身，不再给选项 */}
      {isFillIn && (
        <View className='fill-card'>
          <View className={`input-box ${draftInvalid ? 'invalid' : ''}`}>
            <Input
              className='input'
              type='digit'
              value={draft}
              disabled={answered}
              placeholder='例如 20'
              onInput={(e) => setDraft(e.detail.value)}
              data-testid='input-drill-answer'
            />
            <Text className='unit'>%</Text>
          </View>
          <Text className='fill-hint'>填百分比即可，比如 20 或 20%</Text>
        </View>
      )}

      {answered && grade && picked !== null && (
        <View className='explain-card' data-testid='drill-steps'>
          <View className={`verdict ${grade.correct ? 'correct' : 'wrong'}`}>
            <Text className='verdict-text' data-testid='drill-verdict'>
              {grade.correct ? '✅ 答对了' : '❌ 答错了'}
            </Text>
            <Text className='verdict-answer'>正确 {correctText(current)}</Text>
          </View>

          {!grade.correct && (
            <Text className='verdict-note'>
              你选了 {pickedText(current, picked)}
              {current.answerKind === 'equity' &&
                `，差了 ${Math.abs(grade.deltaPercent).toFixed(1)} 个百分点`}
            </Text>
          )}

          {grade.correct &&
            current.answerKind === 'equity' &&
            Math.abs(grade.delta) > 1e-9 && (
              <Text className='verdict-note'>
                与精确值差 {Math.abs(grade.deltaPercent).toFixed(1)} 个百分点，
                在容差内 —— 口诀记的就是取整后的数
              </Text>
            )}

          <View className='steps'>
            {current.steps.map((step) => (
              <Text key={step} className='step-line'>
                {step}
              </Text>
            ))}
          </View>
        </View>
      )}

      <View className='tip-card'>
        <Text className='tip-title'>口径说明</Text>
        <Text className='tip-text'>
          这里给的是纯概率算术：不计抽水、不算隐含赔率、不读对手范围。
          真实决策还要看对手的加注范围，别只凭门槛就多跟
        </Text>
      </View>

      <View className='bottom-space' />
    </PageLayout>
  );
};

export default OddsDrillPage;
