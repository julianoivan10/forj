import { adminRouter } from './routers/admin';
import { contractRouter } from './routers/contract';
import { jobRouter } from './routers/job';
import { messageRouter } from './routers/message';
import { notificationRouter } from './routers/notification';
import { proposalRouter } from './routers/proposal';
import { reviewRouter } from './routers/review';
import { savedJobRouter } from './routers/saved-job';
import { savedServiceRouter } from './routers/saved-service';
import { searchRouter } from './routers/search';
import { serviceRouter } from './routers/service';
import { userRouter } from './routers/user';
import { createCallerFactory, createTRPCRouter } from './trpc';

export const appRouter = createTRPCRouter({
  user: userRouter,
  job: jobRouter,
  proposal: proposalRouter,
  contract: contractRouter,
  message: messageRouter,
  review: reviewRouter,
  notification: notificationRouter,
  service: serviceRouter,
  savedJob: savedJobRouter,
  savedService: savedServiceRouter,
  search: searchRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
