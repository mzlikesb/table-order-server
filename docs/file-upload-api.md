# 파일 업로드 API 문서

## 개요

이 문서는 Table Order Server의 파일 업로드 기능에 대한 설명입니다. 메뉴 이미지, 가게 로고 등의 이미지 파일을 업로드하고 관리할 수 있습니다.

## 지원 파일 형식

- **JPEG/JPG**: 가장 일반적인 이미지 형식
- **PNG**: 투명도 지원
- **GIF**: 애니메이션 지원
- **WebP**: 최신 압축 형식

## 파일 제한사항

- **최대 파일 크기**: 5MB
- **최소 이미지 크기**: 50x50 픽셀
- **최대 이미지 크기**: 4000x4000 픽셀
- **동시 업로드**: 최대 5개 파일

## API 엔드포인트

### 1. 메뉴 이미지 업로드

```http
POST /api/upload/menu-image
Authorization: Bearer <token>
Content-Type: multipart/form-data

Form Data:
- image: [파일]
- store_id: 1
```

**응답:**
```json
{
  "message": "메뉴 이미지가 성공적으로 업로드되었습니다.",
  "file": {
    "originalName": "menu.jpg",
    "filename": "1703123456789_abc123.jpg",
    "mimetype": "image/jpeg",
    "size": 1024000,
    "path": "/path/to/file",
    "url": "/uploads/images/1703123456789_abc123.jpg",
    "processed": {
      "original": "/uploads/images/1703123456789_abc123_original.jpg",
      "thumbnail": "/uploads/images/1703123456789_abc123_thumb.jpg",
      "medium": "/uploads/images/1703123456789_abc123_medium.jpg"
    },
    "metadata": {
      "width": 800,
      "height": 600,
      "format": "jpeg",
      "size": 1024000
    }
  }
}
```

### 2. 가게 로고 업로드

```http
POST /api/upload/store-logo
Authorization: Bearer <token>
Content-Type: multipart/form-data

Form Data:
- logo: [파일]
- store_id: 1
```

**응답:**
```json
{
  "message": "가게 로고가 성공적으로 업로드되었습니다.",
  "file": {
    "originalName": "logo.png",
    "filename": "1703123456789_def456.png",
    "mimetype": "image/png",
    "size": 512000,
    "url": "/uploads/images/1703123456789_def456.png",
    "processed": {
      "logo": "/uploads/images/1703123456789_def456_logo.jpg",
      "smallLogo": "/uploads/images/1703123456789_def456_logo_small.jpg"
    },
    "metadata": {
      "width": 400,
      "height": 400,
      "format": "png"
    }
  }
}
```

### 3. 다중 파일 업로드

```http
POST /api/upload/multiple
Authorization: Bearer <token>
Content-Type: multipart/form-data

Form Data:
- images: [파일1, 파일2, 파일3]
- store_id: 1
- type: menu (또는 store)
```

**응답:**
```json
{
  "message": "3개의 파일이 성공적으로 업로드되었습니다.",
  "files": [
    {
      "originalName": "menu1.jpg",
      "filename": "1703123456789_ghi789.jpg",
      "processed": {
        "original": "/uploads/images/1703123456789_ghi789_original.jpg",
        "thumbnail": "/uploads/images/1703123456789_ghi789_thumb.jpg",
        "medium": "/uploads/images/1703123456789_ghi789_medium.jpg"
      }
    }
  ]
}
```

### 4. 파일 삭제

```http
DELETE /api/upload/:filename?store_id=1
Authorization: Bearer <token>
```

**응답:**
```json
{
  "message": "파일이 성공적으로 삭제되었습니다."
}
```

### 5. 파일 목록 조회

```http
GET /api/upload/files/:storeId?type=menu
Authorization: Bearer <token>
```

**응답:**
```json
{
  "files": [
    {
      "id": 1,
      "name": "스테이크",
      "image_url": "/uploads/images/1703123456789_abc123_original.jpg",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ],
  "count": 1
}
```

### 6. 파일 유효성 검사

```http
POST /api/upload/validate
Content-Type: multipart/form-data

Form Data:
- file: [파일]
```

**응답:**
```json
{
  "valid": true,
  "metadata": {
    "width": 800,
    "height": 600,
    "format": "jpeg",
    "size": 1024000
  },
  "message": "파일이 유효합니다."
}
```

## 이미지 처리 옵션

### 메뉴 이미지
- **원본**: 압축된 원본 이미지 (품질 90%)
- **썸네일**: 150x150 픽셀 (정사각형 크롭)
- **중간 크기**: 600x600 픽셀 (비율 유지)

### 가게 로고
- **로고**: 200x200 픽셀 (정사각형 크롭)
- **작은 로고**: 100x100 픽셀 (정사각형 크롭)

## 클라이언트 사용 예시

### JavaScript (Fetch API)

```javascript
// 메뉴 이미지 업로드
async function uploadMenuImage(file, storeId, token) {
  const formData = new FormData();
  formData.append('image', file);
  formData.append('store_id', storeId);

  const response = await fetch('/api/upload/menu-image', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });

  return await response.json();
}

// 다중 파일 업로드
async function uploadMultipleImages(files, storeId, type, token) {
  const formData = new FormData();
  
  files.forEach(file => {
    formData.append('images', file);
  });
  
  formData.append('store_id', storeId);
  formData.append('type', type);

  const response = await fetch('/api/upload/multiple', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });

  return await response.json();
}
```

### HTML Form

```html
<form id="uploadForm" enctype="multipart/form-data">
  <input type="file" name="image" accept="image/*" required>
  <input type="hidden" name="store_id" value="1">
  <button type="submit">업로드</button>
</form>

<script>
document.getElementById('uploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const formData = new FormData(e.target);
  
  try {
    const response = await fetch('/api/upload/menu-image', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: formData
    });
    
    const result = await response.json();
    console.log('업로드 성공:', result);
  } catch (error) {
    console.error('업로드 실패:', error);
  }
});
</script>
```

## 에러 처리

### 일반적인 에러 응답

```json
{
  "error": "에러 메시지"
}
```

### 에러 코드

- `400`: 잘못된 요청 (파일 없음, store_id 없음 등)
- `401`: 인증 필요
- `403`: 권한 없음
- `413`: 파일 크기 초과
- `415`: 지원하지 않는 파일 형식
- `500`: 서버 오류

### 에러 메시지 예시

- "업로드할 파일이 없습니다."
- "지원하지 않는 파일 형식입니다. JPEG, PNG, GIF, WebP만 업로드 가능합니다."
- "파일 크기가 5MB를 초과했습니다."
- "이미지가 너무 작습니다."
- "이미지가 너무 큽니다."
- "이미지 파일이 손상되었습니다."

## 보안 고려사항

1. **파일 형식 검증**: 서버에서 파일 확장자와 MIME 타입 검증
2. **파일 크기 제한**: 업로드 파일 크기 제한
3. **권한 검증**: 가게별 권한 확인
4. **임시 파일 관리**: 업로드 실패 시 임시 파일 자동 삭제
5. **정기 정리**: 24시간 이상 된 임시 파일 자동 삭제

## 성능 최적화

1. **이미지 압축**: 자동 이미지 압축으로 저장 공간 절약
2. **다양한 크기**: 용도별 이미지 크기 자동 생성
3. **프로그레시브 JPEG**: 웹 최적화된 이미지 형식
4. **캐싱**: 정적 파일 서빙으로 빠른 로딩

## 모니터링

- 업로드 성공/실패 로그
- 파일 크기 및 형식 통계
- 저장 공간 사용량 모니터링
- 에러율 추적 