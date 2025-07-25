#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🧪 테스트 환경을 설정합니다...');

// PostgreSQL 테스트 데이터베이스 생성
console.log('📦 PostgreSQL 테스트 데이터베이스를 생성합니다...');

try {
  // PostgreSQL에 연결하여 테스트 데이터베이스 생성
  execSync('psql -U postgres -c "CREATE DATABASE table_order_test_db;"', { 
    stdio: 'pipe',
    stderr: 'pipe'
  });
  console.log('✅ 테스트 데이터베이스가 생성되었습니다.');
} catch (error) {
  if (error.stderr && error.stderr.toString().includes('already exists')) {
    console.log('ℹ️ 테스트 데이터베이스가 이미 존재합니다.');
  } else {
    console.log('⚠️ PostgreSQL 연결에 실패했습니다.');
    console.log('   PostgreSQL이 실행 중인지 확인해주세요.');
    console.log('');
    console.log('   Windows 환경:');
    console.log('   1. PostgreSQL을 설치하세요');
    console.log('   2. PostgreSQL 서비스를 시작하세요');
    console.log('   3. 환경 변수 PATH에 PostgreSQL bin 폴더를 추가하세요');
    console.log('');
    console.log('   Linux/SSH 환경:');
    console.log('   1. sudo apt-get install postgresql postgresql-contrib');
    console.log('   2. sudo systemctl start postgresql');
    console.log('   3. sudo -u postgres psql');
    process.exit(1);
  }
}

// 테스트 데이터베이스에 스키마 적용
console.log('🗄️ 테스트 데이터베이스에 스키마를 적용합니다...');

try {
  const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    throw new Error('스키마 파일을 찾을 수 없습니다: ' + schemaPath);
  }
  
  execSync(`psql -U postgres -d table_order_test_db -f "${schemaPath}"`, { 
    stdio: 'inherit'
  });
  console.log('✅ 스키마가 성공적으로 적용되었습니다.');
} catch (error) {
  console.log('❌ 스키마 적용에 실패했습니다.');
  console.log('   오류:', error.message);
  process.exit(1);
}

console.log('✅ 테스트 환경 설정이 완료되었습니다!');
console.log('');
console.log('다음 명령어로 테스트를 실행할 수 있습니다:');
console.log('  npm test                    # 모든 테스트 실행');
console.log('  npm run test:watch          # 테스트 감시 모드');
console.log('  npm run test:coverage       # 커버리지와 함께 테스트 실행');
console.log('  npm run test:integration    # 통합 테스트만 실행');
console.log('  npm run test:unit           # 단위 테스트만 실행'); 