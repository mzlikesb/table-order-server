-- =====================================================
-- Table Order System - Database Schema
-- =====================================================

-- 1. 가게(스토어) 테이블
CREATE TABLE IF NOT EXISTS stores (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(20)  UNIQUE NOT NULL,     -- 예: "STORE_001"
    name            VARCHAR(100) NOT NULL,            -- 가게 이름
    address         TEXT,
    phone           VARCHAR(20),
    timezone        VARCHAR(50)  DEFAULT 'Asia/Seoul',
    is_active       BOOLEAN      DEFAULT TRUE,
    created_at      TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
);

-- 2. 관리자 테이블
CREATE TABLE IF NOT EXISTS admins (
    id              SERIAL PRIMARY KEY,
    username        VARCHAR(50)  UNIQUE NOT NULL,
    email           VARCHAR(100) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,            -- Bcrypt 등으로 해시 저장
    is_super_admin  BOOLEAN      DEFAULT FALSE,       -- 전체 시스템 관리 권한
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
);

-- 3. 관리자-가게 권한 테이블 (다대다 관계)
CREATE TABLE IF NOT EXISTS admin_store_permissions (
    admin_id  INTEGER REFERENCES admins(id)  ON DELETE CASCADE,
    store_id  INTEGER REFERENCES stores(id)  ON DELETE CASCADE,
    role      VARCHAR(20) DEFAULT 'manager'  CHECK (role IN ('owner', 'manager', 'staff')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (admin_id, store_id)
);

-- 4. 메뉴 카테고리 테이블
CREATE TABLE IF NOT EXISTS menu_categories (
    id          SERIAL PRIMARY KEY,
    store_id    INTEGER REFERENCES stores(id) ON DELETE CASCADE,
    name        VARCHAR(50) NOT NULL,                 -- "음료", "메인요리", "디저트" 등
    sort_order  INTEGER DEFAULT 0,                    -- 정렬 순서
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. 메뉴 테이블
CREATE TABLE IF NOT EXISTS menus (
    id              SERIAL PRIMARY KEY,
    store_id        INTEGER REFERENCES stores(id) ON DELETE CASCADE,
    category_id     INTEGER REFERENCES menu_categories(id) ON DELETE SET NULL,
    name            VARCHAR(100) NOT NULL,
    description     TEXT,
    price           DECIMAL(10,2) NOT NULL,
    image_url       TEXT,
    is_available    BOOLEAN DEFAULT TRUE,
    sort_order      INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. 테이블 테이블
CREATE TABLE IF NOT EXISTS tables (
    id          SERIAL PRIMARY KEY,
    store_id    INTEGER REFERENCES stores(id) ON DELETE CASCADE,
    table_number INTEGER NOT NULL,                    -- 테이블 번호
    name        VARCHAR(50),                          -- 테이블 이름 (예: "창가 테이블")
    capacity    INTEGER DEFAULT 4,                    -- 수용 인원
    status      VARCHAR(20) DEFAULT 'available'      -- available, occupied, reserved, maintenance
                        CHECK (status IN ('available', 'occupied', 'reserved', 'maintenance')),
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(store_id, table_number)
);

-- 7. 주문 테이블
CREATE TABLE IF NOT EXISTS orders (
    id              SERIAL PRIMARY KEY,
    store_id        INTEGER REFERENCES stores(id) ON DELETE CASCADE,
    table_id        INTEGER REFERENCES tables(id) ON DELETE SET NULL,
    order_number    VARCHAR(20) UNIQUE NOT NULL,      -- "ORD_20241201_001"
    status          VARCHAR(20) DEFAULT 'pending'     -- pending, confirmed, preparing, ready, completed, cancelled
                        CHECK (status IN ('pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled')),
    total_amount    DECIMAL(10,2) DEFAULT 0,
    notes           TEXT,                             -- 주문 메모
    created_by      INTEGER REFERENCES admins(id) ON DELETE SET NULL,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 8. 주문 상세 테이블
CREATE TABLE IF NOT EXISTS order_items (
    id          SERIAL PRIMARY KEY,
    order_id    INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    menu_id     INTEGER REFERENCES menus(id) ON DELETE SET NULL,
    quantity    INTEGER NOT NULL DEFAULT 1,
    unit_price  DECIMAL(10,2) NOT NULL,               -- 주문 시점의 가격
    total_price DECIMAL(10,2) NOT NULL,               -- quantity * unit_price
    notes       TEXT,                                 -- 개별 메뉴 메모
    created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 9. 호출 테이블 (직원 호출)
CREATE TABLE IF NOT EXISTS calls (
    id          SERIAL PRIMARY KEY,
    store_id    INTEGER REFERENCES stores(id) ON DELETE CASCADE,
    table_id    INTEGER REFERENCES tables(id) ON DELETE CASCADE,
    call_type   VARCHAR(20) NOT NULL                  -- "service", "bill", "help", "custom"
                        CHECK (call_type IN ('service', 'bill', 'help', 'custom')),
    message     TEXT,                                 -- 커스텀 메시지
    status      VARCHAR(20) DEFAULT 'pending'         -- pending, responded, completed
                        CHECK (status IN ('pending', 'responded', 'completed')),
    responded_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
    responded_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 인덱스 생성 (성능 최적화)
-- =====================================================

-- 관리자-가게 권한 인덱스
CREATE INDEX IF NOT EXISTS idx_permissions_store ON admin_store_permissions (store_id);

-- 메뉴 카테고리 인덱스
CREATE INDEX IF NOT EXISTS idx_menu_categories_store ON menu_categories (store_id);
CREATE INDEX IF NOT EXISTS idx_menu_categories_active ON menu_categories (is_active);

-- 메뉴 인덱스
CREATE INDEX IF NOT EXISTS idx_menus_store ON menus (store_id);
CREATE INDEX IF NOT EXISTS idx_menus_category ON menus (category_id);
CREATE INDEX IF NOT EXISTS idx_menus_available ON menus (is_available);

-- 테이블 인덱스
CREATE INDEX IF NOT EXISTS idx_tables_store ON tables (store_id);
CREATE INDEX IF NOT EXISTS idx_tables_status ON tables (status);

-- 주문 인덱스
CREATE INDEX IF NOT EXISTS idx_orders_store ON orders (store_id);
CREATE INDEX IF NOT EXISTS idx_orders_table ON orders (table_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);

-- 주문 상세 인덱스
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_menu ON order_items (menu_id);

-- 호출 인덱스
CREATE INDEX IF NOT EXISTS idx_calls_store ON calls (store_id);
CREATE INDEX IF NOT EXISTS idx_calls_table ON calls (table_id);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls (status);

-- =====================================================
-- 트리거 함수 (updated_at 자동 업데이트)
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 트리거 생성
DROP TRIGGER IF EXISTS update_stores_updated_at ON stores;
CREATE TRIGGER update_stores_updated_at BEFORE UPDATE ON stores FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_admins_updated_at ON admins;
CREATE TRIGGER update_admins_updated_at BEFORE UPDATE ON admins FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_menu_categories_updated_at ON menu_categories;
CREATE TRIGGER update_menu_categories_updated_at BEFORE UPDATE ON menu_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_menus_updated_at ON menus;
CREATE TRIGGER update_menus_updated_at BEFORE UPDATE ON menus FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tables_updated_at ON tables;
CREATE TRIGGER update_tables_updated_at BEFORE UPDATE ON tables FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_calls_updated_at ON calls;
CREATE TRIGGER update_calls_updated_at BEFORE UPDATE ON calls FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); 