// 文のきまりと「、」「。」（文法与标点）。
// 小学校で習うきまりだけを見る。「主語と述語のねじれ」のような、読まないと分からないことは見ない。

import type { DiaryFinding } from './types';

/** 文に分ける（。！？で切る。「」の中は切らない） */
export function splitSentences(text: string): Array<{ text: string; start: number }> {
  const out: Array<{ text: string; start: number }> = [];
  let buf = '';
  let start = 0;
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '「') inQuote = true;
    if (ch === '」') inQuote = false;
    buf += ch;
    const isEnd = !inQuote && (ch === '。' || ch === '！' || ch === '?' || ch === '？' || ch === '!' || ch === '\n');
    if (isEnd) {
      const t = buf.trim();
      if (t) out.push({ text: t, start });
      buf = '';
      start = i + 1;
    }
  }
  const t = buf.trim();
  if (t) out.push({ text: t, start });
  return out;
}

const POLITE = /(です|ます|でした|ました|ません|ですか|ましょう)[。！？!?」]*$/;
const PLAIN = /(だ|だった|た|る|う|い|よ|ね|ない|かった)[。！？!?」]*$/;

export function checkGrammar(text: string): DiaryFinding[] {
  const out: DiaryFinding[] = [];
  const lines = text.split('\n');

  // 1. 文のおわりの「。」
  let offset = 0;
  for (const line of lines) {
    const trimmed = line.trimEnd();
    const last = trimmed.slice(-1);
    if (trimmed.length >= 5 && last && !'。！？!?」）)…'.includes(last)) {
      const at = offset + trimmed.length;
      out.push({
        id: `grammar-kuten-${at}`,
        category: 'grammar',
        severity: 'fix',
        start: Math.max(0, at - 6),
        end: at,
        quote: trimmed.slice(-6),
        titleJa: '文のおわりに「。」をつけよう',
        detailJa: `「${trimmed.slice(-6)}」のあとに「。」がないよ。文のおわりには、かならず「。」（まる）をつけるきまりだよ。`,
        noteZh: '句末缺少句号「。」。',
        fix: { from: trimmed.slice(-6), to: `${trimmed.slice(-6)}。` },
      });
      if (out.length >= 3) break;
    }
    offset += line.length + 1;
  }

  // 2. 「，」「．」「,」「.」を使っている
  const comma = /[,\.，．]/g;
  const cm = comma.exec(text);
  if (cm) {
    const wrong = cm[0];
    const right = ',，'.includes(wrong) ? '、' : '。';
    out.push({
      id: 'grammar-punct-style',
      category: 'grammar',
      severity: 'fix',
      start: cm.index,
      end: cm.index + 1,
      quote: text.slice(Math.max(0, cm.index - 4), cm.index + 2),
      titleJa: `「${wrong}」ではなく「${right}」`,
      detailJa: `日本語の文では、点は「、」、まるは「。」を使うよ。「${wrong}」は算数や英語で使う記号なんだ。`,
      noteZh: '日文标点用「、」「。」，不用半角/中文逗号句号。',
      fix: { from: wrong, to: right },
    });
  }

  // 3. かぎかっこの数が合わない
  const open = (text.match(/「/g) ?? []).length;
  const close = (text.match(/」/g) ?? []).length;
  if (open !== close) {
    out.push({
      id: 'grammar-quote-pair',
      category: 'grammar',
      severity: 'fix',
      titleJa: 'かぎかっこが数えてみるとあわないよ',
      detailJa: `「が${open}こ、」が${close}こあるよ。話したことばを書くときは「」で、はじめと終わりを両方つけよう。`,
      noteZh: `「」数量不匹配（${open} / ${close}），引号需成对。`,
    });
  }

  const sentences = splitSentences(text);

  // 4. 長い文・点が一つもない文
  for (const s of sentences) {
    const body = s.text.replace(/\s/g, '');
    if (body.length >= 60) {
      out.push({
        id: `grammar-long-${s.start}`,
        category: 'grammar',
        severity: 'idea',
        start: s.start,
        end: s.start + s.text.length,
        quote: s.text.slice(0, 20) + '…',
        titleJa: '一つの文が長いよ',
        detailJa: `この文は${body.length}字あるよ。長い文は読みにくいので、「。」で二つに分けるか、区切りに「、」を入れてみよう。`,
        noteZh: `该句 ${body.length} 字，建议拆成两句或加「、」。`,
      });
    } else if (body.length >= 35 && !body.includes('、')) {
      out.push({
        id: `grammar-noten-${s.start}`,
        category: 'grammar',
        severity: 'idea',
        start: s.start,
        end: s.start + s.text.length,
        quote: s.text.slice(0, 20) + '…',
        titleJa: '「、」を入れると読みやすいよ',
        detailJa: 'この文には「、」がないよ。言葉の切れ目に「、」を入れると、読む人が息をつげて分かりやすくなるんだ。',
        noteZh: '较长的句子里没有「、」，建议在停顿处加逗号。',
      });
    }
    if (out.length >= 6) break;
  }

  // 5. 「です・ます」と「だ・である」がまざっている
  const polite = sentences.filter((s) => POLITE.test(s.text));
  const plain = sentences.filter((s) => !POLITE.test(s.text) && PLAIN.test(s.text));
  if (sentences.length >= 3 && polite.length > 0 && plain.length > 0) {
    const fewer = polite.length <= plain.length ? polite[0] : plain[0];
    const keep = polite.length > plain.length ? '「〜です」「〜ます」' : '「〜だ」「〜た」';
    out.push({
      id: 'grammar-style-mix',
      category: 'grammar',
      severity: 'check',
      start: fewer.start,
      end: fewer.start + fewer.text.length,
      quote: fewer.text.slice(0, 20),
      titleJa: '文のおわりの形をそろえよう',
      detailJa: `「〜です・〜ます」でおわる文が${polite.length}こ、「〜だ・〜た」でおわる文が${plain.length}こあるよ。日記はどちらか一つにそろえると読みやすいんだ。多いほうの${keep}にそろえてみよう。`,
      noteZh: `敬体 ${polite.length} 句、常体 ${plain.length} 句混用，建议统一。`,
    });
  }

  // 6. 「〜たり」が一つだけ
  for (const s of sentences) {
    const tari = (s.text.match(/たり/g) ?? []).length;
    if (tari === 1) {
      out.push({
        id: `grammar-tari-${s.start}`,
        category: 'grammar',
        severity: 'check',
        start: s.start,
        end: s.start + s.text.length,
        quote: s.text.slice(0, 20),
        titleJa: '「〜たり」は二つセットで使うよ',
        detailJa: '「走ったり、とんだりした」のように、「〜たり」は二回ならべて使うきまりだよ。一つだけのときは「〜して」にかえてもいいよ。',
        noteZh: '「〜たり」通常成对使用。',
      });
      break;
    }
  }

  // 7. 文のはじめの「なので」
  const nanode = /(^|[。\n])なので/.exec(text);
  if (nanode) {
    const at = nanode.index + nanode[1].length;
    out.push({
      id: 'grammar-nanode',
      category: 'grammar',
      severity: 'check',
      start: at,
      end: at + 3,
      quote: 'なので',
      titleJa: '文のはじめは「だから」',
      detailJa: '文のはじめに「なので」を使うのは話し言葉だよ。書くときは「だから」「そのため」を使おう。',
      noteZh: '句首的「なので」是口语，书面用「だから」。',
      fix: { from: 'なので', to: 'だから' },
    });
  }

  // 8. だんらく
  const body = text.replace(/\s/g, '');
  if (body.length >= 200 && !text.includes('\n')) {
    out.push({
      id: 'grammar-paragraph',
      category: 'grammar',
      severity: 'idea',
      titleJa: '話がかわるところで行をかえよう',
      detailJa: `${body.length}字が一つのかたまりになっているよ。「朝のこと」「そのあとのこと」のように話がかわるところで行をかえると、ぐっと読みやすくなるんだ。`,
      noteZh: '全文没有分段，建议在话题转换处换行。',
    });
  }

  // 9. ほめる
  if (text.includes('、') && /[。]/.test(text)) {
    out.push({
      id: 'grammar-good-punct',
      category: 'grammar',
      severity: 'good',
      titleJa: '「、」と「。」が使えているね',
      detailJa: '点とまるを正しく使えていると、読む人がとても読みやすいよ。',
      noteZh: '逗号句号使用正确。',
    });
  }
  return out;
}
