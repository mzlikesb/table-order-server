const request = require('supertest');
const express = require('express');
const { 
  corsOptions, 
  helmetConfig, 
  validateInput, 
  requestLogger, 
  errorHandler,
  loginRateLimit,
  apiRateLimit
} = require('../../middleware/security');

describe('Security Middleware Tests', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(helmetConfig);
    app.use(validateInput);
    app.use(requestLogger);
    app.use(errorHandler);
  });

  describe('CORS Configuration', () => {
    it('should have proper CORS configuration', () => {
      expect(corsOptions).toBeDefined();
      expect(corsOptions.origin).toBeDefined();
      expect(corsOptions.methods).toBeDefined();
    });
  });

  describe('Input Validation', () => {
    it('should reject requests with malformed JSON', async () => {
      app.post('/test', (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .post('/test')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}');

      expect(response.status).toBe(400);
    });

    it('should accept valid JSON requests', async () => {
      app.post('/test', (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .post('/test')
        .set('Content-Type', 'application/json')
        .send({ valid: 'json' });

      expect(response.status).toBe(200);
    });
  });

  describe('Rate Limiting', () => {
    it('should have login rate limit configured', () => {
      expect(loginRateLimit).toBeDefined();
    });

    it('should have API rate limit configured', () => {
      expect(apiRateLimit).toBeDefined();
    });
  });

  describe('Error Handler', () => {
    it('should handle errors properly', async () => {
      app.get('/error', (req, res, next) => {
        next(new Error('Test error'));
      });

      const response = await request(app).get('/error');
      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });
}); 