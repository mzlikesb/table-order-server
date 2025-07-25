# Table Order Server

🚀 **멀티테넌트 테이블 주문 시스템** - 여러 가게가 하나의 서버를 공유하는 효율적인 주문 관리 시스템

## ✨ 주요 기능

- 🔐 **JWT 기반 인증 시스템**
- 🏪 **멀티테넌트 아키텍처** (여러 가게 지원)
- 📱 **실시간 Socket.IO 통신**
- 🛡️ **보안 강화** (Rate Limiting, CORS, Helmet)
- 📊 **가게별 대시보드**
- 🍽️ **메뉴 및 주문 관리**
- 📞 **직원 호출 시스템**
- 🖼️ **파일 업로드 시스템** (이미지 처리, 리사이징)

## 🏗️ 아키텍처

### 멀티테넌트 구조
- **Shared Database, Shared Schema** 모델
- 가게별 데이터 완전 격리
- 리소스 효율적 공유

### 보안 기능
- JWT 토큰 인증
- 역할 기반 접근 제어 (RBAC)
- Rate Limiting
- XSS/SQL Injection 방지
- CORS 보안 정책

## 🚀 빠른 시작

### 1. 환경 설정
```bash
# 의존성 설치
npm install

# 환경 변수 설정
cp env.example .env
# .env 파일을 편집하여 데이터베이스 정보 입력
```

### 2. 데이터베이스 설정
```sql
-- PostgreSQL 데이터베이스 생성
CREATE DATABASE table_order_db;

-- 스키마 및 샘플 데이터 실행
psql -d table_order_db -f database/schema.sql
psql -d table_order_db -f database/sample-data.sql
```

### 3. 서버 실행
```bash
# 개발 모드
npm run dev

# 프로덕션 모드
npm start
```

## 📚 API 사용법

### 인증
```bash
# 로그인
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "password123"}'
```

### 멀티테넌트 API
```bash
# 가게별 메뉴 조회
curl -X GET http://localhost:4000/api/tenant/1/menus \
  -H "Authorization: Bearer <your-token>"

# 주문 생성
curl -X POST http://localhost:4000/api/tenant/1/orders \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"table_id": 5, "items": [...], "total_amount": 25000}'
```

### 파일 업로드 API
```bash
# 메뉴 이미지 업로드
curl -X POST http://localhost:4000/api/upload/menu-image \
  -H "Authorization: Bearer <your-token>" \
  -F "image=@menu.jpg" \
  -F "store_id=1"

# 가게 로고 업로드
curl -X POST http://localhost:4000/api/upload/store-logo \
  -H "Authorization: Bearer <your-token>" \
  -F "logo=@logo.png" \
  -F "store_id=1"
```

## 🔧 환경 변수

| 변수명 | 설명 | 기본값 |
|--------|------|--------|
| `NODE_ENV` | 실행 환경 | `development` |
| `PORT` | 서버 포트 | `4000` |
| `DB_HOST` | 데이터베이스 호스트 | `localhost` |
| `JWT_SECRET` | JWT 시크릿 키 | `your-secret-key` |
| `ALLOWED_ORIGINS` | 허용된 CORS 도메인 | `*` |

## 📖 문서

- [API 문서](./docs/api-documentation.md)
- [멀티테넌트 사용 가이드](./docs/multitenant-usage.md)
- [파일 업로드 API](./docs/file-upload-api.md)

## 🏗️ 프로젝트 구조

```
table-order-server/
├── database/           # 데이터베이스 스키마 및 샘플 데이터
├── db/                # 데이터베이스 연결
├── docs/              # 문서
├── middleware/        # 미들웨어 (인증, 보안, 멀티테넌트)
├── routes/            # API 라우터
├── .env.example       # 환경 변수 예시
├── index.js           # 메인 서버 파일
└── package.json       # 프로젝트 설정
```

## 🔒 보안 기능

### 인증 및 권한
- JWT 토큰 기반 인증
- 슈퍼 관리자 / 일반 관리자 구분
- 가게별 권한 관리 (owner, manager, staff)

### API 보안
- Rate Limiting (15분당 1000회 요청)
- 로그인 제한 (15분당 5회 시도)
- CORS 정책 적용
- 입력 데이터 검증 및 sanitization

## 💰 비용 최적화

### 멀티테넌트 효과
- **기존**: 가게 1개당 $25-50/월
- **멀티테넌트**: 가게 10개당 $50-100/월
- **절약**: 가게 1개당 $20-40/월 (80% 비용 감소)

