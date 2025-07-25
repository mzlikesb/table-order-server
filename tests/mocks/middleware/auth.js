const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

// JWT 토큰 생성
const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET || 'test-secret', {
    expiresIn: process.env.JWT_EXPIRES_IN || '1h'
  });
};

// JWT 토큰 검증
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'test-secret');
  } catch (error) {
    return null;
  }
};

// 비밀번호 해싱
const hashPassword = async (password) => {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
};

// 비밀번호 비교
const comparePassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

// 토큰 인증 미들웨어 (테스트용)
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '액세스 토큰이 필요합니다' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: '유효하지 않은 토큰입니다' });
  }

  req.user = decoded;
  next();
};

// 스토어 권한 확인 미들웨어 (테스트용)
const requireStorePermission = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: '인증이 필요합니다' });
  }

  // super_admin은 모든 스토어에 접근 가능
  if (req.user.role === 'super_admin') {
    return next();
  }

  const storeId = req.headers['x-store-id'] || req.params.storeId || req.body.store_id;
  
  if (!storeId) {
    return res.status(400).json({ error: 'store_id가 필요합니다' });
  }

  // 사용자의 storeId와 요청의 storeId가 일치하는지 확인
  if (req.user.storeId && req.user.storeId.toString() !== storeId.toString()) {
    return res.status(403).json({ error: '해당 스토어에 대한 접근 권한이 없습니다' });
  }

  next();
};

// 역할 기반 접근 제어 미들웨어 (테스트용)
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: '인증이 필요합니다' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: '접근 권한이 없습니다' });
    }

    next();
  };
};

module.exports = {
  generateToken,
  verifyToken,
  hashPassword,
  comparePassword,
  authenticateToken,
  requireStorePermission,
  requireRole
}; 