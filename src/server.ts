import app from './app';
import { connectDatabase } from './config/database';
import { config } from './config/env';

const startServer = async (): Promise<void> => {
  try {
    // Connect to database
    await connectDatabase();

    // Start server
    const port = config.port;
    app.listen(port, () => {
      console.log(`🚀 Server running on port ${port}`);
      console.log(`📡 Environment: ${config.nodeEnv}`);
      console.log(`🔗 API: http://localhost:${port}/api`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// this line is used to understand the commit history
// this line is used to understand the commit history
// this line is used to understand the commit history
