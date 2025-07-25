const pool = require('../db/connection');

/**
 * 멀티테넌트 미들웨어
 * 모든 API 요청에서 store_id를 검증하고 req.tenant에 저장
 */
const tenantMiddleware = async (req, res, next) => {
  try {
    // store_id를 다양한 방법으로 추출
    let storeId = null;
    
    // 1. URL 파라미터에서 추출 (예: /api/stores/1/menus)
    if (req.params.storeId) {
      storeId = parseInt(req.params.storeId);
    }
    
    // 2. 쿼리 파라미터에서 추출 (예: ?store_id=1)
    if (!storeId && req.query.store_id) {
      storeId = parseInt(req.query.store_id);
    }
    
    // 3. 요청 바디에서 추출 (POST/PUT 요청)
    if (!storeId && req.body.store_id) {
      storeId = parseInt(req.body.store_id);
    }
    
    // 4. 헤더에서 추출 (X-Store-ID)
    if (!storeId && req.headers['x-store-id']) {
      storeId = parseInt(req.headers['x-store-id']);
    }
    
    // store_id가 있는 경우 검증
    if (storeId) {
      // 스토어 존재 여부 확인
      const storeResult = await pool.query(
        'SELECT id, name, is_active FROM stores WHERE id = $1',
        [storeId]
      );
      
      if (storeResult.rowCount === 0) {
        return res.status(404).json({ error: '존재하지 않는 스토어입니다' });
      }
      
      if (!storeResult.rows[0].is_active) {
        return res.status(403).json({ error: '비활성화된 스토어입니다' });
      }
      
      // req.tenant에 스토어 정보 저장
      req.tenant = {
        storeId: storeId,
        storeName: storeResult.rows[0].name
      };
    }
    
    next();
  } catch (error) {
    console.error('Tenant middleware error:', error);
    res.status(500).json({ error: '스토어 검증 중 오류가 발생했습니다' });
  }
};

/**
 * store_id가 필수인 엔드포인트용 미들웨어
 */
const requireTenant = (req, res, next) => {
  if (!req.tenant || !req.tenant.storeId) {
    return res.status(400).json({ error: 'store_id가 필요합니다' });
  }
  next();
};

/**
 * 관리자 권한 검증 미들웨어
 */
const requireAdminPermission = async (req, res, next) => {
  try {
    if (!req.tenant || !req.tenant.storeId) {
      return res.status(400).json({ error: 'store_id가 필요합니다' });
    }
    
    // 실제 구현에서는 JWT 토큰에서 admin_id를 추출
    const adminId = req.headers['x-admin-id'] || req.body.admin_id;
    
    if (!adminId) {
      return res.status(401).json({ error: '관리자 인증이 필요합니다' });
    }
    
    // 관리자 권한 확인
    const permissionResult = await pool.query(
      `SELECT role FROM admin_store_permissions 
       WHERE admin_id = $1 AND store_id = $2`,
      [adminId, req.tenant.storeId]
    );
    
    if (permissionResult.rowCount === 0) {
      return res.status(403).json({ error: '해당 스토어에 대한 권한이 없습니다' });
    }
    
    req.tenant.adminRole = permissionResult.rows[0].role;
    next();
  } catch (error) {
    console.error('Admin permission middleware error:', error);
    res.status(500).json({ error: '권한 검증 중 오류가 발생했습니다' });
  }
};

module.exports = {
  tenantMiddleware,
  requireTenant,
  requireAdminPermission
}; 