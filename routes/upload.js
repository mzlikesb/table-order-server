const express = require('express');
const router = express.Router();
const pool = require('../db/connection');
const { 
  upload, 
  uploadMultiple, 
  validateFile, 
  deleteFile, 
  getFileInfo, 
  moveFile, 
  imagesDir 
} = require('../middleware/upload');
const { 
  processMenuImage, 
  processStoreLogo, 
  validateImage 
} = require('../utils/imageProcessor');
const { 
  authenticateToken, 
  requireStorePermission, 
  requireRole 
} = require('../middleware/auth');
const fs = require('fs');
const path = require('path');

/**
 * [POST] /api/upload/menu-image
 * 메뉴 이미지 업로드
 */
router.post('/menu-image', 
  authenticateToken, 
  requireStorePermission, 
  requireRole(['owner', 'manager']),
  upload.single('image'),
  validateFile,
  async (req, res) => {
    try {
      // multipart/form-data에서 store_id를 찾는 방법 개선
      const store_id = req.body.store_id || req.query.store_id || req.headers['x-store-id'];
      const file = req.file;
      
      if (!store_id) {
        // 임시 파일 삭제
        if (file) deleteFile(file.path);
        return res.status(400).json({ error: 'store_id가 필요합니다.' });
      }

      // 이미지 유효성 검사
      const validation = await validateImage(file.path);
      if (!validation.valid) {
        deleteFile(file.path);
        return res.status(400).json({ error: validation.error });
      }

      // 이미지 처리 (썸네일, 중간 크기, 원본)
      const processedImages = await processMenuImage(file.path, file.filename);
      if (!processedImages) {
        deleteFile(file.path);
        return res.status(500).json({ error: '이미지 처리에 실패했습니다.' });
      }

      // 임시 파일 삭제
      deleteFile(file.path);

      // 파일 정보 반환
      const fileInfo = {
        ...getFileInfo(file),
        processed: processedImages,
        metadata: validation.metadata
      };

      res.status(201).json({
        message: '메뉴 이미지가 성공적으로 업로드되었습니다.',
        file: fileInfo
      });

    } catch (error) {
      console.error('메뉴 이미지 업로드 실패:', error);
      if (req.file) {
        deleteFile(req.file.path);
      }
      res.status(500).json({ error: '이미지 업로드에 실패했습니다.' });
    }
  }
);

/**
 * [POST] /api/upload/store-logo
 * 가게 로고 업로드
 */
router.post('/store-logo',
  authenticateToken,
  requireStorePermission,
  requireRole(['owner']),
  upload.single('logo'),
  validateFile,
  async (req, res) => {
    try {
      const { store_id } = req.body;
      const file = req.file;

      if (!store_id) {
        deleteFile(file.path);
        return res.status(400).json({ error: 'store_id가 필요합니다.' });
      }

      // 이미지 유효성 검사
      const validation = await validateImage(file.path);
      if (!validation.valid) {
        deleteFile(file.path);
        return res.status(400).json({ error: validation.error });
      }

      // 로고 이미지 처리
      const processedLogos = await processStoreLogo(file.path, file.filename);
      if (!processedLogos) {
        deleteFile(file.path);
        return res.status(500).json({ error: '로고 처리에 실패했습니다.' });
      }

      // 임시 파일 삭제
      deleteFile(file.path);

      // 기존 로고 URL 업데이트
      await pool.query(
        'UPDATE stores SET logo_url = $1, small_logo_url = $2 WHERE id = $3',
        [processedLogos.logo, processedLogos.smallLogo, store_id]
      );

      const fileInfo = {
        ...getFileInfo(file),
        processed: processedLogos,
        metadata: validation.metadata
      };

      res.status(201).json({
        message: '가게 로고가 성공적으로 업로드되었습니다.',
        file: fileInfo
      });

    } catch (error) {
      console.error('가게 로고 업로드 실패:', error);
      if (req.file) {
        deleteFile(req.file.path);
      }
      res.status(500).json({ error: '로고 업로드에 실패했습니다.' });
    }
  }
);

/**
 * [POST] /api/upload/multiple
 * 다중 파일 업로드
 */
