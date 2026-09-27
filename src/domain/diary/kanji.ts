// 小学校で習った漢字の書き方（小学已学汉字的写法）。
//
// ここで見られること / 見られないこと（画面にも同じことを書いてある）:
//   見られる   どの漢字を使ったか、その字を習うのは何年生か、ひらがなのままの言葉を漢字で書けるか
//   見られない 字の形そのもの（とめ・はね・はらい・画数）。これは写真を目で見ないと分からない。
//              だから、まちがえやすい形の字を使っているときは「写真とくらべてね」と声をかける。

import { gradeOfKanji, gradeOfWord, type SchoolGrade } from './kanjiGrades';
import type { DiaryFinding } from './types';

/**
 * ひらがなで書いてあるけれど、漢字で書ける言葉。
 * 読み方が一つに決まる言葉だけを入れる（「はやく」＝早く/速く のように迷うものは入れない）。
 * 目あては「漢字にしなさい」ではなく「もう習った字だよ」と気づかせること。
 */
export const KANA_TO_KANJI: Array<[string, string]> = [
  ['がっこう', '学校'],
  ['きょうしつ', '教室'],
  ['こうてい', '校庭'],
  ['としょかん', '図書館'],
  ['たいいくかん', '体育館'],
  ['きゅうしょく', '給食'],
  ['せんせい', '先生'],
  ['ともだち', '友だち'],
  ['おんがく', '音楽'],
  ['さんすう', '算数'],
  ['こくご', '国語'],
  ['しゃかい', '社会'],
  ['たいいく', '体育'],
  ['うんどうかい', '運動会'],
  ['えんそく', '遠足'],
  ['しゅくだい', '宿題'],
  ['べんきょう', '勉強'],
  ['はっぴょう', '発表'],
  ['れんしゅう', '練習'],
  ['しあい', '試合'],
  ['きょうかしょ', '教科書'],
  ['こうえん', '公園'],
  ['でんしゃ', '電車'],
  ['じてんしゃ', '自転車'],
  ['びょういん', '病院'],
  ['へや', '部屋'],
  ['かぞく', '家族'],
  ['きょうだい', '兄弟'],
  ['いもうと', '妹'],
  ['おとうと', '弟'],
  ['おかあさん', 'お母さん'],
  ['おとうさん', 'お父さん'],
  ['おねえさん', 'お姉さん'],
  ['おにいさん', 'お兄さん'],
  ['きょう', '今日'],
  ['きのう', '昨日'],
  ['あした', '明日'],
  ['まいにち', '毎日'],
  ['じかん', '時間'],
  ['ごぜん', '午前'],
  ['てんき', '天気'],
  ['きもち', '気持ち'],
  ['たいせつ', '大切'],
  ['じぶん', '自分'],
  ['ほんとう', '本当'],
  ['さいしょ', '最初'],
  ['ぜんぶ', '全部'],
  ['はんぶん', '半分'],
  ['ばしょ', '場所'],
  ['やさい', '野菜'],
  ['ぎゅうにゅう', '牛乳'],
  ['てがみ', '手紙'],
  ['ゆうがた', '夕方'],
  ['かいだん', '階段'],
  ['たべた', '食べた'],
  ['たべて', '食べて'],
  ['たべる', '食べる'],
  ['のんだ', '飲んだ'],
  ['あそんだ', '遊んだ'],
  ['あそんで', '遊んで'],
  ['はなした', '話した'],
  ['おもった', '思った'],
  ['かんがえた', '考えた'],
  ['おしえて', '教えて'],
  ['おぼえた', '覚えた'],
  ['わらった', '笑った'],
  ['つくった', '作った'],
  ['もって', '持って'],
  ['たのしかった', '楽しかった'],
  ['おもしろかった', '面白かった'],
  ['かなしかった', '悲しかった'],
  ['さむかった', '寒かった'],
];

