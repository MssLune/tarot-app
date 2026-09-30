import { Router } from 'express';
import { cardsRouter } from './cards.routes';
import { combinationsRouter } from './combinations.routes';
import { spreadsRouter } from './spreads.routes';
import { userRouter } from './user.routes';
import { adminRouter } from './admin.routes';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => res.json({ success: true, data: { status: 'ok' } }));
apiRouter.use('/cards', cardsRouter);
apiRouter.use('/spreads', spreadsRouter);
apiRouter.use('/combinations', combinationsRouter);
apiRouter.use('/user', userRouter);
apiRouter.use('/admin', adminRouter);
