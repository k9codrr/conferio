// pages/api/aimeetings/[id]/translate.ts
// POST { languages?: string[], force?: boolean }
// Translates a recorded meeting for the current user. Defaults to the user's preferred language.
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { translateMeetingForUser } from '@/lib/meeting-translation';
import { SUPPORTED_LANGUAGES, baseLanguage } from '@/lib/translation';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.query;
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Invalid ID' });

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const meeting = await prisma.aiMeeting.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true, transcript: true },
    });

    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    if (!meeting.transcript) return res.status(400).json({ error: 'No transcript available' });

    let languages = Array.isArray(req.body?.languages)
      ? (req.body.languages as string[]).map((l) => baseLanguage(l)).filter((l): l is string => !!l)
      : [];
    if (!languages.length) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { preferredLanguage: true },
      });
      languages = [baseLanguage(user?.preferredLanguage) || 'en'];
    }

    const unsupported = languages.filter((l) => !SUPPORTED_LANGUAGES.includes(l));
    if (unsupported.length) {
      return res.status(400).json({ error: `Unsupported language: ${unsupported.join(', ')}` });
    }

    const results = [];
    for (const lang of languages) {
      results.push(await translateMeetingForUser(id, session.user.id, lang, { force: !!req.body?.force }));
    }

    return res.status(200).json({ success: true, results });
  } catch (error: any) {
    console.error('Translation error:', error);
    return res.status(502).json({ error: error.message || 'Translation failed' });
  }
}
