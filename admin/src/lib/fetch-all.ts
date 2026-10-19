/**
 * Read every row of a query, a page at a time.
 *
 * PostgREST caps a response at the project's max-rows (1000 on hosted
 * Supabase) and says nothing when it does, so `select("*")` on a growing table
 * silently stops at the newest thousand. That is fine for a screen and wrong for
 * an export or a sales total. `page` must build a FRESH query for each range
 * and order it by a unique key last, or rows can repeat or vanish between pages.
 */
export const PAGE_SIZE = 1000;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
}
