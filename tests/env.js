// 테스트용 환경 변수 설정
process.env.NODE_ENV = 'test';
process.env.PORT = 4001;
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_USER = 'postgres';
process.env.DB_PASSWORD = 'test_password';
process.env.DB_NAME = 'table_order_test_db';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.JWT_EXPIRES_IN = '1h';
process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
process.env.RATE_LIMIT_WINDOW_MS = '900000';
process.env.RATE_LIMIT_MAX_REQUESTS = '1000';
process.env.LOGIN_RATE_LIMIT_MAX = '5';
process.env.LOG_LEVEL = 'error'; 