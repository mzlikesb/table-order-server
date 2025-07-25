# 테스트 가이드

## 📋 개요

이 프로젝트는 **Jest**와 **Supertest**를 사용하여 종합적인 테스트 시스템을 구축했습니다.

## 🏗️ 테스트 구조

```
tests/
├── env.js                    # 테스트 환경 변수 설정
├── setup.js                  # Jest 전역 설정
├── index.js                  # 테스트용 Express 앱
├── unit/                     # 단위 테스트
│   └── middleware/
│       └── auth.test.js      # 인증 미들웨어 테스트
└── integration/              # 통합 테스트
    └── routes/
        ├── auth.test.js      # 인증 라우터 테스트
        └── tables.test.js    # 테이블 라우터 테스트
```

## 🚀 테스트 실행

### 1. 테스트 환경 설정

```bash
# 테스트 데이터베이스 설정
chmod +x scripts/test-setup.sh
./scripts/test-setup.sh
```

### 2. 테스트 실행 명령어

```bash
# 모든 테스트 실행
npm test

# 테스트 감시 모드 (파일 변경 시 자동 실행)
npm run test:watch

# 커버리지와 함께 테스트 실행
npm run test:coverage

# 통합 테스트만 실행
npm run test:integration

# 단위 테스트만 실행
npm run test:unit
```

## 📊 테스트 커버리지

테스트 실행 후 `coverage/` 디렉토리에 상세한 커버리지 리포트가 생성됩니다.

- **HTML 리포트**: `coverage/lcov-report/index.html`
- **텍스트 리포트**: 콘솔에 출력
- **LCOV 리포트**: `coverage/lcov.info`

## 🧪 테스트 종류

### 1. 단위 테스트 (Unit Tests)

**위치**: `tests/unit/`

**목적**: 개별 함수나 모듈의 동작을 검증

**예시**:
- 인증 미들웨어 함수들
- 유틸리티 함수들
- 데이터 검증 함수들

### 2. 통합 테스트 (Integration Tests)

**위치**: `tests/integration/`

**목적**: API 엔드포인트의 전체 동작을 검증

**예시**:
- 라우터 엔드포인트들
- 데이터베이스 연동
- 인증 플로우

## 🔧 테스트 설정

### Jest 설정 (`jest.config.js`)

```javascript
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
  collectCoverageFrom: [
    'routes/**/*.js',
    'middleware/**/*.js',
    'utils/**/*.js'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  setupFiles: ['<rootDir>/tests/env.js']
};
```

### 테스트 환경 변수 (`tests/env.js`)

```javascript
process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'table_order_test_db';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
```

## 🗄️ 테스트 데이터베이스

### 특징

- **독립적인 데이터베이스**: `table_order_test_db`
- **자동 스키마 생성**: 테스트 실행 시 자동으로 테이블 생성
- **데이터 격리**: 각 테스트마다 데이터 초기화
- **트랜잭션 지원**: 테스트 안정성 보장

### 테스트 데이터 생성

```javascript
// 전역 테스트 데이터 생성 함수
const testData = await global.createTestData();

// 생성되는 데이터:
// - testData.store: 테스트 스토어
// - testData.admin: 테스트 관리자
// - testData.table: 테스트 테이블
// - testData.category: 테스트 카테고리
// - testData.menu: 테스트 메뉴
```

## 🔐 인증 테스트

### JWT 토큰 생성

```javascript
// 테스트용 토큰 생성
const token = global.generateTestToken({
  id: 1,
  username: 'test_admin',
  role: 'owner',
  storeId: 1
});
```

### 인증 헬퍼 함수

```javascript
// 요청에 인증 헤더 추가
.set('Authorization', `Bearer ${token}`)
.set('X-Store-ID', storeId.toString())
```

## 📝 테스트 작성 가이드

### 1. 테스트 파일 명명 규칙

- 단위 테스트: `*.test.js`
- 통합 테스트: `*.test.js`
- 테스트 디렉토리: `__tests__/`