router.post('/multiple',
  authenticateToken,
  requireStorePermission,
  requireRole(['owner', 'manager']),
  uploadMultiple.array('images', 5),
  validateFile,
  async (req, res) => {
    try {
      const { store_id, type = 'menu' } = req.body;
      const files = req.files;

      if (!store_id) {
        // 모든 임시 파일 삭제
        files.forEach(file => deleteFile(file.path));
        return res.status(400).json({ error: 'store_id가 필요합니다.' });
      }

      const processedFiles = [];

      for (const file of files) {
        try {
          // 이미지 유효성 검사
          const validation = await validateImage(file.path);
          if (!validation.valid) {
            deleteFile(file.path);
            continue;
          }

          let processedImages = null;

          // 타입에 따른 이미지 처리
          if (type === 'menu') {
            processedImages = await processMenuImage(file.path, file.filename);
          } else if (type === 'store') {
            processedImages = await processStoreLogo(file.path, file.filename);
          }

          if (processedImages) {
            // 임시 파일 삭제
            deleteFile(file.path);

            processedFiles.push({
              ...getFileInfo(file),
              processed: processedImages,
              metadata: validation.metadata
            });
          }
        } catch (error) {
          console.error(`파일 처리 실패: ${file.originalname}`, error);
          deleteFile(file.path);
        }
      }

      res.status(201).json({
        message: `${processedFiles.length}개의 파일이 성공적으로 업로드되었습니다.`,
        files: processedFiles
      });

    } catch (error) {
      console.error('다중 파일 업로드 실패:', error);
      if (req.files) {
        req.files.forEach(file => deleteFile(file.path));
      }
      res.status(500).json({ error: '파일 업로드에 실패했습니다.' });
    }
  }
);

/**
 * [DELETE] /api/upload/:filename
 * 파일 삭제
 */
router.delete('/:filename',
  authenticateToken,
  requireStorePermission,
  requireRole(['owner', 'manager']),
  async (req, res) => {
    try {
      const { filename } = req.params;
      const { store_id } = req.query;

      if (!store_id) {
        return res.status(400).json({ error: 'store_id가 필요합니다.' });
      }

      const filePath = path.join(imagesDir, filename);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
      }

      // 파일 삭제
      const deleted = deleteFile(filePath);
      
      if (deleted) {
        // 관련 파일들도 삭제 (썸네일, 중간 크기 등)
        const baseName = path.parse(filename).name;
        const relatedFiles = [
          `${baseName}_thumb.jpg`,
          `${baseName}_medium.jpg`,
          `${baseName}_original.jpg`,
          `${baseName}_logo.jpg`,
          `${baseName}_logo_small.jpg`
        ];

        relatedFiles.forEach(relatedFile => {
          const relatedPath = path.join(imagesDir, relatedFile);
          if (fs.existsSync(relatedPath)) {
            deleteFile(relatedPath);
          }
        });

        res.json({ message: '파일이 성공적으로 삭제되었습니다.' });
      } else {
        res.status(500).json({ error: '파일 삭제에 실패했습니다.' });
      }

    } catch (error) {
      console.error('파일 삭제 실패:', error);
      res.status(500).json({ error: '파일 삭제에 실패했습니다.' });
    }
  }
);

/**
 * [GET] /api/upload/files/:storeId
 * 가게별 업로드된 파일 목록 조회
 */
router.get('/files/:storeId',
  authenticateToken,
  requireStorePermission,
  async (req, res) => {
    try {
      const { storeId } = req.params;
      const { type } = req.query;

      // 데이터베이스에서 해당 가게의 이미지 URL들 조회
      let query = '';
      let params = [storeId];

      if (type === 'menu') {
        query = `
          SELECT id, name, image_url, created_at 
          FROM menus 
          WHERE store_id = $1 AND image_url IS NOT NULL
          ORDER BY created_at DESC
        `;
      } else if (type === 'store') {
        query = `
          SELECT id, name, logo_url, small_logo_url, created_at 
          FROM stores 
          WHERE id = $1 AND logo_url IS NOT NULL
        `;
      } else {
        // 모든 이미지
        query = `
          SELECT 'menu' as type, id, name, image_url as url, created_at 
          FROM menus 
          WHERE store_id = $1 AND image_url IS NOT NULL
          UNION ALL
          SELECT 'store' as type, id, name, logo_url as url, created_at 
          FROM stores 
          WHERE id = $1 AND logo_url IS NOT NULL
          ORDER BY created_at DESC
        `;
      }

      const result = await pool.query(query, params);
      
      res.json({
        files: result.rows,
        count: result.rowCount
      });

    } catch (error) {
      console.error('파일 목록 조회 실패:', error);
      res.status(500).json({ error: '파일 목록 조회에 실패했습니다.' });
    }
  }
);

/**
 * [POST] /api/upload/validate
 * 파일 유효성 검사 (업로드 전)
 */
router.post('/validate',
  upload.single('file'),
  validateFile,
  async (req, res) => {
    try {
      const file = req.file;
      
      // 이미지 유효성 검사
      const validation = await validateImage(file.path);
      
      // 임시 파일 삭제
      deleteFile(file.path);

      if (validation.valid) {
        res.json({
          valid: true,
          metadata: validation.metadata,
          message: '파일이 유효합니다.'
        });
      } else {
        res.status(400).json({
          valid: false,
          error: validation.error
        });
      }

    } catch (error) {
      console.error('파일 유효성 검사 실패:', error);
      if (req.file) {
        deleteFile(req.file.path);
      }
      res.status(500).json({ error: '파일 유효성 검사에 실패했습니다.' });
    }
  }
);

module.exports = router; 