// ============================================
// 可复现的伪随机数与洗牌
//
// 模拟必须可复现：同一个种子要给出同一批牌，否则"换个参数再跑一遍"就没法比较，
// 差异里会混进发牌的运气。用 mulberry32 —— 32 位状态、无依赖、质量足够，
// 这里只是抽样，不需要密码学强度
// ============================================

export interface Rng {
  /** [0, 1) */
  next(): number;
  /** [0, n) 的整数 */
  int(n: number): number;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n: number) => Math.floor(next() * n),
  };
}

/** 洗一副 52 张的牌（Fisher-Yates），返回牌 id 数组 */
export function shuffledDeck(rng: Rng): number[] {
  const deck: number[] = [];
  for (let i = 0; i < 52; i += 1) deck.push(i);
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = rng.int(i + 1);
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }
  return deck;
}

/**
 * 从数组里按值删掉一张牌。
 * 只在开局时对 ≤52 个元素调用，`indexOf` + `splice` 的线性代价可以忽略
 */
export function removeCard(pool: number[], card: number): void {
  const idx = pool.indexOf(card);
  if (idx >= 0) pool.splice(idx, 1);
}
