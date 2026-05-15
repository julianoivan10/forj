'use client';

import type { AppRouter } from '@forj/api';
import { createTRPCReact } from '@trpc/react-query';

export const api = createTRPCReact<AppRouter>();
