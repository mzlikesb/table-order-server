// 테스트용 환경 변수 설정
process.env.NODE_ENV = 'test';
process.env.PORT = 3001;
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5433';  // Docker 테스트 DB 포트
process.env.DB_USER = 'postgres';
process.env.DB_PASSWORD = 'postgres';
process.env.DB_NAME = 'table_order_test_db';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.JWT_EXPIRES_IN = '1h';
process.env.ALLOWED_ORIGINS = 'http://localhost:3000,http://localhost:3001';
process.env.RATE_LIMIT_WINDOW_MS = '900000';
process.env.RATE_LIMIT_MAX_REQUESTS = '100';
process.env.LOGIN_RATE_LIMIT_MAX = '5';
process.env.LOG_LEVEL = 'error';
process.env.UPLOAD_PATH = './uploads/test';
process.env.MAX_FILE_SIZE = '5242880';
process.env.ALLOWED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp'; 