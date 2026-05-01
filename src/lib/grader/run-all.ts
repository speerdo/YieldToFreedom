import { asc, eq } from 'drizzle-orm';

import { db } from '../db';
import { etfDividends, etfGradeHistory, etfs } from '../db/schema';
import { calculateYtfGrade } from './grade';

export async function gradeAllActiveEtfs(): Promise<{ graded: number }> {
  const rows = await db.select().from(etfs).where(eq(etfs.isActive, true));
  let graded = 0;
  for (const etf of rows) {
    const divs = await db
      .select()
      .from(etfDividends)
      .where(eq(etfDividends.etfId, etf.id))
      .orderBy(asc(etfDividends.exDate));

    const { grade, score } = calculateYtfGrade(etf, divs);

    const prevGrade = etf.ytfGrade?.trim() ?? '';
    const firstGrade = prevGrade === '';

    if (firstGrade || prevGrade !== grade) {
      await db.insert(etfGradeHistory).values({
        etfId: etf.id,
        grade,
        score: score.toFixed(2),
        reason: firstGrade ? 'initial_grade_run' : 'grade_change',
      });
    }

    await db
      .update(etfs)
      .set({
        ytfGrade: grade,
        ytfScore: score.toFixed(2),
        gradeUpdatedAt: new Date(),
      })
      .where(eq(etfs.id, etf.id));

    graded++;
  }

  return { graded };
}
