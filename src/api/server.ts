import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import router from './routes';
import { initDatabase, pool } from '../services/db';
import { errorHandler } from '../middleware/errorHandler';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Apply standard global middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Register routes directly at root to match assignment path requirements exactly
app.use('/', router);

// Register global error handler middleware (must be registered last)
app.use(errorHandler);

// Bootstrap RAG server
async function startServer() {
  try {
    // 1. Initialize Postgres & Run vector database migrations
    await initDatabase();

    // 2. Start listening for incoming tenant queries
    const server = app.listen(PORT, () => {
      console.log(`=======================================================`);
      console.log(` MULTI-TENANT RAG ENGINE IS ACTIVE                     `);
      console.log(` Running on port: http://localhost:${PORT}              `);
      console.log(` Mode: ${process.env.NODE_ENV || 'development'}       `);
      console.log(`=======================================================`);
    });

    // Graceful Shutdown orchestration
    const shutdown = async () => {
      console.log('Shutting down multi-tenant RAG server...');
      server.close(async () => {
        console.log('Express server closed.');
        await pool.end();
        console.log('Database connection pool ended.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error) {
    console.error('Critical failure during server startup:', error);
    process.exit(1);
  }
}

// Start execution
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export default app;
