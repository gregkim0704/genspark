-- Test data for Sentiment Analysis Platform

-- Insert test users
INSERT OR IGNORE INTO users (id, email, name) VALUES 
  (1, 'admin@example.com', '관리자'),
  (2, 'user1@example.com', '김철수'),
  (3, 'user2@example.com', '이영희');

-- Insert sample sentiment analyses
INSERT OR IGNORE INTO sentiment_analyses (user_id, input_text, sentiment_score, sentiment_label, confidence, language) VALUES 
  (2, '오늘 정말 기분이 좋습니다!', 0.85, 'positive', 0.92, 'ko'),
  (2, '이 제품은 정말 실망스럽네요.', -0.72, 'negative', 0.88, 'ko'),
  (3, '그냥 평범한 하루였어요.', 0.05, 'neutral', 0.65, 'ko'),
  (3, '새로운 기술에 대해 흥미로운 발견을 했습니다.', 0.68, 'positive', 0.81, 'ko'),
  (2, 'I love this new feature!', 0.79, 'positive', 0.89, 'en'),
  (3, 'The service was okay, nothing special.', 0.12, 'neutral', 0.71, 'en');

-- Insert sample batch jobs
INSERT OR IGNORE INTO batch_jobs (user_id, job_name, status, total_items, processed_items, results_summary) VALUES 
  (2, '고객 리뷰 감정분석', 'completed', 100, 100, '{"positive": 45, "negative": 25, "neutral": 30}'),
  (3, '소셜미디어 댓글 분석', 'processing', 50, 30, '{"positive": 15, "negative": 8, "neutral": 7}');

-- Insert API usage data
INSERT OR IGNORE INTO api_usage (user_id, endpoint, request_count, date) VALUES 
  (2, '/api/analyze', 25, date('now')),
  (3, '/api/analyze', 15, date('now')),
  (2, '/api/batch', 3, date('now')),
  (3, '/api/history', 8, date('now'));