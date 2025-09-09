import { Component, Input, Output, EventEmitter, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ImageUploadService, ImageUploadConfig, ImageUploadResult, ImageUploadProgress } from '../../services/image-upload.service';
import { Subscription } from 'rxjs';

export interface ImageUploadEvent {
  type: 'success' | 'error' | 'progress';
  result?: ImageUploadResult;
  error?: string;
  progress?: number;
}

@Component({
  selector: 'app-image-upload',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './image-upload.component.html',
  styleUrl: './image-upload.component.scss'
})
export class ImageUploadComponent {
  private imageUploadService = inject(ImageUploadService);
  private uploadSubscription?: Subscription;

  @Input() config: ImageUploadConfig = {};
  @Input() existingImageUrl?: string;
  @Input() placeholder: string = 'Drop image here or click to upload';
  @Input() disabled: boolean = false;

  @Output() uploadEvent = new EventEmitter<ImageUploadEvent>();
  @Output() deleteEvent = new EventEmitter<void>();

  // Component state
  isDragOver = signal(false);
  isUploading = signal(false);
  uploadProgress = signal(0);
  previewUrl = signal<string | null>(null);
  errorMessage = signal<string | null>(null);
  currentResult = signal<ImageUploadResult | null>(null);

  ngOnInit() {
    if (this.existingImageUrl) {
      this.previewUrl.set(this.existingImageUrl);
    }
  }

  ngOnDestroy() {
    this.cleanupUpload();
  }

  // Drag and drop handlers
  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!this.disabled) {
      this.isDragOver.set(true);
    }
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);

    if (this.disabled) return;

    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length > 0) {
      this.handleFileSelection(files[0]);
    }
  }

  // File input handler
  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFileSelection(input.files[0]);
    }
  }

  // Handle file selection and upload
  private handleFileSelection(file: File) {
    this.cleanupUpload();
    this.errorMessage.set(null);

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      this.previewUrl.set(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Start upload
    this.isUploading.set(true);
    this.uploadProgress.set(0);

    this.uploadSubscription = this.imageUploadService.uploadImage(file, this.config)
      .subscribe({
        next: ({ result, progress }) => {
          if (progress) {
            this.handleUploadProgress(progress);
          }
          if (result) {
            this.handleUploadSuccess(result);
          }
        },
        error: (error) => {
          this.handleUploadError(error.message);
        }
      });
  }

  private handleUploadProgress(progress: ImageUploadProgress) {
    this.uploadProgress.set(Math.round(progress.progress));
    this.uploadEvent.emit({
      type: 'progress',
      progress: progress.progress
    });
  }

  private handleUploadSuccess(result: ImageUploadResult) {
    this.isUploading.set(false);
    this.currentResult.set(result);
    this.uploadEvent.emit({
      type: 'success',
      result: result
    });
  }

  private handleUploadError(error: string) {
    this.isUploading.set(false);
    this.errorMessage.set(error);
    this.previewUrl.set(this.existingImageUrl || null);
    this.uploadEvent.emit({
      type: 'error',
      error: error
    });
  }

  // Remove uploaded image
  onRemoveImage() {
    if (this.disabled) return;

    const result = this.currentResult();
    if (result) {
      // Delete from storage
      this.imageUploadService.deleteImage(result.path).subscribe({
        next: () => {
          this.resetComponent();
          this.deleteEvent.emit();
        },
        error: (error) => {
          console.error('Failed to delete image:', error);
          // Still reset the component even if deletion fails
          this.resetComponent();
          this.deleteEvent.emit();
        }
      });
    } else {
      this.resetComponent();
      this.deleteEvent.emit();
    }
  }

  // Reset component state
  private resetComponent() {
    this.previewUrl.set(null);
    this.currentResult.set(null);
    this.errorMessage.set(null);
    this.uploadProgress.set(0);
    this.cleanupUpload();
  }

  // Cleanup upload subscription
  private cleanupUpload() {
    if (this.uploadSubscription) {
      this.uploadSubscription.unsubscribe();
      this.uploadSubscription = undefined;
    }
  }

  // Click handler for upload area
  onUploadAreaClick() {
    if (this.disabled || this.isUploading()) return;
    
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = this.config.allowedTypes?.join(',') || 'image/*';
    fileInput.onchange = (e) => this.onFileSelected(e);
    fileInput.click();
  }

  // Helper method to format file size
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}