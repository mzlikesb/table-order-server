const request = require('supertest');
const path = require('path');
const fs = require('fs');
const app = require('../../index');

describe('Upload Routes Integration Tests', () => {
  let testData;
  let authToken;

  beforeAll(async () => {
    await global.setupTestDatabase();
    testData = await global.createTestData();
    
    authToken = global.generateTestToken({
      adminId: testData.admin.id,
      username: testData.admin.username,
      email: testData.admin.email,
      is_super_admin: false
    });
  });

  afterAll(async () => {
    await global.cleanupTestDatabase();
  });

  beforeEach(async () => {
    await global.cleanupTestDatabase();
    testData = await global.createTestData();
    
    authToken = global.generateTestToken({
      adminId: testData.admin.id,
      username: testData.admin.username,
      email: testData.admin.email,
      is_super_admin: false
    });
  });

  describe('POST /api/upload/image', () => {
    it('should upload image successfully', async () => {
      // 테스트용 이미지 파일 생성
      const testImagePath = path.join(__dirname, '../../test-image.jpg');
      const testImageBuffer = Buffer.from('fake image data');
      fs.writeFileSync(testImagePath, testImageBuffer);

      const response = await request(app)
        .post('/api/upload/image')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .attach('image', testImagePath)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('filename');
      expect(response.body).toHaveProperty('url');

      // 테스트 파일 정리
      fs.unlinkSync(testImagePath);
    });

    it('should reject upload without authentication', async () => {
      const response = await request(app)
        .post('/api/upload/image')
        .set('X-Store-ID', testData.store.id.toString())
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject upload without store ID', async () => {
      const response = await request(app)
        .post('/api/upload/image')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject upload without image file', async () => {
      const response = await request(app)
        .post('/api/upload/image')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject upload with invalid file type', async () => {
      // 테스트용 텍스트 파일 생성
      const testFilePath = path.join(__dirname, '../../test-file.txt');
      fs.writeFileSync(testFilePath, 'This is not an image');

      const response = await request(app)
        .post('/api/upload/image')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .attach('image', testFilePath)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('이미지 파일만 업로드 가능합니다');

      // 테스트 파일 정리
      fs.unlinkSync(testFilePath);
    });
  });

  describe('DELETE /api/upload/:filename', () => {
    it('should delete uploaded file successfully', async () => {
      // 먼저 파일 업로드
      const testImagePath = path.join(__dirname, '../../test-image.jpg');
      const testImageBuffer = Buffer.from('fake image data');
      fs.writeFileSync(testImagePath, testImageBuffer);

      const uploadResponse = await request(app)
        .post('/api/upload/image')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .attach('image', testImagePath);

      const filename = uploadResponse.body.filename;

      // 파일 삭제
      const response = await request(app)
        .delete(`/api/upload/${filename}`)
        .set('Authorization', `Bearer ${authToken}`)
        .query({ store_id: testData.store.id })
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('파일이 성공적으로 삭제되었습니다');

      // 테스트 파일 정리
      fs.unlinkSync(testImagePath);
    });

    it('should reject delete without authentication', async () => {
      const response = await request(app)
        .delete('/api/upload/test-file.jpg')
        .query({ store_id: testData.store.id })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject delete without store_id', async () => {
      const response = await request(app)
        .delete('/api/upload/test-file.jpg')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('store_id가 필요합니다');
    });

    it('should handle delete of non-existent file', async () => {
      const response = await request(app)
        .delete('/api/upload/non-existent-file.jpg')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ store_id: testData.store.id })
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('파일을 찾을 수 없습니다');
    });
  });
}); 