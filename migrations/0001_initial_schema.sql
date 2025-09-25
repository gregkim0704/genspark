-- Sentiment Analysis Platform Database Schema

-- Users table for basic user management
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sentiment analysis results table
CREATE TABLE IF NOT EXISTS sentiment_analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  input_text TEXT NOT NULL,
  sentiment_score REAL NOT NULL,
  sentiment_label TEXT NOT NULL,
  confidence REAL NOT NULL,
  language TEXT DEFAULT 'ko',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Batch processing jobs table
CREATE TABLE IF NOT EXISTS batch_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  job_name TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  total_items INTEGER DEFAULT 0,
  processed_items INTEGER DEFAULT 0,
  results_summary TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- API usage tracking
CREATE TABLE IF NOT EXISTS api_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  endpoint TEXT NOT NULL,
  request_count INTEGER DEFAULT 1,
  date DATE DEFAULT (date('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sentiment_analyses_user_id ON sentiment_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_sentiment_analyses_created_at ON sentiment_analyses(created_at);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_user_id ON batch_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_status ON batch_jobs(status);
CREATE INDEX IF NOT EXISTS idx_api_usage_user_date ON api_usage(user_id, date);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);