/** 形がにていてまちがえやすい漢字。キーの字を使っていたら、にている字とくらべるように言う */
export const LOOKALIKE: Array<[string, string, string]> = [
  ['犬', '大', '右上の点をわすれると「大」になってしまうよ。'],
  ['玉', '王', '「玉」には右下に点があるよ。点がないと「王」だね。'],
  ['貝', '見', '「見」は下が「儿」、「貝」は下が「ハ」の形だよ。'],
  ['草', '早', '「草」は上に「くさかんむり」がつくよ。'],
  ['刀', '力', '「刀」と「力」は形がにているよ。曲がり方を見てね。'],
  ['未', '末', '「未」は上の横線が短く、「末」は上の横線が長いよ。'],
  ['雲', '雪', '「雲」の下は「云」、「雪」の下は「ヨ」だよ。'],
  ['待', '持', '「待」は「ぎょうにんべん（彳）」、「持」は「てへん（扌）」だよ。'],
  ['週', '周', '「週」には「しんにょう（辶）」がつくよ。'],
  ['帰', '歸', '左がわと右下の形をまちがえやすい字だよ。'],
];

/** 画数が多くて形をまちがえやすい漢字 */
export const HARD_SHAPE = '曜顔親遠発飛業議練験質熱様器静難観護警識臓臨警'.split('');

const KANJI_ALL_RE = /[一-鿿]/g;

function countKanji(text: string): { chars: number; kinds: Map<string, number> } {
  const kinds = new Map<string, number>();
  let chars = 0;
  for (const m of text.matchAll(KANJI_ALL_RE)) {
    chars++;
    kinds.set(m[0], (kinds.get(m[0]) ?? 0) + 1);
  }
  return { chars, kinds };
}

export interface KanjiStats {
  kanjiChars: number;
  kanjiKinds: number;
  learnedKinds: number;
  /** その学年ではまだ習わない漢字 */
  laterKanji: string[];
  /** 小学校では習わない漢字 */
  beyondKanji: string[];
}

export function kanjiStats(text: string, grade: SchoolGrade): KanjiStats {
  const { chars, kinds } = countKanji(text);
  const later: string[] = [];
  const beyond: string[] = [];
  let learned = 0;
  for (const ch of kinds.keys()) {
    const g = gradeOfKanji(ch);
    if (!g) beyond.push(ch);
    else if (g > grade) later.push(ch);
    else learned++;
  }
  return { kanjiChars: chars, kanjiKinds: kinds.size, learnedKinds: learned, laterKanji: later, beyondKanji: beyond };
}

const GRADE_JA = ['', '1年生', '2年生', '3年生', '4年生', '5年生', '6年生'];

