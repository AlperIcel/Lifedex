/**
 * GoogleVisionProvider — real species recognition via Google Cloud Vision.
 *
 * Reads the captured photo as base64, asks Vision for labels + objects + web
 * detection, and maps the response to a RecognitionResult (see visionMapping.ts).
 * Only wired in when AI_PROVIDER=google AND a key is present (see getProviders);
 * otherwise the app stays on the mock provider. The mock-mode `hint` arg is
 * ignored — a real provider derives the species from the image itself.
 *
 * Cost note: each call is one Vision API unit. Google's free tier covers ~1000
 * units/month; beyond that it bills. Keep this provider off until you opt in.
 */
import * as FileSystem from 'expo-file-system';

import type { RecognitionResult } from '@/domain/types';
import type { VisionRecognitionProvider } from '../interfaces';
import { mapVisionResponse, type VisionAnnotateResponse } from './visionMapping';

const ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';

export class GoogleVisionProvider implements VisionRecognitionProvider {
  constructor(private readonly apiKey: string) {}

  async recognize(imageUri: string): Promise<RecognitionResult> {
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const body = {
      requests: [
        {
          image: { content: base64 },
          features: [
            { type: 'LABEL_DETECTION', maxResults: 10 },
            { type: 'OBJECT_LOCALIZATION', maxResults: 5 },
            { type: 'WEB_DETECTION', maxResults: 5 },
          ],
        },
      ],
    };

    const resp = await fetch(`${ENDPOINT}?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      throw new Error(`Google Vision API error ${resp.status}`);
    }

    const json = (await resp.json()) as { responses?: VisionAnnotateResponse[] };
    const first: VisionAnnotateResponse = json.responses?.[0] ?? {};
    return mapVisionResponse(first);
  }
}
