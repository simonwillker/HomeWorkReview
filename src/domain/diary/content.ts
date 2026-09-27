// 書き方のくふう（内容表达）。
// まちがいさがしではなく、「できているところ」をまずほめて、つぎに一つずつくふうを教える。

import { splitSentences } from './grammar';
import type { DiaryFinding } from './types';

const FEELING =
  /(たのし|楽し|うれし|嬉し|かなし|悲し|くやし|悔し|びっくり|おどろ|驚|どきどき|わくわく|はずかし|恥ずかし|ほっと|こわ|怖|おもしろ|面白|すごい|うれしく|きんちょう|緊張|ふしぎ|不思議|しんぱい|心配|さびし|寂し)/;
const REASON = /(なぜなら|から|ので|ため|りゆう|理由|おかげ)/;
const WHEN = /(きょう|今日|きのう|昨日|あさ|朝|ひる|昼|よる|夜|ばん|晩|ゆうがた|夕方|午前|午後|きゅうけい|休み時間|放課後|\d+時|土よう|日よう|曜日|しゅうまつ|週末|夏休み|冬休み|春休み)/;
const WHERE =
  /(学校|がっこう|きょうしつ|教室|校庭|こうてい|公園|こうえん|家|うち|へや|部屋|図書館|としょかん|体育館|たいいくかん|プール|海|山|川|駅|えき|スーパー|店|みせ|びょういん|病院|バス|電車|でんしゃ|グラウンド|運動場)/;
const WHO =
  /(友だち|友達|ともだち|お母さん|おかあさん|母|お父さん|おとうさん|父|先生|せんせい|妹|いもうと|弟|おとうと|お兄さん|おにいさん|兄|お姉さん|おねえさん|姉|おじいちゃん|おばあちゃん|みんな|クラス|チーム|家族|かぞく|[ぁ-んァ-ヶ一-龠]{1,4}(さん|くん|ちゃん))/;
const SENSES: Array<[RegExp, string]> = [
  [/(見|み)(た|て|える|えた)/, '見たこと'],
  [/(音|こえ|声|聞こえ|きこえ)/, '聞いたこと'],
  [/(におい|匂い|香り)/, 'においのこと'],
  [/(あじ|味|おいし|甘|あま|からい)/, '味のこと'],
  [/(さわ|触|つめたい|冷た|あたたか|温か|やわらか)/, 'さわったかんじ'],
];
const REPEATED = ['そして', 'それから', 'でも', 'とても', 'すごく', 'つぎに'];

