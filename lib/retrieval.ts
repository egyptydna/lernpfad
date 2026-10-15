import { db } from "./db";
export async function indexDocument(
  userId: string,
  documentId: string,
  pages: { page: number; text: string }[],
) {
  const conn = await db();
  await conn.query(
    "DELETE FROM content_chunks WHERE user_id=$1 AND document_id=$2",
    [userId, documentId],
  );
  for (const p of pages)
    for (let offset = 0; offset < p.text.length; offset += 2800) {
      const content = p.text.slice(offset, offset + 3400);
      await conn.query(
        "INSERT INTO content_chunks(id,user_id,document_id,page,content) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING",
        [
          documentId + ":" + p.page + ":" + offset,
          userId,
          documentId,
          p.page,
          content,
        ],
      );
    }
}
export async function searchContext(
  userId: string,
  documentIds: string[],
  query: string,
) {
  if (!documentIds.length) return "";
  const page = query.match(/(?:seite|folie|slide|page)\s*(\d+)/i)?.[1];
  const conn = await db();
  const r = page
    ? await conn.query(
        `SELECT document_id,page,content FROM content_chunks WHERE user_id=$1 AND document_id=ANY($2::text[]) AND page=$3 ORDER BY id LIMIT 40`,
        [userId, documentIds, Number(page)],
      )
    : await conn.query(
        `SELECT document_id,page,content FROM content_chunks WHERE user_id=$1 AND document_id=ANY($2::text[]) ORDER BY ts_rank_cd(search,plainto_tsquery('simple',$3)) DESC,id LIMIT 30`,
        [userId, documentIds, query],
      );
  return r.rows
    .map(
      (p: any) => `[documentId=${p.document_id}, page=${p.page}]\n${p.content}`,
    )
    .join("\n\n");
}
