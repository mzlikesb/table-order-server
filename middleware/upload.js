const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 업로드 디렉토리 생성
const uploadDir = path.join(__dirname, '../uploads');
const imagesDir = path.join(uploadDir, 'images');
const tempDir = path.join(uploadDir, 'temp');

// 디렉토리가 없으면 생성
[uploadDir, imagesDir, tempDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

/**
 * 파일 필터링 (이미지 파일만 허용)
 */
const fileFilter = (req, file, cb) => {
  // 허용된 이미지 타입
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('지원하지 않는 파일 형식입니다. JPEG, PNG, GIF, WebP만 업로드 가능합니다.'), false);
  }
};

/**
 * 파일명 생성 (중복 방지)
 */
const generateFileName = (file) => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  const ext = path.extname(file.originalname);
  return `${timestamp}_${random}${ext}`;
};

/**
 * 스토리지 설정
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // 임시 디렉토리에 저장
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const fileName = generateFileName(file);
    cb(null, fileName);
  }
});

/**
 * 메모리 스토리지 (이미지 리사이징용)
 */
const memoryStorage = multer.memoryStorage();

/**
 * 기본 업로드 설정
 */
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1 // 한 번에 1개 파일
  }
});

/**
 * 메모리 업로드 설정 (리사이징용)
 */
const uploadMemory = multer({
  storage: memoryStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1
  }
});

/**
 * 다중 파일 업로드 설정
 */
const uploadMultiple = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 5 // 최대 5개 파일
  }
});

/**
 * 파일 검증 미들웨어
 */
const validateFile = (req, res, next) => {
  if (!req.file && !req.files) {
    return res.status(400).json({ error: '업로드할 파일이 없습니다.' });
  }
  next();
};

/**
 * 파일 삭제 함수
 */
const deleteFile = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch (error) {
    console.error('파일 삭제 실패:', error);
  }
  return false;
};

/**
 * 파일 정보 조회 함수
 */
const getFileInfo = (file) => {
  return {
    originalName: file.originalname,
    filename: file.filename,
    mimetype: file.mimetype,
    size: file.size,
    path: file.path,
    url: `/uploads/images/${file.filename}`
  };
};

/**
 * 파일 이동 함수 (임시 → 영구)
 */
const moveFile = (tempPath, destination) => {
  try {
    const fileName = path.basename(tempPath);
    const newPath = path.join(destination, fileName);
    
    fs.renameSync(tempPath, newPath);
    return newPath;
  } catch (error) {
    console.error('파일 이동 실패:', error);
    return null;
  }
};

/**
 * 디렉토리 정리 함수 (임시 파일 삭제)
 */
const cleanupTempFiles = () => {
  try {
    const files = fs.readdirSync(tempDir);
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24시간

    files.forEach(file => {
      const filePath = path.join(tempDir, file);
      const stats = fs.statSync(filePath);
      
      if (now - stats.mtime.getTime() > maxAge) {
        deleteFile(filePath);
      }
    });
  } catch (error) {
    console.error('임시 파일 정리 실패:', error);
  }
};

// 정기적으로 임시 파일 정리 (1시간마다)
setInterval(cleanupTempFiles, 60 * 60 * 1000);

module.exports = {
  upload,
  uploadMemory,
  uploadMultiple,
  validateFile,
  deleteFile,
  getFileInfo,
  moveFile,
  cleanupTempFiles,
  uploadDir,
  imagesDir,
  tempDir
}; 