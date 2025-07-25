module.exports = {
  // 테스트 환경 설정
  testEnvironment: 'node',
  
  // 테스트 파일 패턴
  testMatch: [
    '**/__tests__/**/*.js',
    '**/?(*.)+(spec|test).js'
  ],
  
  // 테스트 파일 제외 패턴
  testPathIgnorePatterns: [
    '/node_modules/',
    '/uploads/',
    '/temp/'
  ],
  
  // 모듈 파일 확장자
  moduleFileExtensions: ['js', 'json'],
  
  // 테스트 커버리지 설정
  collectCoverageFrom: [
    'routes/**/*.js',
    'middleware/**/*.js',
    'utils/**/*.js',
    '!**/node_modules/**',
    '!**/__tests__/**',
    '!**/coverage/**'
  ],
  
  // 커버리지 리포트 설정
  coverageReporters: [
    'text',
    'lcov',
    'html'
  ],
  
  // 테스트 타임아웃 설정 (30초)
  testTimeout: 30000,
  
  // 테스트 실행 전 실행할 스크립트
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  
  // 환경 변수 설정
  setupFiles: ['<rootDir>/tests/env.js'],
  
                // 모듈 이름 매핑
              moduleNameMapper: {
                '^@/(.*)$': '<rootDir>/$1'
              },
  
  // 테스트 결과 표시 설정
  verbose: true,
  
  // 테스트 실행 시 콘솔 출력 허용
  silent: false,
  
  // 테스트 실패 시 즉시 중단
  bail: false,
  
  // 테스트 파일 변경 감지
  watchPathIgnorePatterns: [
    '/node_modules/',
    '/uploads/',
    '/temp/'
  ]
}; 