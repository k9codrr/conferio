import type { NextApiRequest, NextApiResponse } from 'next';
import { CrmError, getCrmContext, queryString } from '@/lib/crm/http';
import { EXPORT_ENTITIES, exportCsv, type ExportEntity } from '@/lib/crm/transfer';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  try {
    const ctx = await getCrmContext(req, res);
    const entity = queryString(req, 'entity') as ExportEntity;
    if (EXPORT_ENTITIES.indexOf(entity) === -1) throw new CrmError(400, 'Choose companies, contacts or deals.');

    const csv = await exportCsv(ctx, entity);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${ctx.teamSlug}-${entity}-${stamp}.csv"`);
    return res.status(200).send(String.fromCharCode(0xfeff) + csv);
  } catch (error) {
    const status = error instanceof CrmError ? error.status : 500;
    if (status >= 500) console.error('[crm] export failed', error);
    return res.status(status).json({ error: { message: error instanceof CrmError ? error.message : 'Export failed.' } });
  }
}
