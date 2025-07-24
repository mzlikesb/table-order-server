FROM node:18-alpine

# 보안을 위한 non-root 사용자 생성
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

WORKDIR /usr/src/app

# package.json과 package-lock.json 복사
COPY package*.json ./

# 의존성 설치 (개발 의존성도 포함)
RUN npm ci

# 소스코드 복사
COPY . .

# 파일 소유권 변경
RUN chown -R nodejs:nodejs /usr/src/app
USER nodejs

# 포트 노출
EXPOSE 4000

# 헬스체크 추가
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/api/menus || exit 1

# 서버 실행
CMD ["npm", "start"]
