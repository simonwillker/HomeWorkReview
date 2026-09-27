// 日記チェックの入り口。写真から入れた本文（文字）を受け取り、4つの分類に分けた指摘を返す。
//
// ここは純粋な関数だけ。保存も画面も知らないので、そのままテストできる。
// 「写真 → 文字」の読み取りは、この関数の外で行う（いまは自分で入力する。9 の注意を参照）。

import { checkContent } from './content';
import { checkGrammar, splitSentences } from './grammar';
import { kanjiStats, checkKanji } from './kanji';
import type { SchoolGrade } from './kanjiGrades';
import { TYPO_RULES } from './typos';
import {
  CATEGORY_ORDER,
  MAX_PER_CATEGORY,
  SEVERITY_ORDER,
  type DiaryCategory,
  type DiaryCheckResult,
  type DiaryFinding,
  type DiarySeverity,
} from './types';

export * from './types';
export { GRADES, gradeOfKanji, KYOIKU_KANJI_TOTAL, type SchoolGrade } from './kanjiGrades';
export { splitSentences } from './grammar';

function runRules(text: string): DiaryFinding[] {
  const out: DiaryFinding[] = [];
  for (const rule of TYPO_RULES) {
    const re = new RegExp(rule.pattern.source, rule.pattern.flags.includes('g') ? rule.pattern.flags : `${rule.pattern.flags}g`);
    let m: RegExpExecArray | null;
    let hits = 0;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) break; // 空マッチで無限ループしない
      out.push({
        id: `${rule.id}-${m.index}`,
        category: rule.category,
        severity: rule.severity,
        start: m.index,
        end: m.index + m[0].length,
        quote: m[0],
        titleJa: rule.titleJa,
        detailJa: rule.detailJa(m),
        noteZh: rule.noteZh,
        fix: rule.to ? { from: m[0], to: rule.to(m) } : undefined,
      });
      hits++;
      if (hits >= 3) break; // 同じまちがいを何度も出さない（最初の3か所まで）
    }
  }
  return out;
}

function sortFindings(a: DiaryFinding, b: DiaryFinding): number {
  const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
  if (s !== 0) return s;
  return (a.start ?? Number.MAX_SAFE_INTEGER) - (b.start ?? Number.MAX_SAFE_INTEGER);
}

export interface DiaryCheckOptions {
  /** 「習った漢字か」の判定に使う学年 */
  grade: SchoolGrade;
}

export function checkDiary(text: string, options: DiaryCheckOptions): DiaryCheckResult {
  const grade = options.grade;
  const findings = [...runRules(text), ...checkKanji(text, grade), ...checkGrammar(text), ...checkContent(text)];

  const byCategory = {} as Record<DiaryCategory, DiaryFinding[]>;
  for (const c of CATEGORY_ORDER) {
    const all = findings.filter((f) => f.category === c).sort(sortFindings);
    // ほめる（good）は全部のこし、直すところは多すぎないように上限をつける
    const good = all.filter((f) => f.severity === 'good');
    const rest = all.filter((f) => f.severity !== 'good').slice(0, MAX_PER_CATEGORY);
    byCategory[c] = [...rest, ...good];
  }
  const kept = CATEGORY_ORDER.flatMap((c) => byCategory[c]);

  const counts = { fix: 0, check: 0, idea: 0, good: 0 } as Record<DiarySeverity, number>;
  for (const f of kept) counts[f.severity]++;

  const ks = kanjiStats(text, grade);
  return {
    grade,
    findings: kept,
    byCategory,
    counts,
    stats: {
      chars: text.replace(/\s/g, '').length,
      sentences: splitSentences(text).length,
      ...ks,
    },
  };
}

/** 指摘の「なおす」をこの文に当てる。すでに直っているときは applied: false を返す */
export function applyFix(text: string, finding: DiaryFinding): { text: string; applied: boolean } {
  const fix = finding.fix;
  if (!fix) return { text, applied: false };
  const { start } = finding;
  if (start !== undefined && text.slice(start, start + fix.from.length) === fix.from) {
    return { text: text.slice(0, start) + fix.to + text.slice(start + fix.from.length), applied: true };
  }
  const at = text.indexOf(fix.from);
  if (at < 0) return { text, applied: false };
  return { text: text.slice(0, at) + fix.to + text.slice(at + fix.from.length), applied: true };
}

/** はっきりまちがいのところ（fix）をまとめて直す。位置がずれないように後ろから当てる */
export function applyAllFixes(text: string, findings: DiaryFinding[]): { text: string; applied: number } {
  const target = findings
    .filter((f) => f.severity === 'fix' && f.fix)
    .sort((a, b) => (b.start ?? 0) - (a.start ?? 0));
  let out = text;
  let applied = 0;
  for (const f of target) {
    const r = applyFix(out, f);
    if (r.applied) {
      out = r.text;
      applied++;
    }
  }
  return { text: out, applied };
}

/** 結果を一行でまとめる（保存や一覧に出す用） */
export function summarize(counts: Record<DiarySeverity, number>): string {
  return `なおそう ${counts.fix} / たしかめよう ${counts.check} / くふう ${counts.idea} / できているね ${counts.good}`;
}
