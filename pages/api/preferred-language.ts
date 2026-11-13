// GET  /api/preferred-language        → { preferredLanguage }
// PUT  /api/preferred-language { language } → saves the user's preferred language for
//      meeting transcripts/summaries (used for automatic post-meeting translation).
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { SUPPORTED_LANGUAGES, baseLanguage } from '@/lib/translation';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { preferredLanguage: true },
    });
    return res.status(200).json({
      preferredLanguage: baseLanguage(user?.preferredLanguage) || 'en',
      supported: SUPPORTED_LANGUAGES,
    });
  }

  if (req.method === 'PUT') {
    const language = baseLanguage(req.body?.language);
    if (!language || !SUPPORTED_LANGUAGES.includes(language)) {
      return res.status(400).json({ error: 'Unsupported language' });
    }
    await prisma.user.update({
      where: { id: session.user.id },
      data: { preferredLanguage: language },
    });
    return res.status(200).json({ preferredLanguage: language });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
