import multer from 'multer';
import { CertificateFile, User } from './models.js';

export const MAX_CERTIFICATE_SIZE = 4 * 1024 * 1024; // 4 MB

/**
 * Validates certificate file content using magic byte signatures.
 * Supported:
 * - PDF: %PDF (25 50 44 46)
 * - JPEG: FF D8 FF
 * - PNG: 89 50 4E 47 0D 0A 1A 0A
 */
export function detectCertificateMime(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 4) return null;

  // PDF: %PDF
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'application/pdf';
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
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

  return null;
}

const certUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CERTIFICATE_SIZE },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowed.includes((file.mimetype || '').toLowerCase())) {
      const err = new Error('Unsupported file type. Only PDF, JPG, and PNG certificate files are allowed.');
      err.status = 400;
      return cb(err);
    }
    cb(null, true);
  }
});

export const handleCertificateUpload = (req, res, next) => {
  const uploader = certUpload.fields([
    { name: 'certificate', maxCount: 1 },
    { name: 'file', maxCount: 1 }
  ]);

  uploader(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          message: 'Certificate file exceeds 4 MB limit. Please choose a smaller document.'
        });
      }
      return res.status(err.status || 400).json({
        message: err.message || 'Certificate upload failed.'
      });
    }

    const uploaded = req.files?.certificate?.[0] || req.files?.file?.[0] || req.file;
    if (uploaded) {
      req.file = uploaded;
    }
    next();
  });
};

export async function addCertificate(req, res, next) {
  try {
    const title = (req.body.title || '').trim();
    const issuer = (req.body.issuer || '').trim();
    const skill = (req.body.skill || '').trim();

    if (!title) {
      return res.status(400).json({ message: 'Certificate title is required.' });
    }

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ message: 'Please select a certificate file (PDF, JPG, or PNG).' });
    }

    if (req.file.buffer.length > MAX_CERTIFICATE_SIZE) {
      return res.status(400).json({ message: 'Certificate file exceeds 4 MB limit.' });
    }

    const detectedMime = detectCertificateMime(req.file.buffer);
    if (!detectedMime) {
      return res.status(400).json({
        message: 'Invalid certificate format. Only valid PDF, JPG, and PNG files are supported.'
      });
    }

    const fileDoc = await CertificateFile.create({
      userId: req.user._id,
      title,
      data: req.file.buffer,
      contentType: detectedMime,
      filename: req.file.originalname || `certificate-${Date.now()}`,
      size: req.file.buffer.length
    });

    const fileUrl = `/api/profile/certificates/${fileDoc._id}/file`;

    const certEntry = {
      title,
      issuer,
      skill,
      fileUrl,
      fileName: req.file.originalname || 'certificate',
      fileType: detectedMime,
      fileSize: req.file.buffer.length,
      fileRef: fileDoc._id
    };

    req.user.certificates.push(certEntry);
    await req.user.save();

    const createdCert = req.user.certificates[req.user.certificates.length - 1];

    return res.status(201).json({
      message: 'Certificate added successfully.',
      certificate: createdCert,
      user: {
        id: req.user.id || req.user._id,
        name: req.user.name,
        email: req.user.email,
        bio: req.user.bio,
        avatar: req.user.avatar,
        location: req.user.location,
        interests: req.user.interests,
        experience: req.user.experience,
        certificates: req.user.certificates,
        evidenceComplete: Boolean(
          (req.user.experience && req.user.experience.length) ||
          (req.user.certificates && req.user.certificates.length)
        )
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteCertificate(req, res, next) {
  try {
    const certId = req.params.id;
    const certIndex = req.user.certificates.findIndex(
      (c) => String(c._id) === String(certId) || String(c.fileRef) === String(certId)
    );

    if (certIndex === -1) {
      return res.status(404).json({ message: 'Certificate not found.' });
    }

    const cert = req.user.certificates[certIndex];
    if (cert.fileRef) {
      await CertificateFile.deleteOne({ _id: cert.fileRef });
    }

    req.user.certificates.splice(certIndex, 1);
    await req.user.save();

    return res.status(200).json({
      message: 'Certificate removed successfully.',
      user: {
        id: req.user.id || req.user._id,
        name: req.user.name,
        email: req.user.email,
        bio: req.user.bio,
        avatar: req.user.avatar,
        location: req.user.location,
        interests: req.user.interests,
        experience: req.user.experience,
        certificates: req.user.certificates,
        evidenceComplete: Boolean(
          (req.user.experience && req.user.experience.length) ||
          (req.user.certificates && req.user.certificates.length)
        )
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function serveCertificate(fileId, res, next) {
  try {
    if (!fileId) {
      return res.status(400).json({ message: 'Invalid certificate ID.' });
    }

    let fileDoc = null;
    try {
      fileDoc = await CertificateFile.findById(fileId);
    } catch {
      // not a direct CertificateFile id
    }

    if (!fileDoc) {
      try {
        const userWithCert = await User.findOne({ 'certificates._id': fileId });
        const cert = userWithCert?.certificates?.id(fileId);
        if (cert?.fileRef) {
          fileDoc = await CertificateFile.findById(cert.fileRef);
        }
      } catch {
        // ignore
      }
    }

    if (!fileDoc || !fileDoc.data) {
      return res.status(404).json({ message: 'Certificate document not found.' });
    }

    res.set({
      'Content-Type': fileDoc.contentType || 'application/pdf',
      'Content-Length': fileDoc.size || fileDoc.data.length,
      'Content-Disposition': `inline; filename="${encodeURIComponent(fileDoc.filename || 'certificate')}"`,
      'Cache-Control': 'public, max-age=86400, must-revalidate'
    });

    return res.status(200).send(fileDoc.data);
  } catch (err) {
    next(err);
  }
}
