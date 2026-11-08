import multer from 'multer';
import { User, ProfileImage } from './models.js';

export const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2 MB

/**
 * Validates actual binary file content using magic byte signatures.
 * Supported:
 * - JPEG: FF D8 FF
 * - PNG: 89 50 4E 47 0D 0A 1A 0A
 * - WEBP: RIFF....WEBP
 */
export function detectImageMime(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // WEBP: RIFF (bytes 0-3) + file size (bytes 4-7) + WEBP (bytes 8-11)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

// Multer memory storage configuration with 2 MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_AVATAR_SIZE
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!allowed.includes((file.mimetype || '').toLowerCase())) {
      const err = new Error('Unsupported file type. Only JPG, PNG, and WEBP images are allowed.');
      err.status = 400;
      return cb(err);
    }
    cb(null, true);
  }
});

// Middleware supporting field names 'avatar', 'image', 'photo', and 'file'
export function handleAvatarUpload(req, res, next) {
  const uploader = upload.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'image', maxCount: 1 },
    { name: 'photo', maxCount: 1 },
    { name: 'file', maxCount: 1 }
  ]);

  uploader(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          message: 'File size exceeds 2 MB limit. Please select an image under 2 MB.'
        });
      }
      return res.status(err.status || 400).json({
        message: err.message || 'File upload failed.'
      });
    }

    const uploadedFile =
      req.files?.avatar?.[0] ||
      req.files?.image?.[0] ||
      req.files?.photo?.[0] ||
      req.files?.file?.[0] ||
      req.file;

    if (uploadedFile) {
      req.file = uploadedFile;
    }

    next();
  });
}

/**
 * Saves or replaces profile picture in MongoDB ProfileImage collection.
 */
export async function saveOrUpdateAvatar(req, res, next) {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        message: 'No image file uploaded. Please choose an image file (JPG, PNG, or WEBP).'
      });
    }

    if (req.file.buffer.length > MAX_AVATAR_SIZE) {
      return res.status(400).json({
        message: 'File size exceeds 2 MB limit. Please select an image under 2 MB.'
      });
    }

    const detectedMime = detectImageMime(req.file.buffer);
    if (!detectedMime) {
      return res.status(400).json({
        message: 'Invalid file content: only JPG, PNG, and WEBP image files are allowed.'
      });
    }

    const targetUser = req.user;
    if (!targetUser) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    // Upsert the profile image document in MongoDB
    const imageDoc = await ProfileImage.findOneAndUpdate(
      { userId: targetUser._id },
      {
        userId: targetUser._id,
        user: targetUser._id,
        data: req.file.buffer,
        contentType: detectedMime,
        mimeType: detectedMime,
        filename: req.file.originalname || `avatar-${targetUser._id}`,
        size: req.file.buffer.length
      },
      { new: true, upsert: true }
    );

    // Save avatar URL reference in User document with cache busting timestamp
    const avatarUrl = `/api/users/${targetUser._id}/avatar?t=${Date.now()}`;
    targetUser.avatarImage = imageDoc._id;
    targetUser.avatar = avatarUrl;
    await targetUser.save();

    return res.status(200).json({
      message: 'Profile picture updated successfully.',
      avatarUrl,
      user: {
        id: targetUser.id || targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        bio: targetUser.bio,
        avatar: targetUser.avatar,
        location: targetUser.location,
        interests: targetUser.interests
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Removes profile picture from MongoDB and clears user avatar reference.
 */
export async function deleteAvatar(req, res, next) {
  try {
    const targetUser = req.user;
    if (!targetUser) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    await ProfileImage.deleteOne({
      $or: [{ userId: targetUser._id }, { user: targetUser._id }]
    });

    targetUser.avatar = '';
    targetUser.avatarImage = null;
    await targetUser.save();

    return res.status(200).json({
      message: 'Profile picture removed successfully.',
      user: {
        id: targetUser.id || targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        bio: targetUser.bio,
        avatar: '',
        location: targetUser.location,
        interests: targetUser.interests
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Serves the binary image buffer from MongoDB with appropriate Content-Type and caching headers.
 */
export async function serveAvatar(userId, res, next) {
  try {
    if (!userId) {
      return res.status(400).json({ message: 'Invalid user ID.' });
    }

    const imageDoc = await ProfileImage.findOne({
      $or: [{ userId }, { user: userId }]
    });

    if (!imageDoc || !imageDoc.data) {
      return res.status(404).json({ message: 'Profile picture not found.' });
    }

    const contentType = imageDoc.contentType || imageDoc.mimeType || 'image/jpeg';
    const timestamp = imageDoc.updatedAt ? new Date(imageDoc.updatedAt).getTime() : Date.now();

    res.set({
      'Content-Type': contentType,
      'Content-Length': imageDoc.size || imageDoc.data.length,
      'Cache-Control': 'public, max-age=86400, must-revalidate',
      'ETag': `"${imageDoc._id}-${timestamp}"`
    });

    return res.status(200).send(imageDoc.data);
  } catch (err) {
    next(err);
  }
}
