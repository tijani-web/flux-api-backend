/**
 * ENVIRONMENT CONFIGURATION
 */
const env = {
  database: {
    url: process.env.DATABASE_URL,
  },
  app: {
    port: process.env.PORT || 5001,
    nodeEnv: process.env.NODE_ENV,
    frontendUrl: process.env.FRONTEND_URL,
    backendUrl: process.env.BACKEND_URL,
    maxContainers: parseInt(process.env.MAX_CONTAINERS),
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN,
  },
  geminiAi: {
    apiKey: process.env.GEMINI_AI_API_KEY,
  },
  resendEmail: {
    apiKey: process.env.RESEND_EMAIL_API_KEY,
  },
  oauth: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      githubCallbackUrl: process.env.GITHUB_CALLBACK_URL,
    }
  },
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  },
};

// Validate required environment variables
const required = ['DATABASE_URL', 'JWT_SECRET'];
required.forEach(key => {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
});

export default env;