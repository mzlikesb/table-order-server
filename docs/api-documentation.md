# Table Order Server API Documentation

## 개요

이 문서는 Table Order Server의 REST API와 Socket.IO 이벤트에 대한 설명입니다.

## 인증

### JWT 토큰 기반 인증

모든 보호된 API 엔드포인트는 JWT 토큰이 필요합니다.

#### 헤더에 토큰 포함
```
Authorization: Bearer <your-jwt-token>
```

## 인증 API

### 로그인
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "password123"
}
```

**응답:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "admin",
    "email": "admin@example.com",
    "isSuperAdmin": true
  },
  "stores": [
    {
      "id": 1,
      "name": "맛있는 식당",
      "code": "STORE_001",
      "role": "owner"
    }
  ]
}
```

### 토큰 갱신
```http
POST /api/auth/refresh
Authorization: Bearer <current-token>
```

### 사용자 정보 조회
```http
GET /api/auth/me
Authorization: Bearer <token>
```

### 비밀번호 변경
```http
POST /api/auth/change-password
Authorization: Bearer <token>
Content-Type: application/json

{
  "currentPassword": "oldpassword",
  "newPassword": "newpassword123"
}
```

### 로그아웃
```http
POST /api/auth/logout
Authorization: Bearer <token>
```

## 공개 API (고객용)

고객 모드에서 사용하는 공개 API입니다. 인증 없이 사용할 수 있습니다.

### 공개 메뉴 카테고리 조회
```http
GET /api/menu-categories/customer?store_id=1
```

**응답:**
```json
[
  {
    "id": 1,
    "name": "음료",
    "description": "다양한 음료",
    "sort_order": 1,
    "menu_count": 5,
    "active_menu_count": 4
  }
]
```

### 공개 메뉴 조회
```http
GET /api/menus/customer?store_id=1&category_id=1
```

**응답:**
```json
[
  {
    "id": 1,
    "name": "아메리카노",
    "description": "깊고 진한 아메리카노",
    "price": 4500,
    "image_url": "https://example.com/americano.jpg",
    "is_available": true,
    "category_name": "음료",
    "sort_order": 1
  }
]
```

### 공개 호출 생성
```http
POST /api/calls/public
Content-Type: application/json

{
  "store_id": 1,
  "table_id": 5,
  "call_type": "service",
  "message": "물 좀 주세요"
}
```

**응답:**
```json
{
  "success": true,
  "call": {
    "id": 1,
    "store_id": 1,
    "table_id": 5,
    "call_type": "service",
    "message": "물 좀 주세요",
    "status": "pending",
    "created_at": "2024-01-15T10:30:00Z",
    "table_number": "A1",
    "store_name": "맛있는 식당"
  }
}
```

### 공개 주문 생성
```http
POST /api/orders/public
Content-Type: application/json

{
  "store_id": 1,
  "table_id": 5,
  "items": [
    {
      "menu_id": 1,
      "quantity": 2,
      "unit_price": 4500,
      "notes": "따뜻하게"
    }
  ],
  "total_amount": 9000,
  "notes": "빨리 부탁드려요"
}
```

**응답:**
```json
{
  "success": true,
  "order": {
    "id": 1,
    "store_id": 1,
    "table_id": 5,
    "order_number": "ORD_20240115_001",
    "status": "pending",
    "total_amount": 9000,
    "notes": "빨리 부탁드려요",
    "created_at": "2024-01-15T10:30:00Z",
    "table_number": "A1",
    "store_name": "맛있는 식당",
    "items": [
      {
        "id": 1,
        "menu_id": 1,
        "quantity": 2,
        "unit_price": 4500,
        "total_price": 9000,
        "notes": "따뜻하게",
        "menu_name": "아메리카노",
        "menu_description": "깊고 진한 아메리카노"
      }
    ]
  }
}
```

## 멀티테넌트 API

### 가게 대시보드
```http
GET /api/tenant/{storeId}/dashboard
Authorization: Bearer <token>
```

**응답:**
```json
{
  "today": {
    "total_orders": 25,
    "completed_orders": 20,
    "total_revenue": 450000
  },
  "pending": {
    "orders": 3,
    "calls": 2
  },
  "tables": {
    "total_tables": 10,
    "available_tables": 6,
    "occupied_tables": 4
  }
}
```