export function checkKanji(text: string, grade: SchoolGrade): DiaryFinding[] {
  const out: DiaryFinding[] = [];
  const stats = kanjiStats(text, grade);

  // 1. まだ習っていない漢字（書けていること自体はすごいので、まちがい扱いにはしない）
  for (const ch of stats.laterKanji.slice(0, 3)) {
    const g = gradeOfKanji(ch)!;
    const at = text.indexOf(ch);
    out.push({
      id: `kanji-later-${ch}`,
      category: 'kanji',
      severity: 'check',
      start: at,
      end: at + ch.length,
      quote: ch,
      titleJa: `「${ch}」は${GRADE_JA[g]}で習う漢字`,
      detailJa: `「${ch}」を習うのは${GRADE_JA[g]}だよ。もう書けているならすごい！まだならひらがなで書いてもだいじょうぶ。書くときは形をよくたしかめよう。`,
      noteZh: `「${ch}」是${g}年级才学的字。写对了值得表扬，不会写也可以先写假名。`,
    });
  }

  // 2. 小学校では習わない漢字
  for (const ch of stats.beyondKanji.slice(0, 2)) {
    const at = text.indexOf(ch);
    out.push({
      id: `kanji-beyond-${ch}`,
      category: 'kanji',
      severity: 'check',
      start: at,
      end: at + ch.length,
      quote: ch,
      titleJa: `「${ch}」は小学校では習わない漢字`,
      detailJa: `「${ch}」は中学校などで習う漢字だよ。使ってもいいけれど、形があっているか、おうちの人といっしょに写真で見てみよう。`,
      noteZh: `「${ch}」不在小学 1026 字之内，建议对照照片确认写法。`,
    });
  }

  // 3. ひらがなのままだけれど、もう習った漢字で書ける言葉
  const ideas: DiaryFinding[] = [];
  for (const [kana, kanji] of KANA_TO_KANJI) {
    const g = gradeOfWord(kanji);
    if (!g || g > grade) continue; // その学年でまだ習わない字はすすめない
    const at = text.indexOf(kana);
    if (at < 0) continue;
    ideas.push({
      id: `kanji-kana-${kana}`,
      category: 'kanji',
      severity: 'idea',
      start: at,
      end: at + kana.length,
      quote: kana,
      titleJa: `「${kana}」は「${kanji}」と書けるよ`,
      detailJa: `「${kanji}」は${GRADE_JA[g]}までに習う漢字だよ。習った漢字を使うと、読む人が読みやすくなるんだ。`,
      noteZh: `「${kana}」可以写成「${kanji}」（${g}年级以前学过）。`,
      fix: { from: kana, to: kanji },
    });
    if (ideas.length >= 4) break;
  }
  out.push(...ideas);

  // 4. 形をまちがえやすい字を使っているとき（字の形は写真でしか分からないので声かけだけ）
  const hints: DiaryFinding[] = [];
  for (const [ch, similar, tip] of LOOKALIKE) {
    const at = text.indexOf(ch);
    if (at < 0) continue;
    hints.push({
      id: `kanji-shape-${ch}`,
      category: 'kanji',
      severity: 'check',
      start: at,
      end: at + 1,
      quote: ch,
      titleJa: `「${ch}」は「${similar}」とにているよ`,
      detailJa: `${tip}写真の字とくらべて、形があっているかたしかめよう。`,
      noteZh: `「${ch}」与「${similar}」形近，请对照照片确认。`,
    });
    if (hints.length >= 2) break;
  }
  for (const ch of HARD_SHAPE) {
    if (hints.length >= 2) break;
    const at = text.indexOf(ch);
    if (at < 0) continue;
    hints.push({
      id: `kanji-hard-${ch}`,
      category: 'kanji',
      severity: 'check',
      start: at,
      end: at + 1,
      quote: ch,
      titleJa: `「${ch}」は画数が多い漢字`,
      detailJa: `「${ch}」は線の数が多くて、形をまちがえやすい字だよ。写真の字とくらべて、線の数と、はねる・とめるところを見てみよう。`,
      noteZh: `「${ch}」笔画多易写错，请对照照片检查。`,
    });
  }
  out.push(...hints);

  // 5. ほめる
  if (stats.kanjiKinds > 0 && stats.laterKanji.length === 0 && stats.beyondKanji.length === 0) {
    out.push({
      id: 'kanji-good-all-learned',
      category: 'kanji',
      severity: 'good',
      titleJa: `漢字を${stats.kanjiKinds}種類つかえたね`,
      detailJa: `使った漢字はぜんぶ${GRADE_JA[grade]}までに習う漢字だったよ。習った漢字をどんどん使っていこう。`,
      noteZh: `用到的 ${stats.kanjiKinds} 个汉字都在已学范围内。`,
    });
  } else if (stats.learnedKinds >= 5) {
    out.push({
      id: 'kanji-good-count',
      category: 'kanji',
      severity: 'good',
      titleJa: `習った漢字を${stats.learnedKinds}種類つかえたね`,
      detailJa: '習った漢字を使うと、文がぐっと読みやすくなるよ。',
      noteZh: `已学汉字用了 ${stats.learnedKinds} 种。`,
    });
  }
  return out;
}
