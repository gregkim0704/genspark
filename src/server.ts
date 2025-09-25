import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { cors } from 'hono/cors'
import Database from 'sqlite3'
import { analyzeSentiment } from './sentiment-analyzer.js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Initialize SQLite database
const db = new Database.Database(':memory:')

// Initialize database schema
const schemaSQL = readFileSync(join(__dirname, '../migrations/0001_initial_schema.sql'), 'utf-8')
db.exec(schemaSQL)

// Seed data
const seedSQL = readFileSync(join(__dirname, '../seed.sql'), 'utf-8')
db.exec(seedSQL)

const app = new Hono()

// Enable CORS
app.use('*', cors())

// Serve static files
app.use('/static/*', serveStatic({ root: './public' }))

// Helper function to run database queries
function runQuery(query: string, params: any[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) {
        reject(err)
      } else {
        resolve(rows)
      }
    })
  })
}

function runInsert(query: string, params: any[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
      if (err) {
        reject(err)
      } else {
        resolve({ lastID: this.lastID, changes: this.changes })
      }
    })
  })
}

// Sentiment Analysis API Routes
app.post('/api/analyze', async (c) => {
  try {
    const { text, language = 'ko', user_id } = await c.req.json()
    
    if (!text || text.trim().length === 0) {
      return c.json({ error: '분석할 텍스트를 입력해주세요.' }, 400)
    }

    // Use local sentiment analyzer
    const localResult = analyzeSentiment(text, language)
    let sentiment_score = 0
    let sentiment_label = 'neutral'
    let confidence = localResult.score

    if (localResult.label === 'POSITIVE') {
      sentiment_score = localResult.score
      sentiment_label = 'positive'
    } else if (localResult.label === 'NEGATIVE') {
      sentiment_score = -localResult.score
      sentiment_label = 'negative'
    } else {
      sentiment_score = 0
      sentiment_label = 'neutral'
    }

    // Save to database
    const insertResult = await runInsert(`
      INSERT INTO sentiment_analyses (user_id, input_text, sentiment_score, sentiment_label, confidence, language)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [user_id || null, text, sentiment_score, sentiment_label, confidence, language])

    // Update API usage
    if (user_id) {
      await runInsert(`
        INSERT OR REPLACE INTO api_usage (user_id, endpoint, request_count, date)
        VALUES (?, '/api/analyze', COALESCE((SELECT request_count FROM api_usage WHERE user_id = ? AND endpoint = '/api/analyze' AND date = date('now')), 0) + 1, date('now'))
      `, [user_id, user_id])
    }

    return c.json({
      id: insertResult.lastID,
      text,
      sentiment: {
        score: sentiment_score,
        label: sentiment_label,
        confidence: confidence
      },
      language,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Sentiment analysis error:', error)
    return c.json({ error: '감정 분석 중 오류가 발생했습니다.' }, 500)
  }
})

// Get analysis history
app.get('/api/history', async (c) => {
  const user_id = c.req.query('user_id')
  const limit = parseInt(c.req.query('limit') || '50')
  const offset = parseInt(c.req.query('offset') || '0')

  try {
    let query = `
      SELECT id, input_text, sentiment_score, sentiment_label, confidence, language, created_at
      FROM sentiment_analyses
    `
    let params: any[] = []

    if (user_id) {
      query += ` WHERE user_id = ?`
      params.push(user_id)
    }

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`
    params.push(limit, offset)

    const results = await runQuery(query, params)

    return c.json({
      analyses: results,
      pagination: {
        limit,
        offset,
        has_more: results.length === limit
      }
    })

  } catch (error) {
    console.error('History fetch error:', error)
    return c.json({ error: '히스토리 조회 중 오류가 발생했습니다.' }, 500)
  }
})

// Batch analysis endpoint
app.post('/api/batch', async (c) => {
  try {
    const { texts, job_name, user_id } = await c.req.json()

    if (!Array.isArray(texts) || texts.length === 0) {
      return c.json({ error: '분석할 텍스트 배열을 제공해주세요.' }, 400)
    }

    // Create batch job
    const jobResult = await runInsert(`
      INSERT INTO batch_jobs (user_id, job_name, status, total_items)
      VALUES (?, ?, 'processing', ?)
    `, [user_id || null, job_name || '배치 작업', texts.length])

    const jobId = jobResult.lastID

    // Process texts
    const results = []
    let processed = 0

    for (const text of texts.slice(0, 10)) { // Limit for demo
      try {
        const localResult = analyzeSentiment(text, 'ko')
        let sentiment_score = 0
        let sentiment_label = 'neutral'
        let confidence = localResult.score

        if (localResult.label === 'POSITIVE') {
          sentiment_score = localResult.score
          sentiment_label = 'positive'
        } else if (localResult.label === 'NEGATIVE') {
          sentiment_score = -localResult.score
          sentiment_label = 'negative'
        } else {
          sentiment_score = 0
          sentiment_label = 'neutral'
        }

        // Save individual result
        await runInsert(`
          INSERT INTO sentiment_analyses (user_id, input_text, sentiment_score, sentiment_label, confidence, language)
          VALUES (?, ?, ?, ?, ?, 'ko')
        `, [user_id || null, text, sentiment_score, sentiment_label, confidence])

        results.push({
          text,
          sentiment: { score: sentiment_score, label: sentiment_label, confidence }
        })

        processed++
      } catch (error) {
        console.error(`Error processing text: ${text}`, error)
      }
    }

    // Update job status
    const summary = {
      positive: results.filter(r => r.sentiment.label === 'positive').length,
      negative: results.filter(r => r.sentiment.label === 'negative').length,
      neutral: results.filter(r => r.sentiment.label === 'neutral').length
    }

    await runInsert(`
      UPDATE batch_jobs 
      SET status = 'completed', processed_items = ?, results_summary = ?, completed_at = datetime('now')
      WHERE id = ?
    `, [processed, JSON.stringify(summary), jobId])

    return c.json({
      job_id: jobId,
      status: 'completed',
      processed_items: processed,
      total_items: texts.length,
      summary,
      results: results.slice(0, 5)
    })

  } catch (error) {
    console.error('Batch analysis error:', error)
    return c.json({ error: '배치 분석 중 오류가 발생했습니다.' }, 500)
  }
})

// Get batch job status
app.get('/api/batch/:jobId', async (c) => {
  const jobId = c.req.param('jobId')

  try {
    const results = await runQuery(`
      SELECT * FROM batch_jobs WHERE id = ?
    `, [jobId])

    if (results.length === 0) {
      return c.json({ error: '작업을 찾을 수 없습니다.' }, 404)
    }

    return c.json(results[0])

  } catch (error) {
    console.error('Batch job fetch error:', error)
    return c.json({ error: '작업 상태 조회 중 오류가 발생했습니다.' }, 500)
  }
})

// User management
app.post('/api/users', async (c) => {
  try {
    const { email, name } = await c.req.json()

    if (!email || !name) {
      return c.json({ error: '이메일과 이름을 제공해주세요.' }, 400)
    }

    const result = await runInsert(`
      INSERT INTO users (email, name) VALUES (?, ?)
    `, [email, name])

    return c.json({
      id: result.lastID,
      email,
      name,
      created_at: new Date().toISOString()
    })

  } catch (error: any) {
    if (error.message && error.message.includes('UNIQUE constraint failed')) {
      return c.json({ error: '이미 존재하는 이메일입니다.' }, 409)
    }
    console.error('User creation error:', error)
    return c.json({ error: '사용자 생성 중 오류가 발생했습니다.' }, 500)
  }
})

// Get API statistics
app.get('/api/stats', async (c) => {
  try {
    // Total analyses
    const totalAnalyses = await runQuery(`
      SELECT COUNT(*) as count FROM sentiment_analyses
    `)

    // Analyses by sentiment
    const sentimentStats = await runQuery(`
      SELECT sentiment_label, COUNT(*) as count 
      FROM sentiment_analyses 
      GROUP BY sentiment_label
    `)

    // Recent activity (last 7 days)
    const recentActivity = await runQuery(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM sentiment_analyses 
      WHERE created_at >= datetime('now', '-7 days')
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `)

    return c.json({
      total_analyses: totalAnalyses[0].count,
      sentiment_distribution: sentimentStats,
      recent_activity: recentActivity
    })

  } catch (error) {
    console.error('Stats fetch error:', error)
    return c.json({ error: '통계 조회 중 오류가 발생했습니다.' }, 500)
  }
})

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
                <p class="text-sm text-blue-600 mt-2">Railway 배포 버전</p>
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

const port = parseInt(process.env.PORT || '3000')

console.log(`🚀 Sentiment Analysis Platform starting on port ${port}`)
console.log(`🌐 Railway deployment ready`)

serve({
  fetch: app.fetch,
  port
})

export default app