### 가게별 메뉴 조회
```http
GET /api/tenant/{storeId}/menus
Authorization: Bearer <token>
```

### 가게별 주문 생성
```http
POST /api/tenant/{storeId}/orders
Authorization: Bearer <token>
Content-Type: application/json

{
  "table_id": 5,
  "items": [
    {
      "menu_id": 10,
      "quantity": 2,
      "unit_price": 15000,
      "notes": "매운맛으로"
    }
  ],
  "total_amount": 30000,
  "notes": "창가 테이블"
}
```

### 주문 상태 변경
```http
PUT /api/tenant/{storeId}/orders/{orderId}/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "preparing"
}
```

### 가게별 호출 생성
```http
POST /api/tenant/{storeId}/calls
Authorization: Bearer <token>
Content-Type: application/json

{
  "table_id": 5,
  "call_type": "service",
  "message": "물 좀 주세요"
}
```

## 기존 API (호환성 유지)

### 메뉴 관리
```http
GET /api/menus?store_id=1
POST /api/menus
PUT /api/menus/{id}
DELETE /api/menus/{id}
```

### 주문 관리
```http
GET /api/orders?store_id=1
POST /api/orders
PUT /api/orders/{id}
DELETE /api/orders/{id}
```

### 테이블 관리
```http
GET /api/tables?store_id=1
POST /api/tables
PUT /api/tables/{id}
DELETE /api/tables/{id}
```

### 호출 관리
```http
GET /api/calls?store_id=1
POST /api/calls
PUT /api/calls/{id}
DELETE /api/calls/{id}
```

## Socket.IO 이벤트

### 클라이언트 → 서버

#### 직원용 연결
```javascript
// 가게별 직원 룸 참가
socket.emit('join-staff-store', storeId);

// 전체 직원 룸 참가 (기존 호환성)
socket.emit('join-staff');
```

#### 고객용 연결
```javascript
// 테이블별 룸 참가
socket.emit('join-table', tableId);
```

### 서버 → 클라이언트

#### 직원용 알림
```javascript
// 새 주문 알림
socket.on('new-order', (orderData) => {
  console.log('새 주문:', orderData);
});

// 주문 상태 변경 알림
socket.on('order-status-changed', (orderData) => {
  console.log('주문 상태 변경:', orderData);
});

// 새 호출 알림
socket.on('new-call', (callData) => {
  console.log('새 호출:', callData);
});

// 호출 상태 변경 알림
socket.on('call-status-changed', (callData) => {
  console.log('호출 상태 변경:', callData);
});
```

#### 고객용 알림
```javascript
// 주문 업데이트 알림
socket.on('order-update', (orderData) => {
  console.log('주문 업데이트:', orderData);
});
```

## 상태 코드

- `200` - 성공
- `201` - 생성됨
- `400` - 잘못된 요청
- `401` - 인증 필요
- `403` - 권한 없음
- `404` - 리소스 없음
- `409` - 충돌 (중복 데이터)
- `429` - 요청 제한 초과
- `500` - 서버 오류

## 에러 응답 형식

```json
{
  "error": "에러 메시지"
}
```

## Rate Limiting

- **일반 API**: 15분당 1000회 요청
- **로그인**: 15분당 5회 시도
- **헤더**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

## 보안 고려사항

1. **JWT 토큰**: 24시간 유효, 만료 시 갱신 필요
2. **HTTPS**: 프로덕션에서는 반드시 HTTPS 사용
3. **CORS**: 허용된 도메인만 접근 가능
4. **Rate Limiting**: DDoS 공격 방지
5. **Input Validation**: XSS 및 SQL Injection 방지

## 개발 환경 설정

1. `.env` 파일 생성 (env.example 참조)
2. 데이터베이스 설정
3. JWT_SECRET 설정
4. `npm install` 실행
5. `npm run dev` 실행

## 프로덕션 배포

1. 환경 변수 설정
2. 데이터베이스 마이그레이션
3. SSL 인증서 설정
4. 로드 밸런서 구성
5. 모니터링 설정 