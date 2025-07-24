# Table Order Server

테이블 주문 시스템을 위한 Node.js 서버입니다.

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