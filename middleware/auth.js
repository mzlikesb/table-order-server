const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('../db/connection');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * JWT 토큰 생성
 */
const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

/**
 * JWT 토큰 검증
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

/**
 * 비밀번호 해시화
 */
const hashPassword = async (password) => {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
};

/**
 * 비밀번호 검증
 */
const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

/**
 * JWT 인증 미들웨어
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: '액세스 토큰이 필요합니다' });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(403).json({ error: '유효하지 않은 토큰입니다' });
    }

    // 관리자 정보 조회
    const adminResult = await pool.query(
      'SELECT id, username, email, is_super_admin FROM admins WHERE id = $1',
      [decoded.adminId]
    );

    if (adminResult.rowCount === 0) {
      return res.status(403).json({ error: '존재하지 않는 관리자입니다' });
    }

    req.user = adminResult.rows[0];
    next();
  } catch (error) {
    console.error('JWT 인증 오류:', error);
    res.status(500).json({ error: '인증 처리 중 오류가 발생했습니다' });
  }
};

/**
 * 스토어 권한 검증 미들웨어
 */
const requireStorePermission = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: '인증이 필요합니다' });
    }

    if (!req.tenant || !req.tenant.storeId) {
      return res.status(400).json({ error: 'store_id가 필요합니다' });
    }

    // 슈퍼 관리자는 모든 스토어 접근 가능
    if (req.user.is_super_admin) {
      return next();
    }

    // 일반 관리자는 권한 확인
    const permissionResult = await pool.query(
      `SELECT role FROM admin_store_permissions 
       WHERE admin_id = $1 AND store_id = $2`,
      [req.user.id, req.tenant.storeId]
    );

    if (permissionResult.rowCount === 0) {
      return res.status(403).json({ error: '해당 스토어에 대한 권한이 없습니다' });
    }

    req.user.storeRole = permissionResult.rows[0].role;
    next();
  } catch (error) {
    console.error('스토어 권한 검증 오류:', error);
    res.status(500).json({ error: '권한 검증 중 오류가 발생했습니다' });
  }
};

/**
 * 역할 기반 권한 검증 미들웨어
 */
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: '인증이 필요합니다' });
    }

    // 슈퍼 관리자는 모든 권한
    if (req.user.is_super_admin) {
      return next();
    }

    // 스토어 권한 확인
    if (!req.user.storeRole) {
      return res.status(403).json({ error: '스토어 권한이 없습니다' });
    }

    if (!allowedRoles.includes(req.user.storeRole)) {
      return res.status(403).json({ error: '권한이 부족합니다' });
    }

    next();
  };
};

/**
 * 고객용 간단한 인증 (테이블 ID + 스토어 ID만 확인)
 */
const authenticateCustomer = (req, res, next) => {
  const tableId = req.headers['x-table-id'];
  const storeId = req.headers['x-store-id'];
  
  if (!tableId || !storeId) {
    return res.status(400).json({ 
      error: '테이블 ID와 스토어 ID가 필요합니다' 
    });
  }
  
  req.customer = {
    tableId: tableId,
    storeId: storeId
  };
  
  next();
};

module.exports = {
  generateToken,
  verifyToken,
  hashPassword,
  comparePassword,
  authenticateToken,
  requireStorePermission,
  requireRole,
  authenticateCustomer
}; 