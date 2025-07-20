FROM node:18-alpine

# 작업 디렉터리 설정
WORKDIR /usr/src/app

# package.json과 package-lock.json 복사
COPY package*.json ./

# 의존성 설치
RUN npm ci --only=production

# 소스코드 복사
COPY . .

# 포트 노출
EXPOSE 4000

# 서버 실행
CMD ["npm", "start"]
