# Docker 테스트 환경 가이드

## 🐳 Docker를 사용한 테스트 실행

### **필요 조건**
- Docker Desktop 설치
- Docker Compose 설치
- Node.js 18+ 설치

### **빠른 시작**

#### **1. 전체 테스트 실행 (권장)**
```bash
# Docker 컨테이너 시작 → 테스트 실행 → 컨테이너 정리
npm run test:docker
```

#### **2. 단계별 실행**
```bash
# 1. 테스트 환경 시작
npm run test:docker:up

# 2. 데이터베이스 준비 대기
npm run test:wait

# 3. 테스트 실행
npm test

# 4. 환경 정리
npm run test:cleanup
```

### **테스트 환경 구성**

#### **서비스**
- **PostgreSQL**: 포트 5433 (메인 DB와 분리)
- **Redis**: 포트 6380 (필요시 사용)

#### **환경 변수**
- 테스트 전용 데이터베이스
- 격리된 포트 설정
- 테스트용 JWT 시크릿

### **사용 가능한 명령어**

| 명령어 | 설명 |
|--------|------|
| `npm run test:docker` | 전체 테스트 실행 (시작→테스트→정리) |
| `npm run test:docker:up` | 테스트 환경 시작 |
| `npm run test:docker:down` | 테스트 환경 정리 |
| `npm run test:wait` | 데이터베이스 연결 대기 |
| `npm run test:cleanup` | 컨테이너 및 볼륨 정리 |

### **테스트 종류**

#### **단위 테스트 (데이터베이스 불필요)**
```bash
npm run test:unit
```

#### **통합 테스트 (데이터베이스 필요)**
```bash
# Docker 환경에서 실행
npm run test:docker

# 또는 수동으로
npm run test:docker:up
npm run test:wait
npm run test:integration
npm run test:cleanup
```

#### **커버리지 테스트**
```bash
npm run test:coverage
```

### **문제 해결**

#### **포트 충돌**
```bash
# 사용 중인 포트 확인
netstat -an | findstr :5433
netstat -an | findstr :6380

# 다른 포트 사용 (docker-compose.test.yml 수정)
```

#### **컨테이너 상태 확인**
```bash
# 컨테이너 상태 확인
docker ps

# 로그 확인
docker logs table_order_test_db
docker logs table_order_test_redis
```

#### **데이터베이스 연결 테스트**
```bash
# PostgreSQL 연결 테스트
psql -h localhost -p 5433 -U postgres -d table_order_test_db
```

#### **완전 초기화**
```bash
# 모든 컨테이너 및 볼륨 삭제
docker-compose -f docker-compose.test.yml down -v
docker system prune -f
```

### **CI/CD 연동**

#### **GitHub Actions 예시**
```yaml
name: Test
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:docker
```

#### **Docker Compose 서비스 상태 확인**
```bash
# 헬스체크 확인
docker-compose -f docker-compose.test.yml ps
```

### **성능 최적화**

#### **볼륨 사용**
- 테스트 데이터는 Docker 볼륨에 저장
- 컨테이너 재시작 시에도 데이터 유지

#### **이미지 캐싱**
- PostgreSQL 이미지는 자동 캐싱
- 첫 실행 후 빠른 시작

### **보안 고려사항**

#### **테스트 환경 격리**
- 메인 데이터베이스와 완전 분리
- 테스트용 JWT 시크릿 사용
- 임시 파일은 테스트 폴더에 저장

#### **데이터 정리**
- 테스트 후 자동 정리
- 민감한 데이터는 볼륨과 함께 삭제 