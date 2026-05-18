import { adminRouter } from './routers/admin';
import { articleRouter } from './routers/article';
import { contractRouter } from './routers/contract';
import { inboxRouter } from './routers/inbox';
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
  inbox: inboxRouter,
  service: serviceRouter,
  savedJob: savedJobRouter,
  savedService: savedServiceRouter,
  search: searchRouter,
  admin: adminRouter,
  article: articleRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