## 🚀 배포

### AWS 배포
1. EC2 인스턴스 생성
2. RDS PostgreSQL 설정
3. 환경 변수 구성
4. PM2 또는 Docker로 배포

### Docker 배포
```bash
# 이미지 빌드
docker build -t table-order-server .

# 컨테이너 실행
docker run -p 4000:4000 --env-file .env table-order-server
```

## 🤝 기여하기

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다.

## 📞 지원

문제가 있거나 질문이 있으시면 이슈를 생성해주세요.

## 🚀 빠른 시작

### 환경 변수 설정

프로젝트 루트에 `.env` 파일을 생성하고 다음 내용을 추가하세요:

```env
# Database Configuration
POSTGRES_PASSWORD=your_secure_password
POSTGRES_USER=your_username
POSTGRES_DB=tableorder
DB_HOST=postgres
DB_PORT=5432
DB_USER=your_username
DB_PASSWORD=your_secure_password
DB_NAME=tableorder

# Server Configuration
PORT=4000
NODE_ENV=development

# Docker Configuration
POSTGRES_PORT=15432
SERVER_PORT=4000
```

### 개발 환경 실행

```bash
# 개발 환경으로 실행 (핫 리로드 포함)
docker-compose up

# 백그라운드에서 실행
docker-compose up -d

# 로그 확인
docker-compose logs -f
```

### 프로덕션 환경 실행

```bash
# 프로덕션 환경으로 실행
docker-compose -f docker-compose.yml up -d

# 서비스 상태 확인
docker-compose ps

# 서비스 중지
docker-compose down
```

## 📁 프로젝트 구조

```
table-order-server/
├── docker-compose.yml          # Docker Compose 설정
├── docker-compose.override.yml # 개발 환경 오버라이드
├── Dockerfile                  # Docker 이미지 설정
├── .dockerignore              # Docker 빌드 제외 파일
├── index.js                   # 서버 진입점
├── package.json               # Node.js 의존성
└── routes/                    # API 라우트
    ├── menus.js
    ├── orders.js
    ├── tables.js
    └── calls.js
```

## 🔧 주요 개선사항

### 1. 환경 변수 분리
- 민감한 정보를 환경 변수로 분리
- 기본값 설정으로 개발 편의성 향상

### 2. 보안 강화
- Docker 컨테이너에서 non-root 사용자 실행
- 불필요한 파일 제외 (.dockerignore)

### 3. 개발 편의성
- 개발 환경에서 핫 리로드 지원
- 볼륨 마운트로 코드 변경 실시간 반영

### 4. 데이터 지속성
- PostgreSQL 데이터를 Docker 볼륨으로 관리
- 컨테이너 재시작 시에도 데이터 유지

## 🛠️ 유용한 명령어

```bash
# 컨테이너 재빌드
docker-compose build

# 특정 서비스만 재시작
docker-compose restart server

# 데이터베이스 백업
docker exec tableorder-postgres pg_dump -U dypark tableorder > backup.sql

# 데이터베이스 복원
docker exec -i tableorder-postgres psql -U dypark tableorder < backup.sql

# 로그 확인
docker-compose logs postgres
docker-compose logs server

# 컨테이너 내부 접속
docker exec -it tableorder-server sh
docker exec -it tableorder-postgres psql -U dypark -d tableorder
```

## 🔍 헬스체크

- PostgreSQL: `pg_isready` 명령어로 데이터베이스 연결 상태 확인
- Server: `/api/menus` 엔드포인트로 서버 상태 확인

## 📝 주의사항

1. **보안**: 프로덕션 환경에서는 반드시 강력한 비밀번호를 사용하세요
2. **포트 충돌**: 15432, 4000 포트가 사용 중이지 않은지 확인하세요
3. **데이터 백업**: 정기적으로 데이터베이스를 백업하세요
4. **환경 변수**: `.env` 파일은 절대 Git에 커밋하지 마세요

## 🆘 문제 해결

### 포트 충돌
```bash
# 사용 중인 포트 확인
lsof -i :15432
lsof -i :4000

# 다른 포트로 변경 (docker-compose.yml 수정)
POSTGRES_PORT=15433
SERVER_PORT=4001
```

### 데이터베이스 연결 실패
```bash
# PostgreSQL 컨테이너 상태 확인
docker-compose ps postgres

# PostgreSQL 로그 확인
docker-compose logs postgres

# 수동으로 PostgreSQL 접속 테스트
docker exec -it tableorder-postgres psql -U dypark -d tableorder
``` 