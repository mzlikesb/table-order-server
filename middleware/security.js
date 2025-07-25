const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

/**
 * Rate Limiting 설정
 */
const createRateLimit = (windowMs = 15 * 60 * 1000, max = 100) => {
  return rateLimit({
    windowMs, // 15분
    max, // 최대 요청 수
    message: {
      error: '너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.'
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

/**
 * 로그인 전용 Rate Limiting (더 엄격)
 */
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 5, // 최대 5번 시도
  message: {
    error: '로그인 시도가 너무 많습니다. 15분 후 다시 시도해주세요.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * API 전용 Rate Limiting
 */
const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 1000, // 최대 1000번 요청
  message: {
    error: 'API 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * CORS 설정
 */
const corsOptions = {
  origin: function (origin, callback) {
    // 개발 환경에서는 모든 origin 허용
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    // 프로덕션에서는 허용된 도메인만
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS 정책에 의해 차단되었습니다'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Store-ID', 'X-Admin-ID']
};

/**
 * Helmet 보안 설정
 */
const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
});

/**
 * 입력 데이터 검증 미들웨어
 */
const validateInput = (req, res, next) => {
  // XSS 방지를 위한 입력 데이터 sanitization
  const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    return str
      .replace(/[<>]/g, '') // < > 제거
      .trim();
  };

  // 요청 바디 sanitization
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = sanitizeString(req.body[key]);
      }
    });
  }

  // 쿼리 파라미터 sanitization
  if (req.query) {
    Object.keys(req.query).forEach(key => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = sanitizeString(req.query[key]);
      }
    });
  }

  next();
};

/**
 * 요청 로깅 미들웨어
 */
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    };

    // 에러 로깅
    if (res.statusCode >= 400) {
      console.error('API Error:', logData);
    } else {
      console.log('API Request:', logData);
    }
  });

  next();
};

/**
 * 에러 핸들링 미들웨어
 */
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // JWT 에러
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: '유효하지 않은 토큰입니다' });
  }

  // JWT 만료 에러
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: '토큰이 만료되었습니다' });
  }

  // CORS 에러
  if (err.message === 'CORS 정책에 의해 차단되었습니다') {
    return res.status(403).json({ error: '허용되지 않은 도메인입니다' });
  }

  // 데이터베이스 에러
  if (err.code === '23505') { // Unique violation
    return res.status(409).json({ error: '이미 존재하는 데이터입니다' });
  }

  if (err.code === '23503') { // Foreign key violation
    return res.status(400).json({ error: '참조하는 데이터가 존재하지 않습니다' });
  }

  // 기본 에러
  res.status(500).json({ 
    error: process.env.NODE_ENV === 'production' 
      ? '서버 내부 오류가 발생했습니다' 
      : err.message 
  });
};

module.exports = {
  createRateLimit,
  loginRateLimit,
  apiRateLimit,
  corsOptions,
  helmetConfig,
  validateInput,
  requestLogger,
  errorHandler
}; 