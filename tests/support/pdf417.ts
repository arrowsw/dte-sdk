import { BinaryBitmap, HybridBinarizer, PDF417Reader, RGBLuminanceSource } from '@zxing/library'
import { PNG } from 'pngjs'

export type Luminance = { readonly width: number; readonly height: number; readonly luminance: Uint8ClampedArray }

/** Greyscale of RGBA pixels composited over white, which is how a transparent PNG prints. */
export const luminanceOf = (rgba: Uint8Array, width: number, height: number, alpha: Uint8Array | null): Luminance => {
  const luminance = new Uint8ClampedArray(width * height)
  for (let index = 0; index < luminance.length; index += 1) {
    const opacity = alpha ? alpha[index] / 255 : rgba.length === luminance.length * 4 ? rgba[index * 4 + 3] / 255 : 1
    const channels = rgba.length === luminance.length ? 1 : rgba.length === luminance.length * 3 ? 3 : 4
    const grey =
      channels === 1
        ? rgba[index]
        : (rgba[index * channels] + rgba[index * channels + 1] + rgba[index * channels + 2]) / 3
    luminance[index] = Math.round(grey * opacity + 255 * (1 - opacity))
  }
  return { width, height, luminance }
}

export const pngLuminance = (png: Uint8Array): Luminance => {
  const image = PNG.sync.read(Buffer.from(png))
  return luminanceOf(new Uint8Array(image.data), image.width, image.height, null)
}

/** Decodes a PDF417 symbol with an independent reader; throws when none is found. */
export const decodePdf417 = ({ width, height, luminance }: Luminance): string =>
  new PDF417Reader()
    .decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminance, width, height))))
    .getText()

export const decodePdf417Png = (png: Uint8Array): string => decodePdf417(pngLuminance(png))
