'use client';

import {
  generateReactHelpers,
  generateUploadButton,
  generateUploadDropzone,
} from '@uploadthing/react';
import type { UploadRouter } from './server';

/**
 * Client-side helpers, typed against our server router so prop autocomplete
 * works (endpoint names, mime restrictions, file size).
 */
export const { useUploadThing, uploadFiles } = generateReactHelpers<UploadRouter>();
export const UploadButton = generateUploadButton<UploadRouter>();
export const UploadDropzone = generateUploadDropzone<UploadRouter>();
