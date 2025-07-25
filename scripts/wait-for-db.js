#!/usr/bin/env node

const { Client } = require('pg');

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5433,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'table_order_test_db'
};

async function waitForDatabase() {
  console.log('🔄 데이터베이스 연결을 기다리는 중...');
  
  const maxAttempts = 30;
  const delay = 2000;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const client = new Client(config);
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      
      console.log('✅ 데이터베이스 연결 성공!');
      return;
    } catch (error) {
      console.log(`⏳ 시도 ${attempt}/${maxAttempts}: 데이터베이스 연결 대기 중...`);
      
      if (attempt === maxAttempts) {
        console.error('❌ 데이터베이스 연결 실패');
        console.error('오류:', error.message);
        process.exit(1);
      }
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

waitForDatabase(); 