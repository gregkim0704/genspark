import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import { analyzeSentiment } from './sentiment-analyzer'

type Bindings = {
  DB: D1Database;
  AI: Ai;
}

const app = new Hono<{ Bindings: Bindings }>()

// Enable CORS for API routes
app.use('/api/*', cors())

// Serve static files
app.use('/static/*', serveStatic({ root: './public' }))

// Sentiment Analysis API Routes
app.post('/api/analyze', async (c) => {
  const { env } = c;
  
  try {
    const { text, language = 'ko', user_id } = await c.req.json();
    
    if (!text || text.trim().length === 0) {
      return c.json({ error: '분석할 텍스트를 입력해주세요.' }, 400);
    }

    // Use local sentiment analysis (fallback for development)
    let aiResponse;
    let sentiment_score = 0;
    let sentiment_label = 'neutral';
    let confidence = 0;

    try {
      // Try Cloudflare AI first if available
      if (env.AI) {
        aiResponse = await env.AI.run('@cf/huggingface/distilbert-sst-2-int8', {
          text: text
        });
      }
    } catch (error) {
      console.log('Cloudflare AI not available, using local analyzer');
    }

    if (aiResponse && Array.isArray(aiResponse) && aiResponse.length > 0) {
      // Use Cloudflare AI result
      const result = aiResponse[0];
      if (result.label === 'POSITIVE') {
        sentiment_score = result.score;
        sentiment_label = 'positive';
      } else if (result.label === 'NEGATIVE') {
        sentiment_score = -result.score;
        sentiment_label = 'negative';
      }
      confidence = result.score;
    } else {
      // Use local sentiment analyzer as fallback
      const localResult = analyzeSentiment(text, language);
      if (localResult.label === 'POSITIVE') {
        sentiment_score = localResult.score;
        sentiment_label = 'positive';
      } else if (localResult.label === 'NEGATIVE') {
        sentiment_score = -localResult.score;
        sentiment_label = 'negative';
      } else {
        sentiment_score = 0;
        sentiment_label = 'neutral';
      }
      confidence = localResult.score;
    }

    // Save to database
    const insertResult = await env.DB.prepare(`
      INSERT INTO sentiment_analyses (user_id, input_text, sentiment_score, sentiment_label, confidence, language)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(user_id || null, text, sentiment_score, sentiment_label, confidence, language).run();

    // Update API usage
    if (user_id) {
      await env.DB.prepare(`
        INSERT OR REPLACE INTO api_usage (user_id, endpoint, request_count, date)
        VALUES (?, '/api/analyze', COALESCE((SELECT request_count FROM api_usage WHERE user_id = ? AND endpoint = '/api/analyze' AND date = date('now')), 0) + 1, date('now'))
      `).bind(user_id, user_id).run();
    }

    return c.json({
      id: insertResult.meta.last_row_id,
      text,
      sentiment: {
        score: sentiment_score,
        label: sentiment_label,
        confidence: confidence
      },
      language,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Sentiment analysis error:', error);
    return c.json({ error: '감정 분석 중 오류가 발생했습니다.' }, 500);
  }
});

// Get analysis history
app.get('/api/history', async (c) => {
  const { env } = c;
  const user_id = c.req.query('user_id');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  try {
    let query = `
      SELECT id, input_text, sentiment_score, sentiment_label, confidence, language, created_at
      FROM sentiment_analyses
    `;
    let params: any[] = [];

    if (user_id) {
      query += ` WHERE user_id = ?`;
      params.push(user_id);
    }

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const { results } = await env.DB.prepare(query).bind(...params).all();

    return c.json({
      analyses: results,
      pagination: {
        limit,
        offset,
        has_more: results.length === limit
      }
    });

  } catch (error) {
    console.error('History fetch error:', error);
    return c.json({ error: '히스토리 조회 중 오류가 발생했습니다.' }, 500);
  }
});

// Batch analysis endpoint
app.post('/api/batch', async (c) => {
  const { env } = c;
  
  try {
    const { texts, job_name, user_id } = await c.req.json();

    if (!Array.isArray(texts) || texts.length === 0) {
      return c.json({ error: '분석할 텍스트 배열을 제공해주세요.' }, 400);
    }

    // Create batch job
    const jobResult = await env.DB.prepare(`
      INSERT INTO batch_jobs (user_id, job_name, status, total_items)
      VALUES (?, ?, 'processing', ?)
    `).bind(user_id || null, job_name || '배치 작업', texts.length).run();

    const jobId = jobResult.meta.last_row_id;

    // Process texts (in a real implementation, this would be queued)
    const results = [];
    let processed = 0;

    for (const text of texts.slice(0, 10)) { // Limit for demo
      try {
        let aiResponse;
        let sentiment_score = 0;
        let sentiment_label = 'neutral';
        let confidence = 0;

        try {
          // Try Cloudflare AI first if available
          if (env.AI) {
            aiResponse = await env.AI.run('@cf/huggingface/distilbert-sst-2-int8', {
              text: text
            });
          }
        } catch (error) {
          console.log('Cloudflare AI not available for batch, using local analyzer');
        }

        if (aiResponse && Array.isArray(aiResponse) && aiResponse.length > 0) {
          // Use Cloudflare AI result
          const result = aiResponse[0];
          if (result.label === 'POSITIVE') {
            sentiment_score = result.score;
            sentiment_label = 'positive';
          } else if (result.label === 'NEGATIVE') {
            sentiment_score = -result.score;
            sentiment_label = 'negative';
          }
          confidence = result.score;
        } else {
          // Use local sentiment analyzer as fallback
          const localResult = analyzeSentiment(text, 'ko');
          if (localResult.label === 'POSITIVE') {
            sentiment_score = localResult.score;
            sentiment_label = 'positive';
          } else if (localResult.label === 'NEGATIVE') {
            sentiment_score = -localResult.score;
            sentiment_label = 'negative';
          } else {
            sentiment_score = 0;
            sentiment_label = 'neutral';
          }
          confidence = localResult.score;
        }

        // Save individual result
        await env.DB.prepare(`
          INSERT INTO sentiment_analyses (user_id, input_text, sentiment_score, sentiment_label, confidence, language)
          VALUES (?, ?, ?, ?, ?, 'ko')
        `).bind(user_id || null, text, sentiment_score, sentiment_label, confidence).run();

        results.push({
          text,
          sentiment: { score: sentiment_score, label: sentiment_label, confidence }
        });

        processed++;
      } catch (error) {
        console.error(`Error processing text: ${text}`, error);
      }
    }

    // Update job status
    const summary = {
      positive: results.filter(r => r.sentiment.label === 'positive').length,
      negative: results.filter(r => r.sentiment.label === 'negative').length,
      neutral: results.filter(r => r.sentiment.label === 'neutral').length
    };

    await env.DB.prepare(`
      UPDATE batch_jobs 
      SET status = 'completed', processed_items = ?, results_summary = ?, completed_at = datetime('now')
      WHERE id = ?
    `).bind(processed, JSON.stringify(summary), jobId).run();

    return c.json({
      job_id: jobId,
      status: 'completed',
      processed_items: processed,
      total_items: texts.length,
      summary,
      results: results.slice(0, 5) // Return first 5 results as preview
    });

  } catch (error) {
    console.error('Batch analysis error:', error);
    return c.json({ error: '배치 분석 중 오류가 발생했습니다.' }, 500);
  }
});

// Get batch job status
app.get('/api/batch/:jobId', async (c) => {
  const { env } = c;
  const jobId = c.req.param('jobId');

  try {
    const { results } = await env.DB.prepare(`
      SELECT * FROM batch_jobs WHERE id = ?
    `).bind(jobId).all();

    if (results.length === 0) {
      return c.json({ error: '작업을 찾을 수 없습니다.' }, 404);
    }

    return c.json(results[0]);

  } catch (error) {
    console.error('Batch job fetch error:', error);
    return c.json({ error: '작업 상태 조회 중 오류가 발생했습니다.' }, 500);
  }
});

// User management
app.post('/api/users', async (c) => {
  const { env } = c;
  
  try {
    const { email, name } = await c.req.json();

    if (!email || !name) {
      return c.json({ error: '이메일과 이름을 제공해주세요.' }, 400);
    }

    const result = await env.DB.prepare(`
      INSERT INTO users (email, name) VALUES (?, ?)
    `).bind(email, name).run();

    return c.json({
      id: result.meta.last_row_id,
      email,
      name,
      created_at: new Date().toISOString()
    });

  } catch (error) {
    if (error.message && error.message.includes('UNIQUE constraint failed')) {
      return c.json({ error: '이미 존재하는 이메일입니다.' }, 409);
    }
    console.error('User creation error:', error);
    return c.json({ error: '사용자 생성 중 오류가 발생했습니다.' }, 500);
  }
});

// Get API statistics
app.get('/api/stats', async (c) => {
  const { env } = c;

  try {
    // Total analyses
    const totalAnalyses = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM sentiment_analyses
    `).first();

    // Analyses by sentiment
    const sentimentStats = await env.DB.prepare(`
      SELECT sentiment_label, COUNT(*) as count 
      FROM sentiment_analyses 
      GROUP BY sentiment_label
    `).all();

    // Recent activity (last 7 days)
    const recentActivity = await env.DB.prepare(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM sentiment_analyses 
      WHERE created_at >= datetime('now', '-7 days')
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `).all();

    return c.json({
      total_analyses: totalAnalyses.count,
      sentiment_distribution: sentimentStats.results,
      recent_activity: recentActivity.results
    });

  } catch (error) {
    console.error('Stats fetch error:', error);
    return c.json({ error: '통계 조회 중 오류가 발생했습니다.' }, 500);
  }
});

// Main web interface
app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Sentiment Analysis Platform</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    </head>
    <body class="bg-gray-100 min-h-screen">
        <div class="container mx-auto px-4 py-8">
            <header class="text-center mb-8">
                <h1 class="text-4xl font-bold text-gray-800 mb-2">
                    <i class="fas fa-brain mr-3"></i>
                    Sentiment Analysis Platform
                </h1>
                <p class="text-gray-600">AI 기반 텍스트 감정 분석 플랫폼</p>
            </header>

            <!-- Navigation -->
            <nav class="mb-8">
                <div class="flex justify-center space-x-4">
                    <button onclick="showTab('analyze')" class="tab-btn bg-blue-500 text-white px-4 py-2 rounded">
                        <i class="fas fa-search mr-2"></i>분석
                    </button>
                    <button onclick="showTab('batch')" class="tab-btn bg-gray-500 text-white px-4 py-2 rounded">
                        <i class="fas fa-layer-group mr-2"></i>배치분석
                    </button>
                    <button onclick="showTab('history')" class="tab-btn bg-gray-500 text-white px-4 py-2 rounded">
                        <i class="fas fa-history mr-2"></i>히스토리
                    </button>
                    <button onclick="showTab('stats')" class="tab-btn bg-gray-500 text-white px-4 py-2 rounded">
                        <i class="fas fa-chart-bar mr-2"></i>통계
                    </button>
                </div>
            </nav>

            <!-- Single Text Analysis Tab -->
            <div id="analyze-tab" class="tab-content">
                <div class="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h2 class="text-2xl font-semibold mb-4">텍스트 감정 분석</h2>
                    <div class="mb-4">
                        <textarea id="analyzeText" placeholder="분석할 텍스트를 입력하세요..." 
                                class="w-full p-3 border border-gray-300 rounded-lg resize-none" rows="4"></textarea>
                    </div>
                    <div class="flex justify-between items-center mb-4">
                        <select id="language" class="px-3 py-2 border border-gray-300 rounded">
                            <option value="ko">한국어</option>
                            <option value="en">English</option>
                        </select>
                        <button onclick="analyzeSingle()" class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded">
                            <i class="fas fa-search mr-2"></i>분석하기
                        </button>
                    </div>
                    <div id="singleResult" class="hidden mt-4"></div>
                </div>
            </div>

            <!-- Batch Analysis Tab -->
            <div id="batch-tab" class="tab-content hidden">
                <div class="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h2 class="text-2xl font-semibold mb-4">배치 텍스트 분석</h2>
                    <div class="mb-4">
                        <input id="jobName" placeholder="작업 이름" class="w-full p-3 border border-gray-300 rounded-lg mb-2">
                        <textarea id="batchTexts" placeholder="한 줄에 하나씩 텍스트를 입력하세요..." 
                                class="w-full p-3 border border-gray-300 rounded-lg resize-none" rows="6"></textarea>
                    </div>
                    <button onclick="analyzeBatch()" class="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded">
                        <i class="fas fa-layer-group mr-2"></i>배치 분석 시작
                    </button>
                    <div id="batchResult" class="hidden mt-4"></div>
                </div>
            </div>

            <!-- History Tab -->
            <div id="history-tab" class="tab-content hidden">
                <div class="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h2 class="text-2xl font-semibold mb-4">분석 히스토리</h2>
                    <button onclick="loadHistory()" class="bg-purple-500 hover:bg-purple-600 text-white px-6 py-2 rounded mb-4">
                        <i class="fas fa-refresh mr-2"></i>새로고침
                    </button>
                    <div id="historyResult"></div>
                </div>
            </div>

            <!-- Statistics Tab -->
            <div id="stats-tab" class="tab-content hidden">
                <div class="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h2 class="text-2xl font-semibold mb-4">통계</h2>
                    <button onclick="loadStats()" class="bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-2 rounded mb-4">
                        <i class="fas fa-chart-bar mr-2"></i>통계 로드
                    </button>
                    <div id="statsResult"></div>
                </div>
            </div>
        </div>

        <!-- Footer -->
        <footer class="bg-gray-800 text-white py-4 mt-12">
            <div class="container mx-auto px-4 text-center">
                <p>&copy; 2024 한국인프라연구원(주) | infrastructure@kakao.com | 010-9143-0800</p>
            </div>
        </footer>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="/static/app.js"></script>
    </body>
    </html>
  `)
})

export default app