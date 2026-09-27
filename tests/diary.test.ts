import { describe, expect, it } from 'vitest';
import {
  applyAllFixes,
  applyFix,
  checkDiary,
  KYOIKU_KANJI_TOTAL,
  splitSentences,
  type DiaryCategory,
  type DiaryFinding,
} from '../src/domain/diary';
import { KANJI_BY_GRADE, gradeOfKanji, gradeOfWord } from '../src/domain/diary/kanjiGrades';
import { KANA_TO_KANJI, LOOKALIKE } from '../src/domain/diary/kanji';
import { TYPO_RULES } from '../src/domain/diary/typos';

const find = (fs: DiaryFinding[], id: string) => fs.filter((f) => f.id.startsWith(id));
const inCategory = (fs: DiaryFinding[], c: DiaryCategory) => fs.filter((f) => f.category === c);

describe('学年別漢字配当表', () => {
  it('学年ごとの字数が告示どおり（合計1026字）', () => {
    const counts = [1, 2, 3, 4, 5, 6].map((g) => [...KANJI_BY_GRADE[g as 1]].length);
    expect(counts).toEqual([80, 160, 200, 202, 193, 191]);
    expect(KYOIKU_KANJI_TOTAL).toBe(1026);
  });

  it('同じ漢字が二つの学年に出てこない', () => {
    const seen = new Set<string>();
    for (const g of [1, 2, 3, 4, 5, 6] as const) {
      for (const ch of KANJI_BY_GRADE[g]) {
        expect(seen.has(ch)).toBe(false);
        seen.add(ch);
      }
    }
  });

  it('学年の判定', () => {
    expect(gradeOfKanji('学')).toBe(1);
    expect(gradeOfKanji('曜')).toBe(2);
    expect(gradeOfKanji('潟')).toBe(4); // 平成29年告示で4年に入った県名の漢字
    expect(gradeOfKanji('恋')).toBeUndefined(); // 中学校で習う
    expect(gradeOfWord('自転車')).toBe(3);
  });

  it('漢字ですすめる言葉は、すべて小学校で習う字だけでできている', () => {
    for (const [kana, kanji] of KANA_TO_KANJI) {
      expect(gradeOfWord(kanji), `${kana} → ${kanji}`).toBeDefined();
      expect(kana.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('形がにている漢字のヒントは小学校で習う字だけを対象にする', () => {
    for (const [ch] of LOOKALIKE) expect(gradeOfKanji(ch), ch).toBeDefined();
  });
});

describe('まちがえやすい字', () => {
  it('助詞の「わ」を「は」に直す', () => {
    const r = checkDiary('ぼくわ、公園で遊んだ。', { grade: 6 });
    const f = find(r.findings, 'wa-ha')[0];
    expect(f).toBeDefined();
    expect(f.fix).toEqual({ from: 'ぼくわ', to: 'ぼくは' });
    expect(applyFix('ぼくわ、公園で遊んだ。', f).text).toBe('ぼくは、公園で遊んだ。');
  });

  it('ふつうの「わ」はまちがいにしない', () => {
    const r = checkDiary('こわい話を聞いた。かわいい犬がいた。わたしは笑った。', { grade: 6 });
    expect(find(r.findings, 'wa-ha')).toHaveLength(0);
  });

  it('「こんにちわ」「とゆう」「がっこお」を直す', () => {
    const text = 'こんにちわ。これはとゆう名前のがっこおです。';
    const r = checkDiary(text, { grade: 6 });
    const out = applyAllFixes(text, r.findings);
    expect(out.text).toContain('こんにちは');
    expect(out.text).toContain('という');
    expect(out.text).toContain('がっこう');
  });

  it('「楽しいかった」を「楽しかった」に直す', () => {
    const r = checkDiary('とても楽しいかった。', { grade: 6 });
    expect(find(r.findings, 'i-adj-katta')[0].fix).toEqual({ from: '楽しいかった', to: '楽しかった' });
  });

  it('「学校え行った」を「学校へ行った」に直す', () => {
    const text = '学校え行った。';
    const r = checkDiary(text, { grade: 6 });
    expect(applyAllFixes(text, r.findings).text).toBe('学校へ行った。');
  });

  it('同じまちがいは3か所までしか出さない', () => {
    const r = checkDiary('ぼくわ。ぼくわ。ぼくわ。ぼくわ。ぼくわ。', { grade: 6 });
    expect(find(r.findings, 'wa-ha')).toHaveLength(3);
  });

  it('すべての規則に日本語の説明と中国語の一行がある', () => {
    for (const rule of TYPO_RULES) {
      expect(rule.noteZh.length, rule.id).toBeGreaterThan(3);
      expect(rule.pattern.flags, rule.id).toContain('g');
    }
  });
});

describe('漢字の書き方', () => {
  it('その学年ではまだ習わない漢字を知らせる（まちがい扱いにはしない）', () => {
    const r = checkDiary('潟のことを調べた。', { grade: 3 });
    const f = find(r.findings, 'kanji-later-潟')[0];
    expect(f).toBeDefined();
    expect(f.severity).toBe('check');
    expect(f.detailJa).toContain('4年生');
  });

  it('習った学年なら知らせない', () => {
    const r = checkDiary('潟のことを調べた。', { grade: 5 });
    expect(find(r.findings, 'kanji-later-潟')).toHaveLength(0);
  });

  it('小学校で習わない漢字は「中学校などで習う」と伝える', () => {
    const r = checkDiary('恋の歌を聞いた。', { grade: 6 });
    expect(find(r.findings, 'kanji-beyond-恋')[0]?.severity).toBe('check');
  });

  it('ひらがなの言葉を漢字ですすめる', () => {
    const text = 'きょうはがっこうでともだちとあそんだ。';
    const r = checkDiary(text, { grade: 6 });
    const f = find(r.findings, 'kanji-kana-がっこう')[0];
    expect(f.fix).toEqual({ from: 'がっこう', to: '学校' });
    expect(applyFix(text, f).text).toContain('学校');
  });

  it('その学年でまだ習わない字の言葉はすすめない', () => {
    // 「牛乳」の「乳」は6年
    const r = checkDiary('ぎゅうにゅうを飲んだ。', { grade: 5 });
    expect(find(r.findings, 'kanji-kana-ぎゅうにゅう')).toHaveLength(0);
    expect(find(checkDiary('ぎゅうにゅうを飲んだ。', { grade: 6 }).findings, 'kanji-kana-ぎゅうにゅう')).toHaveLength(1);
  });

  it('形がにている漢字は「写真とくらべて」と声をかける', () => {
    const r = checkDiary('犬と散歩した。', { grade: 6 });
    const f = find(r.findings, 'kanji-shape-犬')[0];
    expect(f.detailJa).toContain('写真');
    expect(f.fix).toBeUndefined(); // 形は写真でしか分からないので直しの候補は出さない
  });

  it('習った漢字だけならほめる', () => {
    const r = checkDiary('今日は学校で理科の実験をした。とても楽しかった。', { grade: 6 });
    expect(find(r.findings, 'kanji-good')[0]?.severity).toBe('good');
  });
});

describe('文のきまりと「、」「。」', () => {
  it('文のおわりの「。」がないと知らせて、直せる', () => {
    const text = 'きょうは公園で遊んだ';
    const r = checkDiary(text, { grade: 6 });
    const f = find(r.findings, 'grammar-kuten')[0];
    expect(f.severity).toBe('fix');
    expect(applyFix(text, f).text.endsWith('。')).toBe(true);
  });

  it('「，」を「、」に直す', () => {
    const text = 'きょうは，公園で遊んだ。';
    const r = checkDiary(text, { grade: 6 });
    expect(applyAllFixes(text, r.findings).text).toBe('きょうは、公園で遊んだ。');
  });

  it('かぎかっこの数があわないと知らせる', () => {
    const r = checkDiary('先生が「よくできたね と言った。', { grade: 6 });
    expect(find(r.findings, 'grammar-quote-pair')).toHaveLength(1);
  });

  it('敬体と常体がまざっていると知らせる', () => {
    const r = checkDiary('今日は遠足でした。バスに乗った。お弁当を食べました。', { grade: 6 });
    expect(find(r.findings, 'grammar-style-mix')[0]?.severity).toBe('check');
  });

  it('そろっているときは知らせない', () => {
    const r = checkDiary('今日は遠足でした。バスに乗りました。お弁当を食べました。', { grade: 6 });
    expect(find(r.findings, 'grammar-style-mix')).toHaveLength(0);
  });

  it('長い文には「、」や分けることをすすめる', () => {
    const long = `今日は朝からとても天気がよくて${'公園で友だちと走ったりボールで遊んだりして'.repeat(3)}帰った。`;
    const r = checkDiary(long, { grade: 6 });
    expect(find(r.findings, 'grammar-long')).not.toHaveLength(0);
  });

  it('文に分けるとき「」の中の「。」では切らない', () => {
    const s = splitSentences('先生が「はい。どうぞ。」と言った。ぼくは受け取った。');
    expect(s).toHaveLength(2);
  });

  it('文のはじめの「なので」を「だから」に直す', () => {
    const text = '雨がふった。なので中止になった。';
    const r = checkDiary(text, { grade: 6 });
    expect(applyFix(text, find(r.findings, 'grammar-nanode')[0]).text).toContain('だから中止');
  });
});

describe('書き方のくふう', () => {
  it('みじかい日記にはくわしく書くことをすすめる', () => {
    const r = checkDiary('きょうは楽しかった。', { grade: 6 });
    expect(find(r.findings, 'content-short')).toHaveLength(1);
  });

  it('いつ・どこで・だれと が足りないときに知らせる', () => {
    const r = checkDiary('ボールをけった。それだけだ。', { grade: 6 });
    expect(find(r.findings, 'content-when')).toHaveLength(1);
    expect(find(r.findings, 'content-where')).toHaveLength(1);
    expect(find(r.findings, 'content-who')).toHaveLength(1);
  });

  it('書けているところはほめる', () => {
    const text =
      '今日は校庭で友だちとサッカーをした。3回もゴールを決めて、うれしかった。' +
      '友だちが「すごいね」と言ってくれたからだ。' +
      'ボールの音が高くひびいて、風がつめたかった。つぎは守りもがんばりたい。';
    const r = checkDiary(text, { grade: 6 });
    const good = inCategory(r.findings, 'content').filter((f) => f.severity === 'good');
    expect(good.length).toBeGreaterThanOrEqual(3);
    expect(r.counts.good).toBeGreaterThanOrEqual(3);
  });

  it('同じ言葉のくりかえしを知らせる', () => {
    const r = checkDiary('朝おきた。そして顔をあらった。そして学校へ行った。そして勉強した。', { grade: 6 });
    expect(find(r.findings, 'content-repeat-そして')).toHaveLength(1);
  });

  it('「楽しかった。」だけの終わりにもう一歩をすすめる', () => {
    const r = checkDiary('今日は校庭で友だちとサッカーをした。3回もゴールを決めた。楽しかった。', { grade: 6 });
    expect(find(r.findings, 'content-ending')).toHaveLength(1);
  });
});

describe('結果のまとめ', () => {
  const text = 'ぼくわ、きょう学校え行った。こんにちわ，とゆう字をならった。楽しいかった';

  it('4つの分類に分けて、多すぎないように上限をつける', () => {
    const r = checkDiary(text, { grade: 6 });
    for (const c of ['typo', 'kanji', 'grammar', 'content'] as DiaryCategory[]) {
      const notGood = r.byCategory[c].filter((f) => f.severity !== 'good');
      expect(notGood.length).toBeLessThanOrEqual(6);
    }
    expect(r.findings.length).toBe(
      r.byCategory.typo.length + r.byCategory.kanji.length + r.byCategory.grammar.length + r.byCategory.content.length,
    );
  });

  it('すべての指摘に日本語の説明と中国語の一行がつく', () => {
    const r = checkDiary(text, { grade: 6 });
    expect(r.findings.length).toBeGreaterThan(5);
    for (const f of r.findings) {
      expect(f.titleJa.length, f.id).toBeGreaterThan(2);
      expect(f.detailJa.length, f.id).toBeGreaterThan(10);
      expect(f.noteZh.length, f.id).toBeGreaterThan(3);
      expect(/[A-Za-z]{4,}/.test(f.titleJa), f.id).toBe(false); // 子どもが読む見出しに英単語を出さない
    }
  });

  it('まとめて直したあとは、はっきりまちがいが減る', () => {
    const before = checkDiary(text, { grade: 6 });
    const fixed = applyAllFixes(text, before.findings);
    expect(fixed.applied).toBeGreaterThan(2);
    const after = checkDiary(fixed.text, { grade: 6 });
    expect(after.counts.fix).toBeLessThan(before.counts.fix);
  });

  it('空の本文でもこわれない', () => {
    const r = checkDiary('', { grade: 6 });
    expect(r.stats.chars).toBe(0);
    expect(r.counts.fix).toBe(0);
  });

  it('統計は文字数・文の数・漢字の数を返す', () => {
    const r = checkDiary('今日は晴れた。学校へ行った。', { grade: 6 });
    expect(r.stats.chars).toBe(14);
    expect(r.stats.sentences).toBe(2);
    expect(r.stats.kanjiChars).toBe(6);
  });
});
