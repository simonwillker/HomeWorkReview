// 客观题答案比对：只在录入了标准答案时进行，不猜测正确答案（设计书 3.1 第 5 步、第 5 节）。

import type { AnswerKeyItem, ReviewItem, StudentAnswer } from './types';

/** 规范化：去空白、全角转半角、统一大小写与常见标点 */
export function normalizeAnswer(s: string): string {
  return s
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ')
    .replace(/\s+/g, '')
    .replace(/[。．]/g, '.')
    .replace(/[，]/g, ',')
    .toLowerCase();
}

export function compareAnswers(
  key: AnswerKeyItem[],
  studentAnswers: StudentAnswer[],
  source: string | undefined,
): ReviewItem[] {
  const byNo = new Map(studentAnswers.map((a) => [a.questionNo.trim(), a.answer]));
  return key.map((k): ReviewItem => {
    const given = byNo.get(k.questionNo.trim());
    const basis = source ? `答案来源：${source}` : '答案来源：录入者提供';
    if (given === undefined || given.trim() === '') {
      // 学生没有填写答案时，无法比对，转人工检查
      return { questionNo: k.questionNo, method: 'manual', result: 'pending_manual', referenceAnswer: k.answer, basis };
    }
    const same = normalizeAnswer(given) === normalizeAnswer(k.answer);
    return {
      questionNo: k.questionNo,
      method: 'answer_key',
      result: same ? 'match' : 'mismatch',
      referenceAnswer: k.answer,
      studentAnswer: given,
      basis,
    };
  });
}

/** 解析“题号 答案”多行文本，如 “1 A” “2：3.5” “3(1) 北京” “4、C” */
export function parseAnswerLines(text: string): AnswerKeyItem[] {
  const out: AnswerKeyItem[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^([^\s:：、]+?)[\s:：、]+(.+)$/) ?? line.match(/^(\d+)[.．](.+)$/);
    if (!m) continue;
    const questionNo = m[1].replace(/[.．]$/, '');
    const answer = m[2].trim();
    if (questionNo && answer) out.push({ questionNo, answer });
  }
  return out;
}