### 2. 테스트 구조

```javascript
describe('기능명', () => {
  let testData;
  let authToken;

  beforeAll(async () => {
    // 테스트 데이터 설정
    await global.setupTestDatabase();
    testData = await global.createTestData();
  });

  afterAll(async () => {
    // 테스트 데이터 정리
    await global.cleanupTestDatabase();
  });

  beforeEach(async () => {
    // 각 테스트 전 데이터 초기화
    await global.cleanupTestDatabase();
    testData = await global.createTestData();
  });

  describe('하위 기능', () => {
    it('성공 케이스', async () => {
      // 테스트 로직
      const response = await request(app)
        .get('/api/endpoint')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
    });

    it('실패 케이스', async () => {
      // 에러 케이스 테스트
      const response = await request(app)
        .get('/api/endpoint')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });
});
```

### 3. 테스트 작성 원칙

1. **AAA 패턴**: Arrange, Act, Assert
2. **독립성**: 각 테스트는 독립적으로 실행 가능
3. **명확성**: 테스트 이름과 설명이 명확해야 함
4. **완전성**: 성공/실패 케이스 모두 테스트

### 4. Mock 사용

```javascript
// Socket.IO Mock
const socketHelpers = {
  notifyNewOrder: jest.fn(),
  notifyOrderStatusChange: jest.fn()
};

// 함수 호출 검증
expect(socketHelpers.notifyNewOrder).toHaveBeenCalledWith(storeId, orderData);
```

## 🚨 주의사항

### 1. 데이터베이스 연결

- 테스트용 데이터베이스 사용
- 각 테스트 후 데이터 정리
- 트랜잭션 사용으로 데이터 일관성 보장

### 2. 환경 변수

- 테스트 전용 환경 변수 사용
- 실제 운영 환경과 분리
- 민감한 정보는 테스트용 값 사용

### 3. 파일 업로드 테스트

- 임시 파일 사용
- 테스트 후 파일 정리
- Mock 사용으로 실제 파일 시스템 영향 최소화

## 📈 성능 최적화

### 1. 테스트 병렬화

```bash
# Jest 병렬 실행
npm test -- --maxWorkers=4
```

### 2. 데이터베이스 연결 풀

```javascript
// 테스트용 연결 풀 설정
const testPool = new Pool({
  max: 1, // 테스트용으로는 1개만 사용
  idleTimeoutMillis: 30000
});
```

### 3. 테스트 타임아웃

```javascript
// 긴 테스트의 경우 타임아웃 설정
it('긴 실행 시간이 필요한 테스트', async () => {
  // 테스트 로직
}, 30000); // 30초 타임아웃
```

## 🔍 디버깅

### 1. 테스트 로그

```bash
# 상세 로그와 함께 테스트 실행
npm test -- --verbose
```

### 2. 특정 테스트만 실행

```bash
# 특정 테스트 파일만 실행
npm test -- auth.test.js

# 특정 테스트만 실행
npm test -- -t "should login with valid credentials"
```

### 3. 테스트 중단점

```javascript
// 테스트 중 디버깅
it('디버깅이 필요한 테스트', async () => {
  debugger; // 브라우저 개발자 도구에서 중단점
  // 테스트 로직
});
```

## 📚 추가 리소스

- [Jest 공식 문서](https://jestjs.io/docs/getting-started)
- [Supertest 공식 문서](https://github.com/visionmedia/supertest)
- [Node.js 테스트 모범 사례](https://nodejs.org/en/docs/guides/testing-and-debugging/)

## 🤝 기여 가이드

새로운 기능을 추가할 때는 반드시 해당하는 테스트도 함께 작성해주세요.

1. **단위 테스트**: 새로운 함수나 미들웨어에 대한 단위 테스트
2. **통합 테스트**: 새로운 API 엔드포인트에 대한 통합 테스트
3. **테스트 커버리지**: 80% 이상의 커버리지 유지

테스트 작성 후 다음 명령어로 검증해주세요:

```bash
npm run test:coverage
``` 