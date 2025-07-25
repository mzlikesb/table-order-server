// Jest 테스트 설정
const { Pool } = require('pg');

// 전역 테스트 설정
global.testTimeout = 30000;

// 데이터베이스 연결 풀 (테스트용)
global.testPool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: 1, // 테스트용으로는 1개만 사용
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// 테스트 데이터베이스 초기화 함수
global.setupTestDatabase = async () => {
  try {
    // 실제 스키마 파일 읽기
    const fs = require('fs');
    const path = require('path');
    const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // 스키마 실행
    await global.testPool.query(schema);



    console.log('✅ 테스트 데이터베이스 스키마가 생성되었습니다.');
  } catch (error) {
    console.error('❌ 테스트 데이터베이스 설정 실패:', error);
    throw error;
  }
};

// 테스트 데이터베이스 정리 함수
global.cleanupTestDatabase = async () => {
  try {
    // 테이블 순서대로 삭제 (외래키 제약조건 고려)
    await global.testPool.query('DELETE FROM calls;');
    await global.testPool.query('DELETE FROM order_items;');
    await global.testPool.query('DELETE FROM orders;');
    await global.testPool.query('DELETE FROM menus;');
    await global.testPool.query('DELETE FROM menu_categories;');
    await global.testPool.query('DELETE FROM tables;');
    await global.testPool.query('DELETE FROM admin_store_permissions;');
    await global.testPool.query('DELETE FROM admins;');
    await global.testPool.query('DELETE FROM stores;');
    
    console.log('✅ 테스트 데이터베이스가 정리되었습니다.');
  } catch (error) {
    console.error('❌ 테스트 데이터베이스 정리 실패:', error);
    throw error;
  }
};

// 테스트 데이터 생성 함수
global.createTestData = async () => {
  try {
    // 테스트 스토어 생성
    const storeResult = await global.testPool.query(`
      INSERT INTO stores (code, name, address, phone) 
      VALUES ('test_store', '테스트 가게', '서울시 강남구', '02-1234-5678') 
      RETURNING *
    `);
    const testStore = storeResult.rows[0];

    // 테스트 관리자 생성
    const adminResult = await global.testPool.query(`
      INSERT INTO admins (username, email, password_hash, is_super_admin) 
      VALUES ('test_admin', 'test@example.com', '$2b$10$test_hash', false) 
      RETURNING *
    `);
    const testAdmin = adminResult.rows[0];

    // 관리자-스토어 권한 생성
    await global.testPool.query(`
      INSERT INTO admin_store_permissions (admin_id, store_id, role) 
      VALUES ($1, $2, 'owner')
    `, [testAdmin.id, testStore.id]);

    // 테스트 테이블 생성
    const tableResult = await global.testPool.query(`
      INSERT INTO tables (store_id, table_number, name, capacity) 
      VALUES ($1, 1, '테스트 테이블', 4) 
      RETURNING *
    `, [testStore.id]);
    const testTable = tableResult.rows[0];

    // 테스트 카테고리 생성
    const categoryResult = await global.testPool.query(`
      INSERT INTO menu_categories (store_id, name, sort_order) 
      VALUES ($1, '테스트 카테고리', 1) 
      RETURNING *
    `, [testStore.id]);
    const testCategory = categoryResult.rows[0];

    // 테스트 메뉴 생성
    const menuResult = await global.testPool.query(`
      INSERT INTO menus (store_id, category_id, name, price, is_available) 
      VALUES ($1, $2, '테스트 메뉴', 10000, true) 
      RETURNING *
    `, [testStore.id, testCategory.id]);
    const testMenu = menuResult.rows[0];

    return {
      store: testStore,
      admin: testAdmin,
      table: testTable,
      category: testCategory,
      menu: testMenu
    };
  } catch (error) {
    console.error('❌ 테스트 데이터 생성 실패:', error);
    throw error;
  }
};

// JWT 토큰 생성 헬퍼 함수
global.generateTestToken = (payload = {}) => {
  const jwt = require('jsonwebtoken');
  const defaultPayload = {
    adminId: 1,
    username: 'test_admin',
    email: 'test@example.com',
    is_super_admin: false,
    ...payload
  };
  return jwt.sign(defaultPayload, process.env.JWT_SECRET, { expiresIn: '1h' });
};

// 전역 테스트 완료 후 정리
afterAll(async () => {
  await global.testPool.end();
}); 