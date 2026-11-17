export function canCopyImage(): boolean {
  return typeof ClipboardItem !== 'undefined' && typeof navigator !== 'undefined'
    && typeof navigator.clipboard?.write === 'function'
}

/** Export only an already-decrypted local image. GIFs become a still PNG frame. */
export function copyImageToClipboard(url: string): Promise<void> {
  if (!canCopyImage() || !url.startsWith('blob:')) return Promise.reject(new Error('Image copy unavailable'))
  const png = new Promise<Blob>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      image.onload = image.onerror = null
      try {
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Image conversion unavailable')
        context.drawImage(image, 0, 0)
        canvas.toBlob(blob => {
          canvas.width = canvas.height = 0
          if (blob) resolve(blob)
          else reject(new Error('Image conversion failed'))
        }, 'image/png')
      } catch (error) {
        reject(error)
      }
    }
    image.onerror = () => {
      image.onload = image.onerror = null
      reject(new Error('Image load failed'))
    }
    image.src = url
  })
  // Keep transient user activation: call write now, not after image decoding.
  // Also consume conversion errors if the browser rejects before reading the item.
  void png.catch(() => {})
  try {
    return navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
  } catch (error) {
    return Promise.reject(error)
  }
}
