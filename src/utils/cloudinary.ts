import { v2 as cloudinary, UploadApiOptions } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

// Configure Cloudinary via environment variables
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer storage configured for event images
export const storage = new CloudinaryStorage({
    cloudinary,
    params: (_req, _file): UploadApiOptions => ({
        folder: 'qlbx/events',
        transformation: [
            { quality: 'auto', fetch_format: 'auto' },
            { width: 1920, height: 1080, crop: 'fill', gravity: 'auto' }
        ],
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        public_id: `event-${Date.now()}`,
        resource_type: 'image'
    }),
});

export { cloudinary };

export async function uploadBufferToCloudinary(buffer: Buffer, options: UploadApiOptions = {}): Promise<string> {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            { resource_type: 'image', ...options },
            (error, result) => {
                if (error || !result) {
                    return reject(error || new Error('Cloudinary upload failed'));
                }
                resolve(result.secure_url);
            }
        );
        uploadStream.end(buffer);
    });
}

export async function uploadMultipleBuffersToCloudinary(buffers: Buffer[], options: UploadApiOptions = {}): Promise<string[]> {
    const limited = buffers.slice(0, 3);
    const urls: string[] = [];
    for (const buf of limited) {
        const url = await uploadBufferToCloudinary(buf, options);
        urls.push(url);
    }
    return urls;
}