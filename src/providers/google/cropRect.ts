/**
 * Pure crop-rectangle math for the card image. Given the subject's normalized
 * box and the photo's pixel size, produce a padded, square, in-bounds pixel crop
 * centred on the subject. No I/O — unit tested.
 */
import type { NormalizedRect } from '@/domain/types';

export interface PixelCrop {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

/** Padding added around the subject box, as a fraction of the box size. */
export const CROP_PADDING = 0.12;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Compute a square pixel crop around `box` (normalized 0..1) within an
 * imgW×imgH photo. Pads by CROP_PADDING, squares to the larger side, and clamps
 * fully inside the image (shrinking the square if needed so it never overflows).
 * When `box` is undefined, returns the largest centred square of the whole photo.
 */
export function computeCropRect(
  box: NormalizedRect | undefined,
  imgW: number,
  imgH: number,
): PixelCrop {
  if (imgW <= 0 || imgH <= 0) return { originX: 0, originY: 0, width: 0, height: 0 };

  if (box === undefined) {
    const side = Math.min(imgW, imgH);
    return {
      originX: Math.round((imgW - side) / 2),
      originY: Math.round((imgH - side) / 2),
      width: side,
      height: side,
    };
  }

  // Subject box in pixels.
  const px = box.x * imgW;
  const py = box.y * imgH;
  const pw = box.w * imgW;
  const ph = box.h * imgH;

  // Pad.
  const padded = {
    x: px - pw * CROP_PADDING,
    y: py - ph * CROP_PADDING,
    w: pw * (1 + CROP_PADDING * 2),
    h: ph * (1 + CROP_PADDING * 2),
  };

  // Square to the larger side, centred on the padded box, capped by the image.
  let side = Math.min(Math.max(padded.w, padded.h), imgW, imgH);
  const cx = padded.x + padded.w / 2;
  const cy = padded.y + padded.h / 2;

  let originX = cx - side / 2;
  let originY = cy - side / 2;

  // Clamp fully inside the image.
  originX = clamp(originX, 0, imgW - side);
  originY = clamp(originY, 0, imgH - side);
  side = Math.min(side, imgW, imgH);

  return {
    originX: Math.round(originX),
    originY: Math.round(originY),
    width: Math.round(side),
    height: Math.round(side),
  };
}
