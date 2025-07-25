# 테스트 환경 설정 스크립트 (PowerShell)

Write-Host "🧪 테스트 환경을 설정합니다..." -ForegroundColor Green

# PostgreSQL 테스트 데이터베이스 생성
Write-Host "📦 PostgreSQL 테스트 데이터베이스를 생성합니다..." -ForegroundColor Yellow

# PostgreSQL에 연결하여 테스트 데이터베이스 생성
$result = psql -U postgres -c "CREATE DATABASE table_order_test_db;" 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ 테스트 데이터베이스가 생성되었습니다." -ForegroundColor Green
} else {
    Write-Host "ℹ️ 테스트 데이터베이스가 이미 존재합니다." -ForegroundColor Blue
}

# 테스트 데이터베이스에 스키마 적용
Write-Host "🗄️ 테스트 데이터베이스에 스키마를 적용합니다..." -ForegroundColor Yellow

psql -U postgres -d table_order_test_db -f database/schema.sql
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ 스키마가 성공적으로 적용되었습니다." -ForegroundColor Green
} else {
    Write-Host "❌ 스키마 적용에 실패했습니다." -ForegroundColor Red
    exit 1
}

Write-Host "✅ 테스트 환경 설정이 완료되었습니다!" -ForegroundColor Green
Write-Host ""
Write-Host "다음 명령어로 테스트를 실행할 수 있습니다:" -ForegroundColor Cyan
Write-Host "  npm test                    # 모든 테스트 실행" -ForegroundColor White
Write-Host "  npm run test:watch          # 테스트 감시 모드" -ForegroundColor White
Write-Host "  npm run test:coverage       # 커버리지와 함께 테스트 실행" -ForegroundColor White
Write-Host "  npm run test:integration    # 통합 테스트만 실행" -ForegroundColor White
Write-Host "  npm run test:unit           # 단위 테스트만 실행" -ForegroundColor White 