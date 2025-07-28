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
} = require('../../../middleware/security');

describe('Security Middleware Tests', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  describe('CORS Configuration', () => {
    it('should have proper CORS configuration', () => {
      expect(corsOptions).toBeDefined();
      expect(corsOptions.origin).toBeDefined();
      expect(corsOptions.methods).toBeDefined();
      expect(Array.isArray(corsOptions.methods)).toBe(true);
    });
  });

  describe('Input Validation', () => {
    it('should sanitize input data', async () => {
      app.use(validateInput);
      app.post('/test', (req, res) => {
        res.json({ 
          body: req.body,
          query: req.query 
        });
      });

      const response = await request(app)
        .post('/test')
        .set('Content-Type', 'application/json')
        .send({ 
          name: '<script>alert("xss")</script>',
          email: 'test@example.com'
        });

      expect(response.status).toBe(200);
      expect(response.body.body.name).toBe('scriptalert("xss")/script');
    });

    it('should accept valid JSON requests', async () => {
      app.use(validateInput);
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
      expect(typeof loginRateLimit).toBe('function');
    });

    it('should have API rate limit configured', () => {
      expect(apiRateLimit).toBeDefined();
      expect(typeof apiRateLimit).toBe('function');
    });
  });

  describe('Error Handler', () => {
    it('should handle errors properly', async () => {
      app.use(errorHandler);
      app.get('/error', (req, res, next) => {
        next(new Error('Test error'));
      });

      const response = await request(app).get('/error');
      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle validation errors', async () => {
      app.use(errorHandler);
      app.get('/validation-error', (req, res, next) => {
        const error = new Error('Validation failed');
        error.status = 400;
        next(error);
      });

      const response = await request(app).get('/validation-error');
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Request Logger', () => {
    it('should log requests', async () => {
      const originalConsoleLog = console.log;
      const mockConsoleLog = jest.fn();
      console.log = mockConsoleLog;

      app.use(requestLogger);
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      await request(app).get('/test');

      expect(mockConsoleLog).toHaveBeenCalled();
      console.log = originalConsoleLog;
    });
  });
}); 