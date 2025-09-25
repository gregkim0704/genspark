// Sentiment Analysis Platform Frontend

let currentUserId = 1; // Demo user ID

// Tab management
function showTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.add('hidden');
    });
    
    // Reset all tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.className = 'tab-btn bg-gray-500 text-white px-4 py-2 rounded';
    });
    
    // Show selected tab
    document.getElementById(`${tabName}-tab`).classList.remove('hidden');
    
    // Highlight selected button
    event.target.className = 'tab-btn bg-blue-500 text-white px-4 py-2 rounded';
}

// Single text analysis
async function analyzeSingle() {
    const text = document.getElementById('analyzeText').value.trim();
    const language = document.getElementById('language').value;
    const resultDiv = document.getElementById('singleResult');
    
    if (!text) {
        showError(resultDiv, '분석할 텍스트를 입력해주세요.');
        return;
    }
    
    showLoading(resultDiv, '텍스트를 분석 중입니다...');
    
    try {
        const response = await axios.post('/api/analyze', {
            text: text,
            language: language,
            user_id: currentUserId
        });
        
        const result = response.data;
        showSingleResult(resultDiv, result);
        
    } catch (error) {
        showError(resultDiv, error.response?.data?.error || '분석 중 오류가 발생했습니다.');
    }
}

// Batch analysis
async function analyzeBatch() {
    const jobName = document.getElementById('jobName').value.trim() || '배치 분석';
    const textsInput = document.getElementById('batchTexts').value.trim();
    const resultDiv = document.getElementById('batchResult');
    
    if (!textsInput) {
        showError(resultDiv, '분석할 텍스트들을 입력해주세요.');
        return;
    }
    
    const texts = textsInput.split('\n').filter(line => line.trim().length > 0);
    
    if (texts.length === 0) {
        showError(resultDiv, '유효한 텍스트가 없습니다.');
        return;
    }
    
    showLoading(resultDiv, `${texts.length}개의 텍스트를 분석 중입니다...`);
    
    try {
        const response = await axios.post('/api/batch', {
            texts: texts,
            job_name: jobName,
            user_id: currentUserId
        });
        
        const result = response.data;
        showBatchResult(resultDiv, result);
        
    } catch (error) {
        showError(resultDiv, error.response?.data?.error || '배치 분석 중 오류가 발생했습니다.');
    }
}

// Load history
async function loadHistory() {
    const resultDiv = document.getElementById('historyResult');
    showLoading(resultDiv, '히스토리를 로딩 중입니다...');
    
    try {
        const response = await axios.get(`/api/history?user_id=${currentUserId}&limit=20`);
        const data = response.data;
        showHistoryResult(resultDiv, data.analyses);
        
    } catch (error) {
        showError(resultDiv, error.response?.data?.error || '히스토리 로딩 중 오류가 발생했습니다.');
    }
}

// Load statistics
async function loadStats() {
    const resultDiv = document.getElementById('statsResult');
    showLoading(resultDiv, '통계를 로딩 중입니다...');
    
    try {
        const response = await axios.get('/api/stats');
        const data = response.data;
        showStatsResult(resultDiv, data);
        
    } catch (error) {
        showError(resultDiv, error.response?.data?.error || '통계 로딩 중 오류가 발생했습니다.');
    }
}

// UI Helper Functions
function showLoading(element, message) {
    element.innerHTML = `
        <div class="flex items-center justify-center p-4">
            <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mr-3"></div>
            <span class="text-gray-600">${message}</span>
        </div>
    `;
    element.classList.remove('hidden');
}

function showError(element, message) {
    element.innerHTML = `
        <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            <i class="fas fa-exclamation-circle mr-2"></i>
            ${message}
        </div>
    `;
    element.classList.remove('hidden');
}

function showSingleResult(element, result) {
    const sentiment = result.sentiment;
    const colorClass = getSentimentColor(sentiment.label);
    const icon = getSentimentIcon(sentiment.label);
    
    element.innerHTML = `
        <div class="bg-green-50 border border-green-200 rounded-lg p-4">
            <h3 class="text-lg font-semibold mb-3">
                <i class="fas fa-check-circle text-green-500 mr-2"></i>
                분석 완료
            </h3>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="space-y-3">
                    <div class="flex items-center">
                        <span class="text-sm font-medium text-gray-600 w-16">감정:</span>
                        <span class="flex items-center ${colorClass}">
                            <i class="${icon} mr-2"></i>
                            ${getSentimentLabel(sentiment.label)}
                        </span>
                    </div>
                    
                    <div class="flex items-center">
                        <span class="text-sm font-medium text-gray-600 w-16">점수:</span>
                        <span class="text-gray-800">${sentiment.score.toFixed(3)}</span>
                    </div>
                    
                    <div class="flex items-center">
                        <span class="text-sm font-medium text-gray-600 w-16">신뢰도:</span>
                        <span class="text-gray-800">${(sentiment.confidence * 100).toFixed(1)}%</span>
                    </div>
                </div>
                
                <div class="space-y-3">
                    <div class="flex items-center">
                        <span class="text-sm font-medium text-gray-600 w-16">언어:</span>
                        <span class="text-gray-800">${result.language}</span>
                    </div>
                    
                    <div class="flex items-center">
                        <span class="text-sm font-medium text-gray-600 w-16">ID:</span>
                        <span class="text-gray-800">#${result.id}</span>
                    </div>
                </div>
            </div>
            
            <div class="mt-4 p-3 bg-gray-50 rounded border-l-4 ${colorClass.replace('text-', 'border-')}">
                <span class="text-sm text-gray-600 block mb-1">분석된 텍스트:</span>
                <span class="text-gray-800">"${result.text}"</span>
            </div>
        </div>
    `;
    element.classList.remove('hidden');
}

