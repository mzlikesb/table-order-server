#!/bin/bash

# 테스트 환경 설정 스크립트

echo "🧪 테스트 환경을 설정합니다..."

# PostgreSQL 테스트 데이터베이스 생성
echo "📦 PostgreSQL 테스트 데이터베이스를 생성합니다..."

# PostgreSQL에 연결하여 테스트 데이터베이스 생성
psql -U postgres -c "CREATE DATABASE table_order_test_db;" 2>/dev/null || echo "테스트 데이터베이스가 이미 존재합니다."

# 테스트 데이터베이스에 스키마 적용
echo "🗄️ 테스트 데이터베이스에 스키마를 적용합니다..."
psql -U postgres -d table_order_test_db -f database/schema.sql

echo "✅ 테스트 환경 설정이 완료되었습니다!"
echo ""
echo "다음 명령어로 테스트를 실행할 수 있습니다:"
echo "  npm test                    # 모든 테스트 실행"
echo "  npm run test:watch          # 테스트 감시 모드"
echo "  npm run test:coverage       # 커버리지와 함께 테스트 실행"
echo "  npm run test:integration    # 통합 테스트만 실행"
echo "  npm run test:unit           # 단위 테스트만 실행" 