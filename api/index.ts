import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { createAssistantRuntime, mountAssistantRoutes, type AssistantRuntime } from '../packages/server/src/index.ts';
import { createCollegeFinanceRouter } from '../apps/demo-college-finance/server.ts';
import { createLibraryRouter } from '../apps/second-demo-app/server.ts';

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(express.json({ limit: '10mb' }));

// 1. Mount Demo Apps APIs
app.use('/api/demo/college-finance', createCollegeFinanceRouter());
app.use('/api/demo/second-demo', createLibraryRouter());

// 2. Initialize and Mount Assistant Runtime
const runtime = await createAssistantRuntime({
  port: 3000,
  profilesDir: path.resolve(process.cwd(), 'profiles'),
});
mountAssistantRoutes(app, runtime);

export default app;
