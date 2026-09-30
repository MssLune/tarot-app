import { Router, Request, Response } from 'express';
import { Webhook } from 'svix';
import { env } from '../config/env';
import { prisma } from '../database/prisma';

export const webhookRouter = Router();

/**
 * Webhook de Clerk: sincroniza usuarios con la base de datos.
 * Eventos: user.created, user.updated, user.deleted
 */
webhookRouter.post('/clerk', async (req: Request, res: Response) => {
  if (!env.clerkWebhookSecret) {
    res.status(500).json({ error: 'CLERK_WEBHOOK_SECRET no configurado' });
    return;
  }

  const webhook = new Webhook(env.clerkWebhookSecret);

  try {
    const event = webhook.verify(JSON.stringify(req.body), req.headers as any) as any;

    switch (event.type) {
      case 'user.created': {
        const { id, email_addresses, first_name, last_name, image_url } = event.data;
        const email = email_addresses?.[0]?.email_address ?? '';
        const name = [first_name, last_name].filter(Boolean).join(' ') || null;

        await prisma.user.upsert({
          where: { id },
          update: { email, name, avatarUrl: image_url },
          create: { id, email, name, avatarUrl: image_url },
        });
        break;
      }

      case 'user.updated': {
        const { id, email_addresses, first_name, last_name, image_url } = event.data;
        const email = email_addresses?.[0]?.email_address ?? '';
        const name = [first_name, last_name].filter(Boolean).join(' ') || null;

        await prisma.user.upsert({
          where: { id },
          update: { email, name, avatarUrl: image_url },
          create: { id, email, name, avatarUrl: image_url },
        });
        break;
      }

      case 'user.deleted': {
        const { id } = event.data;
        if (id) {
          await prisma.user.delete({ where: { id } }).catch(() => {});
        }
        break;
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[Clerk Webhook] Error:', err);
    res.status(400).json({ error: 'Webhook verification failed' });
  }
});
