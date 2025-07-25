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
    // 테스트용 스키마 생성
    await global.testPool.query(`
      CREATE TABLE IF NOT EXISTS stores (
        id SERIAL PRIMARY KEY,
        code VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        address TEXT,
        phone VARCHAR(20),
        timezone VARCHAR(50) DEFAULT 'Asia/Seoul',
        logo_url TEXT,
        small_logo_url TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await global.testPool.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        store_id INTEGER REFERENCES stores(id),
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'staff',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await global.testPool.query(`
      CREATE TABLE IF NOT EXISTS tables (
        id SERIAL PRIMARY KEY,
        store_id INTEGER REFERENCES stores(id),
        table_number VARCHAR(10) NOT NULL,
        name VARCHAR(100),
        capacity INTEGER DEFAULT 4,
        status VARCHAR(20) DEFAULT 'available',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(store_id, table_number)
      );
    `);

    await global.testPool.query(`
      CREATE TABLE IF NOT EXISTS menu_categories (
        id SERIAL PRIMARY KEY,
        store_id INTEGER REFERENCES stores(id),
        name VARCHAR(50) NOT NULL,
        sort_order INTEGER DEFAULT 0,
        description TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await global.testPool.query(`
      CREATE TABLE IF NOT EXISTS menus (
        id SERIAL PRIMARY KEY,
        store_id INTEGER REFERENCES stores(id),
        category_id INTEGER REFERENCES menu_categories(id),
        name VARCHAR(100) NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        image_url TEXT,
        is_available BOOLEAN DEFAULT TRUE,
        sort_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await global.testPool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        store_id INTEGER REFERENCES stores(id),
        table_id INTEGER REFERENCES tables(id),
        order_number VARCHAR(20) UNIQUE NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        total_amount DECIMAL(10,2) NOT NULL,
        notes TEXT,
        created_by INTEGER REFERENCES admins(id),
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await global.testPool.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id),
        menu_id INTEGER REFERENCES menus(id),
        quantity INTEGER NOT NULL,
        unit_price DECIMAL(10,2) NOT NULL,
        total_price DECIMAL(10,2) NOT NULL,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await global.testPool.query(`
      CREATE TABLE IF NOT EXISTS calls (
        id SERIAL PRIMARY KEY,
        store_id INTEGER REFERENCES stores(id),
        table_id INTEGER REFERENCES tables(id),
        call_type VARCHAR(20) NOT NULL,
        message TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        responded_by INTEGER REFERENCES admins(id),
        responded_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

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
      INSERT INTO admins (store_id, username, password_hash, role) 
      VALUES ($1, 'test_admin', '$2b$10$test_hash', 'owner') 
      RETURNING *
    `, [testStore.id]);
    const testAdmin = adminResult.rows[0];

    // 테스트 테이블 생성
    const tableResult = await global.testPool.query(`
      INSERT INTO tables (store_id, table_number, name, capacity) 
      VALUES ($1, 'A1', '테스트 테이블', 4) 
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
    id: 1,
    username: 'test_admin',
    role: 'owner',
    storeId: 1,
    ...payload
  };
  return jwt.sign(defaultPayload, process.env.JWT_SECRET, { expiresIn: '1h' });
};

// 전역 테스트 완료 후 정리
afterAll(async () => {
  await global.testPool.end();
}); 