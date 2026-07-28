/**
 * CropCardGenProvider — the free default card image.
 *
 * Crops the private photo to the recognized subject (the bounding box Vision
 * already returned for free), squares + downsizes it to 1024px, and returns a
 * LOCAL file:// URI. No network, no API key, no cost. Uploading that file to
 * public storage is the community layer's job; the original photo never leaves
 * the device except as this processed crop.
 *
 * If there is no subject box, it centre-crops the whole photo. Any failure throws
 * so the pipeline can fall back to the emoji placeholder.
 */
import * as ImageManipulator from 'expo-image-manipulator';
// Legacy FS API (SDK 54 moved copy/makeDirectory to the /legacy entrypoint).
import * as FileSystem from 'expo-file-system/legacy';

import type { CardMetadata, RecognitionResult } from '@/domain/types';
import type { CardImageGenerationProvider } from '../interfaces';
import { computeCropRect } from './cropRect';

const OUTPUT_SIZE = 1024;
const JPEG_QUALITY = 0.8;

/**
 * ImageManipulator writes into the CACHE directory, which the OS can evict — so a
 * persisted collection card would later show a broken image. Copy the crop into
 * the document directory (durable) and return that path instead.
 */
const CARD_DIR = `${FileSystem.documentDirectory ?? ''}cards/`;

async function persistCrop(uri: string): Promise<string> {
  if (FileSystem.documentDirectory === null || FileSystem.documentDirectory === undefined) {
    return uri; // no document dir (e.g. web) — keep the original uri
  }
  try {
    await FileSystem.makeDirectoryAsync(CARD_DIR, { intermediates: true });
  } catch {
    // directory already exists — fine
  }
  const name = uri.split('/').pop() ?? `card-${uri.length}.jpg`;
  const dest = `${CARD_DIR}${name}`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

export class CropCardGenProvider implements CardImageGenerationProvider {
  async generateCard(
    _meta: CardMetadata,
    recognition: RecognitionResult,
    imageUri: string,
  ): Promise<{ publicImageUri: string }> {
    // A no-op manipulate returns the real pixel dimensions.
    const probe = await ImageManipulator.manipulateAsync(imageUri, []);
    const crop = computeCropRect(recognition.subjectBox, probe.width, probe.height);

    const result = await ImageManipulator.manipulateAsync(
      imageUri,
      [
        { crop },
        { resize: { width: OUTPUT_SIZE, height: OUTPUT_SIZE } },
      ],
      { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
    );

    // Move it out of the cache so the collection thumbnail survives app restarts.
    const publicImageUri = await persistCrop(result.uri);
    return { publicImageUri };
  }
}