export function checkContent(text: string): DiaryFinding[] {
  const out: DiaryFinding[] = [];
  const good: DiaryFinding[] = [];
  const body = text.replace(/\s/g, '');
  const sentences = splitSentences(text);

  // できているところ（まずほめる）
  if (body.length >= 200) {
    good.push({
      id: 'content-good-length',
      category: 'content',
      severity: 'good',
      titleJa: `${body.length}字も書けたね`,
      detailJa: 'これだけ書けると、読む人にそのときのことがよくつたわるよ。',
      noteZh: `全文 ${body.length} 字，篇幅充分。`,
    });
  }
  if (text.includes('「') && text.includes('」')) {
    good.push({
      id: 'content-good-quote',
      category: 'content',
      severity: 'good',
      titleJa: '話したことばが書けているね',
      detailJa: '「」でそのときのことばを書くと、読む人がその場にいるみたいに感じられるよ。',
      noteZh: '有引用对话，画面感强。',
    });
  }
  if (FEELING.test(text)) {
    good.push({
      id: 'content-good-feeling',
      category: 'content',
      severity: 'good',
      titleJa: '気もちが書けているね',
      detailJa: 'したことだけでなく、そのとき自分がどう思ったかが書けているのがいいところだよ。',
      noteZh: '写出了心情感受。',
    });
  }
  const senses = SENSES.filter(([re]) => re.test(text));
  if (senses.length >= 2) {
    good.push({
      id: 'content-good-senses',
      category: 'content',
      severity: 'good',
      titleJa: `${senses.map(([, n]) => n).join('と')}が書けているね`,
      detailJa: '目で見たこと、耳で聞いたことなどをまぜて書くと、読む人がその場のようすを思いうかべられるよ。',
      noteZh: `用了多种感官描写（${senses.map(([, n]) => n).join('、')}）。`,
    });
  }
  if (/\d/.test(text) || /(一|二|三|四|五|六|七|八|九|十)[つ人回本台こ]/.test(text)) {
    good.push({
      id: 'content-good-number',
      category: 'content',
      severity: 'good',
      titleJa: '数を書いてくわしくできているね',
      detailJa: '「3回」「5人」のように数を書くと、どれくらいかがはっきりつたわるよ。',
      noteZh: '用具体数字使描写更清晰。',
    });
  }

  // くふうできるところ
  if (body.length > 0 && body.length < 80) {
    out.push({
      id: 'content-short',
      category: 'content',
      severity: 'idea',
      titleJa: 'もう少しくわしく書いてみよう',
      detailJa: `いまは${body.length}字だよ。「いつ・どこで・だれと・何をした」をそろえて、いちばん心にのこったことを2文ふやすだけで、ぐっと読みたくなる日記になるよ。`,
      noteZh: `目前 ${body.length} 字，建议补充「何时·何地·和谁·做了什么」。`,
    });
  }
  if (!WHEN.test(text)) {
    out.push({
      id: 'content-when',
      category: 'content',
      severity: 'idea',
      titleJa: '「いつ」のことか書こう',
      detailJa: '「きょうの朝」「きゅうけいの時間に」のように、いつのことかをはじめに書くと、読む人がすぐに分かるよ。',
      noteZh: '建议写明时间。',
    });
  }
  if (!WHERE.test(text)) {
    out.push({
      id: 'content-where',
      category: 'content',
      severity: 'idea',
      titleJa: '「どこで」のことか書こう',
      detailJa: '「校庭で」「家のだいどころで」のように場所を書くと、ようすが思いうかべやすくなるよ。',
      noteZh: '建议写明地点。',
    });
  }
  if (!WHO.test(text)) {
    out.push({
      id: 'content-who',
      category: 'content',
      severity: 'idea',
      titleJa: '「だれと」いたのか書こう',
      detailJa: '「友だちの〇〇さんと」のように、いっしょにいた人を書くと、話がぐっと生き生きするよ。',
      noteZh: '建议写明同行的人。',
    });
  }
  if (!text.includes('「')) {
    out.push({
      id: 'content-quote',
      category: 'content',
      severity: 'idea',
      titleJa: '話したことばを入れてみよう',
      detailJa: 'そのとき言ったことや、言われたことを「」の中に書いてみよう。たとえば 先生が「よくできたね」と言ってくれた。のように書くと、読む人がその場面を見ているように感じるよ。',
      noteZh: '建议加入对话（「」），更有现场感。',
    });
  }
  if (!FEELING.test(text)) {
    out.push({
      id: 'content-feeling',
      category: 'content',
      severity: 'idea',
      titleJa: '自分の気もちを書こう',
      detailJa: 'したことだけでなく、「うれしかった」「くやしかった」など、そのとき心の中でどう思ったかを書くと、日記らしくなるよ。',
      noteZh: '建议补充当时的心情。',
    });
  } else if (!REASON.test(text)) {
    out.push({
      id: 'content-reason',
      category: 'content',
      severity: 'idea',
      titleJa: 'どうしてそう思ったのかも書こう',
      detailJa: '「〜だから、うれしかった」「なぜなら〜」のように、そう思ったわけを書くと、読む人が気もちをいっしょに感じられるよ。',
      noteZh: '建议写出心情的原因。',
    });
  }
  for (const w of REPEATED) {
    const n = (text.match(new RegExp(w, 'g')) ?? []).length;
    if (n >= 3) {
      const at = text.indexOf(w);
      out.push({
        id: `content-repeat-${w}`,
        category: 'content',
        severity: 'idea',
        start: at,
        end: at + w.length,
        quote: w,
        titleJa: `「${w}」が${n}回出てくるよ`,
        detailJa: `同じ言葉がつづくと、たんたんとした感じになるよ。「それから」「つぎに」「そのあと」など、べつの言い方にかえてみよう。`,
        noteZh: `「${w}」重复 ${n} 次，建议换用其他说法。`,
      });
      break;
    }
  }
  const last = sentences[sentences.length - 1]?.text ?? '';
  if (/^(楽しかった|たのしかった|おもしろかった|よかった)。?$/.test(last.trim())) {
    out.push({
      id: 'content-ending',
      category: 'content',
      severity: 'idea',
      start: text.length - last.length,
      end: text.length,
      quote: last,
      titleJa: 'さいごをもう一歩くわしく',
      detailJa: `さいごが「${last.trim()}」だけになっているよ。「どこがどう楽しかったのか」「つぎはどうしたいか」を一文たすと、読んだ人が「よかったね」と言いたくなる終わりになるよ。`,
      noteZh: '结尾过于笼统，建议补一句具体感受或下次的打算。',
    });
  }
  if (sentences.length >= 2 && sentences.filter((s) => /^(ぼく|僕|わたし|私)は/.test(s.text)).length >= 3) {
    out.push({
      id: 'content-same-start',
      category: 'content',
      severity: 'idea',
      titleJa: '文のはじまりを変えてみよう',
      detailJa: '「ぼくは」「わたしは」で始まる文がつづいているよ。「朝、〜」「そのとき、〜」のように、はじまりを変えると読みやすくなるんだ。',
      noteZh: '多句以「ぼくは／わたしは」开头，建议变换句首。',
    });
  }

  return [...good.slice(0, 3), ...out];
}
