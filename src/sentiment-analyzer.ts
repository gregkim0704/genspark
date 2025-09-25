// Simple rule-based sentiment analyzer for demo purposes
// In production, you would use Cloudflare AI or external API

interface SentimentResult {
  label: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  score: number;
}

export function analyzeSentiment(text: string, language: string = 'ko'): SentimentResult {
  if (language === 'ko') {
    return analyzeKoreanSentiment(text);
  } else {
    return analyzeEnglishSentiment(text);
  }
}

function analyzeKoreanSentiment(text: string): SentimentResult {
  const positiveWords = [
    '좋다', '좋은', '좋습니다', '기분좋다', '기쁘다', '행복하다', '행복한', '훌륭하다', '멋지다', 
    '완벽하다', '최고다', '사랑한다', '좋아한다', '감사하다', '만족하다', '성공적이다',
    '흥미롭다', '재미있다', '놀라운', '탁월한', '우수한', '효과적인', '편리한'
  ];
  
  const negativeWords = [
    '싫다', '싫은', '나쁘다', '나쁜', '실망스럽다', '실망', '화나다', '화가', '슬프다', '슬픈',
    '짜증나다', '문제가', '오류가', '실패', '최악', '별로', '비싸다', '어렵다', '복잡하다',
    '불편하다', '불만', '후회', '걱정', '스트레스', '피곤하다'
  ];

  let positiveCount = 0;
  let negativeCount = 0;

  // Count positive words
  for (const word of positiveWords) {
    if (text.includes(word)) {
      positiveCount++;
    }
  }

  // Count negative words
  for (const word of negativeWords) {
    if (text.includes(word)) {
      negativeCount++;
    }
  }

  // Calculate sentiment
  const totalWords = text.length > 0 ? text.split(/\s+/).length : 1;
  const positiveScore = positiveCount / totalWords;
  const negativeScore = negativeCount / totalWords;

  if (positiveScore > negativeScore && positiveScore > 0.1) {
    return {
      label: 'POSITIVE',
      score: Math.min(0.6 + positiveScore * 2, 0.95)
    };
  } else if (negativeScore > positiveScore && negativeScore > 0.1) {
    return {
      label: 'NEGATIVE', 
      score: Math.min(0.6 + negativeScore * 2, 0.95)
    };
  } else {
    return {
      label: 'NEUTRAL',
      score: Math.max(0.5 + Math.random() * 0.2, 0.6)
    };
  }
}

function analyzeEnglishSentiment(text: string): SentimentResult {
  const positiveWords = [
    'good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'love', 'like',
    'happy', 'pleased', 'satisfied', 'perfect', 'awesome', 'brilliant', 'outstanding',
    'impressive', 'effective', 'convenient', 'useful', 'helpful'
  ];

  const negativeWords = [
    'bad', 'terrible', 'horrible', 'awful', 'disappointing', 'sad', 'angry', 'hate',
    'dislike', 'frustrated', 'annoyed', 'problem', 'issue', 'error', 'failed', 'worst',
    'expensive', 'difficult', 'complicated', 'inconvenient', 'useless'
  ];

  const lowerText = text.toLowerCase();
  let positiveCount = 0;
  let negativeCount = 0;

  // Count positive words
  for (const word of positiveWords) {
    const regex = new RegExp(`\\b${word}\\b`, 'g');
    const matches = lowerText.match(regex);
    if (matches) {
      positiveCount += matches.length;
    }
  }

  // Count negative words
  for (const word of negativeWords) {
    const regex = new RegExp(`\\b${word}\\b`, 'g');
    const matches = lowerText.match(regex);
    if (matches) {
      negativeCount += matches.length;
    }
  }

  // Calculate sentiment
  const words = text.trim().split(/\s+/);
  const totalWords = words.length > 0 ? words.length : 1;
  const positiveScore = positiveCount / totalWords;
  const negativeScore = negativeCount / totalWords;

  if (positiveScore > negativeScore && positiveScore > 0.05) {
    return {
      label: 'POSITIVE',
      score: Math.min(0.6 + positiveScore * 3, 0.95)
    };
  } else if (negativeScore > positiveScore && negativeScore > 0.05) {
    return {
      label: 'NEGATIVE',
      score: Math.min(0.6 + negativeScore * 3, 0.95)
    };
  } else {
    return {
      label: 'NEUTRAL', 
      score: Math.max(0.5 + Math.random() * 0.2, 0.6)
    };
  }
}