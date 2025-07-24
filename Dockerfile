FROM node:18-alpine

WORKDIR /usr/src/app

# package.json과 package-lock.json 복사
COPY package*.json ./

# 의존성 설치
RUN npm ci --only=production

# 소스코드 및 환경설정 복사
COPY . .

# 포트 노출
EXPOSE 4000

# 헬스체크 추가
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/api/menus || exit 1

# 서버 실행
CMD ["npm", "start"]
