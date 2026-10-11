// 独立对拍：手牌对 3 名随机对手的胜率（平局均分）
// 最强的不变量：169 个类按组合数加权的平均胜率必须 = 25%（四人平权）

import { evaluate } from './evaluator';
import { createRng } from './rng';
import { allStartingHands } from './range';

const rng = createRng(20241009);
const specs = allStartingHands();
const N = 120000;

let weighted = 0;
let totalCombos = 0;
const out: { key: string; eq: number }[] = [];

for (const spec of specs) {
  let pts = 0;
  for (let s = 0; s < N; s += 1) {
    const pair = spec.pairs[rng.int(spec.pairs.length)];
    const h1 = pair[0];
    const h2 = pair[1];
    const pool: number[] = [];
    for (let c = 0; c < 52; c += 1) if (c !== h1 && c !== h2) pool.push(c);

    const drawn: number[] = [];
    while (drawn.length < 11) {
      const c = pool[rng.int(pool.length)];
      if (drawn.indexOf(c) < 0) drawn.push(c);
    }
    const board = [drawn[6], drawn[7], drawn[8], drawn[9], drawn[10]];
    const hero = evaluate([h1, h2, ...board]);

    let beaten = false;
    let tie = 1;
    for (let k = 0; k < 3; k += 1) {
      const opp = evaluate([drawn[k * 2], drawn[k * 2 + 1], ...board]);
      if (opp > hero) {
        beaten = true;
        break;
      }
      if (opp === hero) tie += 1;
    }
    pts += beaten ? 0 : 1 / tie;
  }
  const eq = pts / N;
  out.push({ key: spec.key, eq });
  weighted += eq * spec.pairs.length;
  totalCombos += spec.pairs.length;
}

for (const key of ['AA', 'KK', 'QQ', 'AKs', 'AKo', 'T9s', '72o', '32o']) {
  const hit = out.find((o) => o.key === key);
  if (hit) console.log(`${key}\t${(hit.eq * 100).toFixed(2)}%`);
}
console.log(`\n全部 169 类按组合数加权平均胜率 = ${((weighted / totalCombos) * 100).toFixed(3)}%  (必须 = 25.000%)`);
