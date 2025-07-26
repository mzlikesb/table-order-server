-- =====================================================
-- Sample Data for API Testing
-- =====================================================

-- 샘플 스토어 추가
INSERT INTO stores (code, name, address, phone) VALUES
('STORE_001', '맛있는 식당', '서울시 강남구 테헤란로 123', '02-1234-5678'),
('STORE_002', '카페 모닝', '서울시 서초구 서초대로 456', '02-2345-6789')
ON CONFLICT (code) DO NOTHING;

-- 샘플 관리자 추가
INSERT INTO admins (username, email, password_hash, is_super_admin) VALUES
('admin', 'admin@example.com', '$2b$10$example_hash_for_testing', true),
('manager1', 'manager1@example.com', '$2b$10$example_hash_for_testing', false)
ON CONFLICT (username) DO NOTHING;

-- 관리자-스토어 권한 추가
INSERT INTO admin_store_permissions (admin_id, store_id, role) VALUES
(1, 1, 'owner'),
(1, 2, 'owner'),
(2, 1, 'manager')
ON CONFLICT (admin_id, store_id) DO NOTHING;

-- 샘플 메뉴 카테고리 추가
INSERT INTO menu_categories (store_id, name, sort_order) VALUES
(1, '메인 요리', 1),
(1, '사이드', 2),
(1, '음료', 3),
(2, '커피', 1),
(2, '논커피', 2),
(2, '디저트', 3)
ON CONFLICT DO NOTHING;

-- 샘플 메뉴 추가
INSERT INTO menus (store_id, category_id, name, description, price) VALUES
(1, 1, '스테이크', '신선한 소고기 스테이크', 25000),
(1, 1, '파스타', '크림 파스타', 15000),
(1, 2, '샐러드', '신선한 채소 샐러드', 8000),
(1, 3, '콜라', '시원한 콜라', 3000),
(2, 4, '아메리카노', '깊은 맛의 아메리카노', 4500),
(2, 4, '카페라떼', '부드러운 카페라떼', 5000),
(2, 6, '티라미수', '진한 커피향 티라미수', 6500)
ON CONFLICT DO NOTHING;

-- 샘플 테이블 추가
INSERT INTO tables (store_id, table_number, name, capacity) VALUES
(1, 'A1', '창가 테이블', 4),
(1, 'A2', '중앙 테이블', 6),
(1, 'A3', '구석 테이블', 2),
(2, 'B1', '1번 테이블', 4),
(2, 'B2', '2번 테이블', 4)
ON CONFLICT (store_id, table_number) DO NOTHING; 