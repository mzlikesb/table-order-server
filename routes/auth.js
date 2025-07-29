const express = require('express');
const router = express.Router();
const pool = require('../db/connection');
const { 
  generateToken, 
  hashPassword, 
  comparePassword,
  authenticateToken 
} = require('../middleware/auth');

/**
 * [POST] /api/auth/login
 * 관리자 로그인
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '사용자명과 비밀번호가 필요합니다' });
    }

    // 관리자 정보 조회
    const adminResult = await pool.query(
      'SELECT id, username, email, password_hash, is_super_admin FROM admins WHERE username = $1',
      [username]
    );

    if (adminResult.rowCount === 0) {
      return res.status(401).json({ error: '잘못된 사용자명 또는 비밀번호입니다' });
    }

    const admin = adminResult.rows[0];

    // 디버깅 로그
    console.log('=== 로그인 디버그 ===');
    console.log('Username:', username);
    console.log('Password:', password);
    console.log('Stored Hash:', admin.password_hash);
    console.log('Is Super Admin:', admin.is_super_admin);
    
    // 비밀번호 검증
    const isValidPassword = await comparePassword(password, admin.password_hash);
    console.log('Password Valid:', isValidPassword);
    console.log('========================');
    
    if (!isValidPassword) {
      return res.status(401).json({ error: '잘못된 사용자명 또는 비밀번호입니다' });
    }

    // 마지막 로그인 시간 업데이트
    await pool.query(
      'UPDATE admins SET last_login_at = NOW() WHERE id = $1',
      [admin.id]
    );

    // JWT 토큰 생성
    const token = generateToken({
      adminId: admin.id,
      username: admin.username,
      isSuperAdmin: admin.is_super_admin
    });

    // 관리자가 접근 가능한 스토어 목록 조회
    const storesResult = await pool.query(`
      SELECT s.id, s.name, s.code, asp.role
      FROM stores s
      JOIN admin_store_permissions asp ON s.id = asp.store_id
      WHERE asp.admin_id = $1 AND s.is_active = true
      ORDER BY s.name
    `, [admin.id]);

    res.json({
      token,
      user: {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        isSuperAdmin: admin.is_super_admin
      },
      stores: storesResult.rows
    });

  } catch (error) {
    console.error('로그인 실패:', error);
    res.status(500).json({ error: '로그인 처리 중 오류가 발생했습니다' });
  }
});

/**
 * [POST] /api/auth/register
 * 관리자 회원가입 (슈퍼 관리자만 가능)
 */
router.post('/register', authenticateToken, async (req, res) => {
  try {
    // 슈퍼 관리자 권한 확인
    if (!req.user.is_super_admin) {
      return res.status(403).json({ error: '슈퍼 관리자만 회원가입을 처리할 수 있습니다' });
    }

    const { username, email, password, is_super_admin = false } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: '사용자명, 이메일, 비밀번호가 필요합니다' });
    }

    // 중복 확인
    const existingAdmin = await pool.query(
      'SELECT id FROM admins WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingAdmin.rowCount > 0) {
      return res.status(400).json({ error: '이미 존재하는 사용자명 또는 이메일입니다' });
    }

    // 비밀번호 해시화
    const hashedPassword = await hashPassword(password);

    // 관리자 생성
    const result = await pool.query(
      `INSERT INTO admins (username, email, password_hash, is_super_admin)
       VALUES ($1, $2, $3, $4) RETURNING id, username, email, is_super_admin`,
      [username, email, hashedPassword, is_super_admin]
    );

    res.status(201).json({
      message: '관리자가 성공적으로 생성되었습니다',
      admin: result.rows[0]
    });

  } catch (error) {
    console.error('회원가입 실패:', error);
    res.status(500).json({ error: '회원가입 처리 중 오류가 발생했습니다' });
  }
});

/**
 * [POST] /api/auth/refresh
 * 토큰 갱신
 */
router.post('/refresh', authenticateToken, async (req, res) => {
  try {
    // 새로운 토큰 생성
    const newToken = generateToken({
      adminId: req.user.id,
      username: req.user.username,
      isSuperAdmin: req.user.is_super_admin
    });

    res.json({
      token: newToken,
      user: {
        id: req.user.id,
        username: req.user.username,
        email: req.user.email,
        isSuperAdmin: req.user.is_super_admin
      }
    });

  } catch (error) {
    console.error('토큰 갱신 실패:', error);
    res.status(500).json({ error: '토큰 갱신 중 오류가 발생했습니다' });
  }
});

/**
 * [GET] /api/auth/me
 * 현재 로그인한 사용자 정보 조회
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    // 관리자가 접근 가능한 스토어 목록 조회
    const storesResult = await pool.query(`
      SELECT s.id, s.name, s.code, asp.role
      FROM stores s
      JOIN admin_store_permissions asp ON s.id = asp.store_id
      WHERE asp.admin_id = $1 AND s.is_active = true
      ORDER BY s.name
    `, [req.user.id]);

    res.json({
      user: {
        id: req.user.id,
        username: req.user.username,
        email: req.user.email,
        isSuperAdmin: req.user.is_super_admin
      },
      stores: storesResult.rows
    });

  } catch (error) {
    console.error('사용자 정보 조회 실패:', error);
    res.status(500).json({ error: '사용자 정보 조회 중 오류가 발생했습니다' });
  }
});

/**
 * [POST] /api/auth/logout
 * 로그아웃 (클라이언트에서 토큰 삭제)
 */
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // 실제로는 토큰 블랙리스트에 추가하는 로직이 필요
    // 현재는 클라이언트에서 토큰을 삭제하도록 안내
    res.json({ message: '로그아웃되었습니다' });
  } catch (error) {
    console.error('로그아웃 실패:', error);
    res.status(500).json({ error: '로그아웃 처리 중 오류가 발생했습니다' });
  }
});

/**
 * [POST] /api/auth/change-password
 * 비밀번호 변경
 */
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: '현재 비밀번호와 새 비밀번호가 필요합니다' });
    }

    // 현재 비밀번호 확인
    const adminResult = await pool.query(
      'SELECT password_hash FROM admins WHERE id = $1',
      [req.user.id]
    );

    const isValidPassword = await comparePassword(currentPassword, adminResult.rows[0].password_hash);
    if (!isValidPassword) {
      return res.status(400).json({ error: '현재 비밀번호가 올바르지 않습니다' });
    }

    // 새 비밀번호 해시화
    const hashedNewPassword = await hashPassword(newPassword);

    // 비밀번호 업데이트
    await pool.query(
      'UPDATE admins SET password_hash = $1 WHERE id = $2',
      [hashedNewPassword, req.user.id]
    );

    res.json({ message: '비밀번호가 성공적으로 변경되었습니다' });

  } catch (error) {
    console.error('비밀번호 변경 실패:', error);
    res.status(500).json({ error: '비밀번호 변경 중 오류가 발생했습니다' });
  }
});

module.exports = router; 