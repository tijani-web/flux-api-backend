// src/loadEnv.js
import dotenv from 'dotenv';

// Load .env file
dotenv.config();

// Validate required variables
const required = ['DATABASE_URL', 'JWT_SECRET'];
required.forEach(key => {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
});

console.log('✅ Environment variables loaded');