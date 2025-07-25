const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

/**
 * 이미지 리사이징 옵션
 */
const resizeOptions = {
  thumbnail: { width: 150, height: 150, fit: 'cover' },
  small: { width: 300, height: 300, fit: 'inside' },
  medium: { width: 600, height: 600, fit: 'inside' },
  large: { width: 1200, height: 1200, fit: 'inside' }
};

/**
 * 이미지 리사이징
 */
const resizeImage = async (inputPath, outputPath, options) => {
  try {
    await sharp(inputPath)
      .resize(options.width, options.height, { fit: options.fit })
      .jpeg({ quality: 85, progressive: true })
      .toFile(outputPath);
    
    return true;
  } catch (error) {
    console.error('이미지 리사이징 실패:', error);
    return false;
  }
};

/**
 * 이미지 압축
 */
const compressImage = async (inputPath, outputPath, quality = 85) => {
  try {
    await sharp(inputPath)
      .jpeg({ quality, progressive: true })
      .toFile(outputPath);
    
    return true;
  } catch (error) {
    console.error('이미지 압축 실패:', error);
    return false;
  }
};

/**
 * 이미지 포맷 변환
 */
const convertFormat = async (inputPath, outputPath, format = 'jpeg') => {
  try {
    let sharpInstance = sharp(inputPath);
    
    switch (format.toLowerCase()) {
      case 'jpeg':
      case 'jpg':
        sharpInstance = sharpInstance.jpeg({ quality: 85, progressive: true });
        break;
      case 'png':
        sharpInstance = sharpInstance.png({ quality: 85 });
        break;
      case 'webp':
        sharpInstance = sharpInstance.webp({ quality: 85 });
        break;
      default:
        sharpInstance = sharpInstance.jpeg({ quality: 85, progressive: true });
    }
    
    await sharpInstance.toFile(outputPath);
    return true;
  } catch (error) {
    console.error('이미지 포맷 변환 실패:', error);
    return false;
  }
};

/**
 * 메뉴 이미지 처리 (썸네일 + 원본)
 */
const processMenuImage = async (inputPath, filename) => {
  try {
    const { imagesDir } = require('../middleware/upload');
    const baseName = path.parse(filename).name;
    const ext = '.jpg';
    
    // 원본 이미지 (압축)
    const originalPath = path.join(imagesDir, `${baseName}_original${ext}`);
    await compressImage(inputPath, originalPath, 90);
    
    // 썸네일 이미지
    const thumbnailPath = path.join(imagesDir, `${baseName}_thumb${ext}`);
    await resizeImage(inputPath, thumbnailPath, resizeOptions.thumbnail);
    
    // 중간 크기 이미지
    const mediumPath = path.join(imagesDir, `${baseName}_medium${ext}`);
    await resizeImage(inputPath, mediumPath, resizeOptions.medium);
    
    return {
      original: `/uploads/images/${path.basename(originalPath)}`,
      thumbnail: `/uploads/images/${path.basename(thumbnailPath)}`,
      medium: `/uploads/images/${path.basename(mediumPath)}`
    };
  } catch (error) {
    console.error('메뉴 이미지 처리 실패:', error);
    return null;
  }
};

/**
 * 가게 로고 처리
 */
const processStoreLogo = async (inputPath, filename) => {
  try {
    const { imagesDir } = require('../middleware/upload');
    const baseName = path.parse(filename).name;
    const ext = '.jpg';
    
    // 로고 이미지 (정사각형)
    const logoPath = path.join(imagesDir, `${baseName}_logo${ext}`);
    await resizeImage(inputPath, logoPath, { width: 200, height: 200, fit: 'cover' });
    
    // 작은 로고
    const smallLogoPath = path.join(imagesDir, `${baseName}_logo_small${ext}`);
    await resizeImage(inputPath, smallLogoPath, { width: 100, height: 100, fit: 'cover' });
    
    return {
      logo: `/uploads/images/${path.basename(logoPath)}`,
      smallLogo: `/uploads/images/${path.basename(smallLogoPath)}`
    };
  } catch (error) {
    console.error('가게 로고 처리 실패:', error);
    return null;
  }
};

/**
 * 이미지 메타데이터 추출
 */
const getImageMetadata = async (filePath) => {
  try {
    const metadata = await sharp(filePath).metadata();
    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      size: metadata.size,
      hasAlpha: metadata.hasAlpha,
      hasProfile: metadata.hasProfile
    };
  } catch (error) {
    console.error('이미지 메타데이터 추출 실패:', error);
    return null;
  }
};

/**
 * 이미지 유효성 검사
 */
const validateImage = async (filePath) => {
  try {
    const metadata = await getImageMetadata(filePath);
    if (!metadata) return false;
    
    // 최소/최대 크기 검사
    const minSize = 50;
    const maxSize = 4000;
    
    if (metadata.width < minSize || metadata.height < minSize) {
      return { valid: false, error: '이미지가 너무 작습니다.' };
    }
    
    if (metadata.width > maxSize || metadata.height > maxSize) {
      return { valid: false, error: '이미지가 너무 큽니다.' };
    }
    
    return { valid: true, metadata };
  } catch (error) {
    return { valid: false, error: '이미지 파일이 손상되었습니다.' };
  }
};

/**
 * 워터마크 추가
 */
const addWatermark = async (inputPath, outputPath, watermarkText = 'Table Order') => {
  try {
    const svgImage = `
      <svg width="200" height="50">
        <text x="10" y="30" font-family="Arial" font-size="16" fill="rgba(255,255,255,0.7)">
          ${watermarkText}
        </text>
      </svg>
    `;
    
    await sharp(inputPath)
      .composite([{
        input: Buffer.from(svgImage),
        gravity: 'southeast'
      }])
      .jpeg({ quality: 85 })
      .toFile(outputPath);
    
    return true;
  } catch (error) {
    console.error('워터마크 추가 실패:', error);
    return false;
  }
};

module.exports = {
  resizeImage,
  compressImage,
  convertFormat,
  processMenuImage,
  processStoreLogo,
  getImageMetadata,
  validateImage,
  addWatermark,
  resizeOptions
}; 