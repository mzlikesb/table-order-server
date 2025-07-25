#!/bin/bash

# 테스트 환경 설정 스크립트 (SSH/Linux 환경용)

echo "🧪 테스트 환경을 설정합니다..."

# PostgreSQL 테스트 데이터베이스 생성
echo "📦 PostgreSQL 테스트 데이터베이스를 생성합니다..."

# PostgreSQL에 연결하여 테스트 데이터베이스 생성
psql -U postgres -c "CREATE DATABASE table_order_test_db;" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✅ 테스트 데이터베이스가 생성되었습니다."
else
    echo "ℹ️ 테스트 데이터베이스가 이미 존재합니다."
fi

# 테스트 데이터베이스에 스키마 적용
echo "🗄️ 테스트 데이터베이스에 스키마를 적용합니다..."
psql -U postgres -d table_order_test_db -f database/schema.sql
if [ $? -eq 0 ]; then
    echo "✅ 스키마가 성공적으로 적용되었습니다."
else
    echo "❌ 스키마 적용에 실패했습니다."
    echo "   PostgreSQL이 실행 중인지 확인해주세요."
    echo "   PostgreSQL 설치 및 실행 방법:"
    echo "   1. sudo apt-get install postgresql postgresql-contrib"
    echo "   2. sudo systemctl start postgresql"
    echo "   3. sudo -u postgres psql"
    exit 1
fi

echo "✅ 테스트 환경 설정이 완료되었습니다!"
echo ""
echo "다음 명령어로 테스트를 실행할 수 있습니다:"
echo "  npm test                    # 모든 테스트 실행"
echo "  npm run test:watch          # 테스트 감시 모드"
echo "  npm run test:coverage       # 커버리지와 함께 테스트 실행"
echo "  npm run test:integration    # 통합 테스트만 실행"
echo "  npm run test:unit           # 단위 테스트만 실행" 