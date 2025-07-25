# 멀티테넌트 아키텍처 사용 가이드

## 개요

이 시스템은 **Shared Database, Shared Schema** 멀티테넌트 모델을 사용합니다. 여러 가게(테넌트)가 하나의 데이터베이스와 애플리케이션을 공유하면서도 완전히 격리된 환경을 제공합니다.

## 아키텍처 특징

### 1. 데이터 격리
- 모든 테이블에 `store_id` 필드가 있어 가게별 데이터 분리
- API 요청 시 자동으로 해당 가게의 데이터만 접근 가능
- 권한 기반 접근 제어로 가게 간 데이터 접근 차단

### 2. 리소스 공유
- 하나의 서버 인스턴스로 여러 가게 서비스
- 데이터베이스 연결 풀 공유로 리소스 효율성 극대화
- Socket.IO를 통한 실시간 통신 지원

## API 사용 방법

### 1. 기본 URL 구조
```
/api/tenant/{storeId}/{resource}
```

### 2. 인증 방법

#### 헤더 방식 (권장)
```bash
X-Store-ID: 1
X-Admin-ID: 123
```

#### URL 파라미터 방식
```bash
GET /api/tenant/1/menus
```

#### 쿼리 파라미터 방식
```bash
GET /api/menus?store_id=1
```

### 3. API 엔드포인트 예시

#### 가게 대시보드 조회
```bash
GET /api/tenant/1/dashboard
```

응답:
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

#### 가게별 메뉴 조회
```bash
GET /api/tenant/1/menus
```

#### 가게별 주문 생성
```bash
POST /api/tenant/1/orders
Content-Type: application/json
X-Admin-ID: 123

{
  "table_id": 5,
  "items": [
    {
      "menu_id": 10,
      "quantity": 2,
      "unit_price": 15000,
      "notes": "매운맛으로"
    },
    {
      "menu_id": 15,
      "quantity": 1,
      "unit_price": 8000
    }
  ],
  "total_amount": 38000,
  "notes": "창가 테이블"
}
```

#### 주문 상태 변경
```bash
PUT /api/tenant/1/orders/123/status
Content-Type: application/json
X-Admin-ID: 123

{
  "status": "preparing"
}
```

#### 가게별 호출 생성
```bash
POST /api/tenant/1/calls
Content-Type: application/json

{
  "table_id": 5,
  "call_type": "service",
  "message": "물 좀 주세요"
}
```

## Socket.IO 사용 방법

### 1. 클라이언트 연결

#### 직원용 연결 (가게별)
```javascript
const socket = io('http://localhost:4000');

// 가게별 직원 룸 참가
socket.emit('join-staff-store', 1);

// 새 주문 알림 수신
socket.on('new-order', (orderData) => {
  console.log('새 주문:', orderData);
});

// 주문 상태 변경 알림 수신
socket.on('order-status-changed', (orderData) => {
  console.log('주문 상태 변경:', orderData);
});

// 새 호출 알림 수신
socket.on('new-call', (callData) => {
  console.log('새 호출:', callData);
});
```

#### 고객용 연결 (테이블별)
```javascript
const socket = io('http://localhost:4000');

// 테이블별 룸 참가
socket.emit('join-table', 5);

// 주문 업데이트 수신
socket.on('order-update', (orderData) => {
  console.log('주문 업데이트:', orderData);
});
```

### 2. 서버에서 알림 발송

```javascript
const socketHelpers = req.app.get('socketHelpers');

// 새 주문 알림
socketHelpers.notifyNewOrder(storeId, orderData);

// 주문 상태 변경 알림
socketHelpers.notifyOrderStatusChange(storeId, orderData);

// 새 호출 알림
socketHelpers.notifyNewCall(storeId, callData);
```

## 비용 최적화 효과

### 1. 인프라 비용 절약
- **기존**: 가게 1개당 EC2 + RDS = $25-50/월
- **멀티테넌트**: 가게 10개당 EC2 + RDS = $50-100/월
- **절약 효과**: 가게 1개당 $20-40/월 절약 (80% 비용 감소)

### 2. 운영 비용 절약
- 서버 관리 인력 1명으로 여러 가게 관리 가능
- 모니터링 및 백업 비용 분산
- 개발 및 유지보수 비용 공유

### 3. 스케일링 효율성
- 트래픽이 적은 가게들의 리소스 공유
- 피크 시간대 자동 스케일링으로 비용 최적화
- 예약된 스케일링으로 미리 대비

## 보안 고려사항

### 1. 데이터 격리
- 모든 쿼리에 `store_id` 조건 필수
- 미들웨어를 통한 자동 검증
- 권한 기반 접근 제어

### 2. 인증 및 권한
- JWT 토큰 기반 인증 (구현 예정)
- 가게별 관리자 권한 관리
- 역할 기반 접근 제어 (owner, manager, staff)

### 3. API 보안
- CORS 설정으로 허용된 도메인만 접근
- Rate limiting 적용 (구현 예정)
- 입력 데이터 검증 및 sanitization

## 모니터링 및 관리

### 1. 가게별 메트릭
- API 호출 횟수 및 응답 시간
- 데이터베이스 쿼리 성능
- Socket.IO 연결 수

### 2. 리소스 사용량
- CPU, 메모리 사용률
- 데이터베이스 연결 풀 상태
- 네트워크 대역폭

### 3. 알림 설정
- 가게별 오류율 모니터링
- 리소스 사용량 임계값 알림
- API 응답 시간 임계값 알림

## 확장 계획

### 1. 기능 확장
- 가게별 커스터마이징 옵션
- 다국어 지원
- 결제 시스템 연동

### 2. 아키텍처 개선
- 마이크로서비스 분리
- 캐싱 레이어 추가 (Redis)
- CDN 연동으로 이미지 최적화

### 3. 운영 개선
- 자동화된 백업 및 복구
- 무중단 배포 시스템
- A/B 테스트 지원 