// 등록하는 사진을 canvas로 리사이즈/압축해서 IndexedDB 저장 용량과
// 구형 iPad Safari의 배경 렌더링 부담을 줄인다.
// iPad Pro 1세대 화면 해상도(9.7형 2048px / 12.9형 2732px 가로)를 감안해
// 긴 변 기준 2048px까지는 유지 — 화면을 가득 채워도(contain) 흐려 보이지 않는 선에서
// 용량/메모리 부담이 커지지 않는 값으로 잡음.
const MAX_DIMENSION = 2048
const JPEG_QUALITY = 0.82

export function resizeImageFile(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      const { width, height } = img
      const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height))
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
        JPEG_QUALITY,
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('이미지를 불러올 수 없습니다.'))
    }

    img.src = objectUrl
  })
}
