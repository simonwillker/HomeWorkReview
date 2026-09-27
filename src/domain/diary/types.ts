// 日記チェックの結果の形。ここは UI に依存しない純粋な型だけを置く。
//
// 指摘の言葉づかいの決まり（小学生が読んで分かるように）:
//   - 「まちがい」ではなく「なおすとよくなるところ」として書く
//   - 何が・どうして・どう書けばいいかを、この順で一文ずつ
//   - むずかしい言葉（助詞・常体・敬体…）は使わず、例で見せる
//   - 日記は日本語なので説明も日本語。家族（中国語）向けに一行の noteZh を添える

import type { SchoolGrade } from './kanjiGrades';

/** 指摘の4分類（ユーザー指定：错别字 / 已学汉字的写法 / 文法与标点 / 内容表达） */
export type DiaryCategory = 'typo' | 'kanji' | 'grammar' | 'content';

export const CATEGORY_ORDER: DiaryCategory[] = ['typo', 'kanji', 'grammar', 'content'];

export const CATEGORY_LABEL: Record<DiaryCategory, { ja: string; zh: string; icon: string }> = {
  typo: { ja: 'まちがえやすい字', zh: '常见错别字', icon: '🔤' },
  kanji: { ja: '漢字の書き方', zh: '小学已学汉字的写法', icon: '✍️' },
  grammar: { ja: '文のきまりと「、」「。」', zh: '文法与标点', icon: '📏' },
  content: { ja: '書き方のくふう', zh: '内容表达', icon: '💡' },
};

/**
 * fix   なおしたいところ（はっきりまちがい）
 * check たしかめたいところ（まちがいとはかぎらない）
 * idea  くふうできるところ（もっとよくなる）
 * good  できているところ（ほめる）
 */
export type DiarySeverity = 'fix' | 'check' | 'idea' | 'good';

export const SEVERITY_LABEL: Record<DiarySeverity, { ja: string; zh: string }> = {
  fix: { ja: 'なおそう', zh: '要改' },
  check: { ja: 'たしかめよう', zh: '请确认' },
  idea: { ja: 'くふうしよう', zh: '可以更好' },
  good: { ja: 'できているね', zh: '做得好' },
};

export const SEVERITY_ORDER: Record<DiarySeverity, number> = { fix: 0, check: 1, idea: 2, good: 3 };

export interface DiaryFinding {
  id: string;
  category: DiaryCategory;
  severity: DiarySeverity;
  /** 本文のどこか（ハイライト用）。全体についての指摘では持たない */
  start?: number;
  end?: number;
  /** 本文から引いた短い部分 */
  quote?: string;
  /** 見出し（日本語・短く） */
  titleJa: string;
  /** 説明（日本語・小学生向け。なぜ・どうするか） */
  detailJa: string;
  /** 家族向けの一行（中国語） */
  noteZh: string;
  /** ワンタップで直せるときの置きかえ */
  fix?: { from: string; to: string };
}

export interface DiaryStats {
  /** 本文の文字数（改行と空白を除く） */
  chars: number;
  sentences: number;
  kanjiChars: number;
  /** 使った漢字の種類 */
  kanjiKinds: number;
  /** その学年までに習った漢字の種類 */
  learnedKinds: number;
  /** まだ習っていない（小学校の配当表で上の学年の）漢字 */
  laterKanji: string[];
  /** 小学校では習わない漢字 */
  beyondKanji: string[];
}

export interface DiaryCheckResult {
  grade: SchoolGrade;
  stats: DiaryStats;
  findings: DiaryFinding[];
  byCategory: Record<DiaryCategory, DiaryFinding[]>;
  counts: Record<DiarySeverity, number>;
}

export interface DiaryRule {
  id: string;
  category: DiaryCategory;
  severity: DiarySeverity;
  /** g フラグ必須。マッチした部分が指摘の場所になる */
  pattern: RegExp;
  titleJa: string;
  detailJa: (m: RegExpExecArray) => string;
  noteZh: string;
  /** 置きかえ後の文字列。省略すると「なおす」ボタンは出ない */
  to?: (m: RegExpExecArray) => string;
}

/** 1つの分類で出す指摘の上限。多すぎると子どもが読まなくなるので、まず数個に絞る */
export const MAX_PER_CATEGORY = 6;
