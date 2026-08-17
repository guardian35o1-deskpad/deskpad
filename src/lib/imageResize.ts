// 등록하는 사진을 canvas로 리사이즈/압축해서 IndexedDB 저장 용량과
// 구형 iPad Safari의 배경 렌더링 부담을 줄인다.
// iPad Pro 1세대 화면 해상도(9.7형 2048px / 12.9형 2732px 가로)를 감안해
// 긴 변 기준 2048px까지는 유지 — 화면을 가득 채워도(contain) 흐려 보이지 않는 선에서
// 용량/메모리 부담이 커지지 않는 값으로 잡음.
const MAX_DIMENSION = 2048
const JPEG_QUALITY = 0.82

// 사진 관리 화면(그리드)에서만 쓰는 작은 미리보기용 썸네일. 액자에 실제로 쓰는 이미지
// (위 MAX_DIMENSION, 2048px)를 그리드에 수십 장 그대로 띄우면 구형 iPad에서 메모리
// 부담이 크므로, 훨씬 작은 사본을 하나 더 만들어 별도로 저장해둔다.
const THUMBNAIL_MAX_DIMENSION = 320
const THUMBNAIL_JPEG_QUALITY = 0.7

function resizeToBlob(source: File | Blob, maxDimension: number, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(source)
    const img = new Image()

    img.onload = () => {
      const { width, height } = img
      const scale = Math.min(1, maxDimension / Math.max(width, height))
      const targetWidth = Math.round(width * scale)
      const targetHeight = Math.round(height * scale)

      const canvas = document.createElement('canvas')
      canvas.width = targetWidth
      canvas.height = targetHeight

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(objectUrl)
        reject(new Error('이미지를 처리할 수 없습니다.'))
        return
      }

      ctx.drawImage(img, 0, 0, targetWidth, targetHeight)
      URL.revokeObjectURL(objectUrl)

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('이미지 변환에 실패했습니다.'))
          }
        },
        'image/jpeg',
        quality,
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('이미지를 불러올 수 없습니다.'))
    }

    img.src = objectUrl
  })
}

export function resizeImageFile(file: File): Promise<Blob> {
  return resizeToBlob(file, MAX_DIMENSION, JPEG_QUALITY)
}

// 썸네일은 원본 File이 아니라 이미 리사이즈된 메인 이미지(resizeImageFile의 결과)를
// 입력으로 받는 걸 전제로 한다 — 큰 원본 파일을 두 번 디코딩하지 않기 위한 성능 최적화.
export function createThumbnail(resizedBlob: Blob): Promise<Blob> {
  return resizeToBlob(resizedBlob, THUMBNAIL_MAX_DIMENSION, THUMBNAIL_JPEG_QUALITY)
}
