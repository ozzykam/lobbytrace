import { Injectable, inject } from '@angular/core';
import { Storage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from '@angular/fire/storage';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

export interface ImageUploadResult {
  url: string;
  path: string;
  fileName: string;
  size: number;
}

export interface ImageUploadProgress {
  progress: number;
  bytesTransferred: number;
  totalBytes: number;
  state: 'running' | 'paused' | 'success' | 'canceled' | 'error';
}

export interface ImageUploadConfig {
  maxSizeInMB?: number;
  allowedTypes?: string[];
  folder?: string;
  generateFileName?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ImageUploadService {
  private storage = inject(Storage);

  private readonly defaultConfig: Required<ImageUploadConfig> = {
    maxSizeInMB: 5,
    allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    folder: 'uploads',
    generateFileName: true
  };

  /**
   * Upload an image file to Firebase Storage
   */
  uploadImage(
    file: File, 
    config: ImageUploadConfig = {}
  ): Observable<{ result?: ImageUploadResult; progress?: ImageUploadProgress }> {
    const finalConfig = { ...this.defaultConfig, ...config };

    return new Observable(observer => {
      // Validate file
      const validationError = this.validateFile(file, finalConfig);
      if (validationError) {
        observer.error(new Error(validationError));
        return;
      }

      // Generate file path
      const fileName = finalConfig.generateFileName 
        ? this.generateFileName(file)
        : file.name;
      const filePath = `${finalConfig.folder}/${fileName}`;
      const fileRef = ref(this.storage, filePath);

      // Start upload
      const uploadTask = uploadBytesResumable(fileRef, file);

      // Monitor upload progress
      uploadTask.on('state_changed',
        (snapshot) => {
          const progress: ImageUploadProgress = {
            progress: (snapshot.bytesTransferred / snapshot.totalBytes) * 100,
            bytesTransferred: snapshot.bytesTransferred,
            totalBytes: snapshot.totalBytes,
            state: snapshot.state as any
          };
          observer.next({ progress });
        },
        (error) => {
          observer.error(this.handleUploadError(error));
        },
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            const result: ImageUploadResult = {
              url: downloadURL,
              path: filePath,
              fileName: fileName,
              size: file.size
            };
            observer.next({ result });
            observer.complete();
          } catch (error) {
            observer.error(this.handleUploadError(error));
          }
        }
      );

      // Return unsubscribe function
      return () => {
        uploadTask.cancel();
      };
    });
  }

  /**
   * Delete an image from Firebase Storage
   */
  deleteImage(path: string): Observable<void> {
    const fileRef = ref(this.storage, path);
    return from(deleteObject(fileRef)).pipe(
      catchError(error => throwError(() => this.handleUploadError(error)))
    );
  }

  /**
   * Validate uploaded file
   */
  private validateFile(file: File, config: Required<ImageUploadConfig>): string | null {
    // Check file type
    if (!config.allowedTypes.includes(file.type)) {
      return `Invalid file type. Allowed types: ${config.allowedTypes.join(', ')}`;
    }

    // Check file size
    const maxSizeInBytes = config.maxSizeInMB * 1024 * 1024;
    if (file.size > maxSizeInBytes) {
      return `File too large. Maximum size: ${config.maxSizeInMB}MB`;
    }

    return null;
  }

  /**
   * Generate unique filename
   */
  private generateFileName(file: File): string {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 8);
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    return `${timestamp}_${randomString}.${extension}`;
  }

  /**
   * Handle upload errors
   */
  private handleUploadError(error: any): Error {
    console.error('Upload error:', error);
    
    if (error.code) {
      switch (error.code) {
        case 'storage/unauthorized':
          return new Error('Unauthorized. Please check your permissions.');
        case 'storage/canceled':
          return new Error('Upload canceled.');
        case 'storage/quota-exceeded':
          return new Error('Storage quota exceeded.');
        case 'storage/invalid-format':
          return new Error('Invalid file format.');
        case 'storage/invalid-url':
          return new Error('Invalid file URL.');
        default:
          return new Error(`Upload failed: ${error.message}`);
      }
    }

    return new Error(error.message || 'Upload failed. Please try again.');
  }

  /**
   * Resize image before upload (optional utility)
   */
  resizeImage(file: File, maxWidth: number, maxHeight: number, quality: number = 0.8): Promise<File> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        // Calculate new dimensions
        let { width, height } = img;
        
        if (width > height) {
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
          }
        }

        // Set canvas dimensions
        canvas.width = width;
        canvas.height = height;

        // Draw and compress
        ctx?.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const resizedFile = new File([blob], file.name, {
                type: file.type,
                lastModified: Date.now()
              });
              resolve(resizedFile);
            } else {
              reject(new Error('Failed to resize image'));
            }
          },
          file.type,
          quality
        );
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  }
}