function showBatchResult(element, result) {
    element.innerHTML = `
        <div class="bg-green-50 border border-green-200 rounded-lg p-4">
            <h3 class="text-lg font-semibold mb-3">
                <i class="fas fa-check-circle text-green-500 mr-2"></i>
                배치 분석 완료
            </h3>
            
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div class="text-center p-3 bg-white rounded border">
                    <div class="text-2xl font-bold text-blue-600">${result.processed_items}</div>
                    <div class="text-sm text-gray-600">처리됨</div>
                </div>
                <div class="text-center p-3 bg-white rounded border">
                    <div class="text-2xl font-bold text-green-600">${result.summary.positive}</div>
                    <div class="text-sm text-gray-600">긍정</div>
                </div>
                <div class="text-center p-3 bg-white rounded border">
                    <div class="text-2xl font-bold text-red-600">${result.summary.negative}</div>
                    <div class="text-sm text-gray-600">부정</div>
                </div>
                <div class="text-center p-3 bg-white rounded border">
                    <div class="text-2xl font-bold text-gray-600">${result.summary.neutral}</div>
                    <div class="text-sm text-gray-600">중립</div>
                </div>
            </div>
            
            <div class="text-sm text-gray-600 mb-3">
                작업 ID: #${result.job_id} | 상태: ${result.status}
            </div>
            
            ${result.results.length > 0 ? `
                <div class="mt-4">
                    <h4 class="font-medium text-gray-800 mb-2">샘플 결과 (처음 ${result.results.length}개):</h4>
                    <div class="space-y-2">
                        ${result.results.map(r => `
                            <div class="flex items-center justify-between p-2 bg-white rounded border text-sm">
                                <span class="flex-1 truncate mr-3">"${r.text}"</span>
                                <span class="flex items-center ${getSentimentColor(r.sentiment.label)}">
                                    <i class="${getSentimentIcon(r.sentiment.label)} mr-1"></i>
                                    ${getSentimentLabel(r.sentiment.label)}
                                </span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
    element.classList.remove('hidden');
}

function showHistoryResult(element, analyses) {
    if (analyses.length === 0) {
        element.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <i class="fas fa-inbox text-4xl mb-3"></i>
                <p>아직 분석 히스토리가 없습니다.</p>
            </div>
        `;
        return;
    }
    
    element.innerHTML = `
        <div class="space-y-3">
            ${analyses.map(analysis => `
                <div class="bg-white border rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div class="flex items-start justify-between">
                        <div class="flex-1">
                            <div class="text-gray-800 mb-2">"${analysis.input_text}"</div>
                            <div class="flex items-center space-x-4 text-sm text-gray-600">
                                <span class="flex items-center ${getSentimentColor(analysis.sentiment_label)}">
                                    <i class="${getSentimentIcon(analysis.sentiment_label)} mr-1"></i>
                                    ${getSentimentLabel(analysis.sentiment_label)}
                                </span>
                                <span>점수: ${analysis.sentiment_score.toFixed(3)}</span>
                                <span>신뢰도: ${(analysis.confidence * 100).toFixed(1)}%</span>
                                <span>${analysis.language.toUpperCase()}</span>
                            </div>
                        </div>
                        <div class="text-xs text-gray-500 ml-4">
                            ${formatDate(analysis.created_at)}
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function showStatsResult(element, stats) {
    element.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Overview Stats -->
            <div class="bg-white p-6 rounded-lg border">
                <h3 class="text-lg font-semibold mb-4">전체 통계</h3>
                <div class="text-center">
                    <div class="text-4xl font-bold text-blue-600 mb-2">${stats.total_analyses}</div>
                    <div class="text-gray-600">총 분석 건수</div>
                </div>
            </div>
            
            <!-- Sentiment Distribution -->
            <div class="bg-white p-6 rounded-lg border">
                <h3 class="text-lg font-semibold mb-4">감정 분포</h3>
                <div class="space-y-3">
                    ${stats.sentiment_distribution.map(item => `
                        <div class="flex items-center justify-between">
                            <span class="flex items-center ${getSentimentColor(item.sentiment_label)}">
                                <i class="${getSentimentIcon(item.sentiment_label)} mr-2"></i>
                                ${getSentimentLabel(item.sentiment_label)}
                            </span>
                            <span class="font-medium">${item.count}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <!-- Recent Activity -->
            <div class="bg-white p-6 rounded-lg border md:col-span-2">
                <h3 class="text-lg font-semibold mb-4">최근 7일 활동</h3>
                <div class="space-y-2">
                    ${stats.recent_activity.length > 0 ? stats.recent_activity.map(activity => `
                        <div class="flex items-center justify-between py-2 border-b">
                            <span>${formatDate(activity.date)}</span>
                            <span class="font-medium">${activity.count}건</span>
                        </div>
                    `).join('') : '<p class="text-gray-500 text-center py-4">최근 활동이 없습니다.</p>'}
                </div>
            </div>
        </div>
    `;
}

// Utility functions
function getSentimentColor(label) {
    switch (label) {
        case 'positive': return 'text-green-600';
        case 'negative': return 'text-red-600';
        case 'neutral': return 'text-gray-600';
        default: return 'text-gray-600';
    }
}

function getSentimentIcon(label) {
    switch (label) {
        case 'positive': return 'fas fa-smile';
        case 'negative': return 'fas fa-frown';
        case 'neutral': return 'fas fa-meh';
        default: return 'fas fa-meh';
    }
}

function getSentimentLabel(label) {
    switch (label) {
        case 'positive': return '긍정';
        case 'negative': return '부정';
        case 'neutral': return '중립';
        default: return '알 수 없음';
    }
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    // Show analyze tab by default
    showTab('analyze');
    
    // Load initial data
    loadStats();
});