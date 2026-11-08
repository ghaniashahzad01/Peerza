import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const experienceSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 100 },
  organization: { type: String, required: true, trim: true, maxlength: 100 },
  duration: { type: String, required: true, trim: true, maxlength: 80 },
  description: { type: String, default: '', maxlength: 500 }
}, { timestamps: true });

const certificateSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  issuer: { type: String, default: '', trim: true, maxlength: 100 },
  skill: { type: String, default: '', trim: true, maxlength: 80 },
  fileUrl: { type: String, required: true },
  fileName: { type: String, default: 'certificate' },
  fileType: { type: String, default: 'application/pdf' },
  fileSize: { type: Number },
  fileRef: { type: Schema.Types.ObjectId, ref: 'CertificateFile' }
}, { timestamps: true });

const certificateFileSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, default: 'Certificate' },
  data: { type: Buffer, required: true },
  contentType: { type: String, required: true },
  filename: { type: String, default: 'certificate' },
  size: { type: Number, required: true }
}, { timestamps: true });

const userSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  bio: { type: String, default: '', maxlength: 500 },
  avatar: { type: String, default: '', maxlength: 500 },
  avatarImage: { type: Schema.Types.ObjectId, ref: 'ProfileImage' },
  location: { type: String, default: '', maxlength: 100 },
  interests: [{ type: String, maxlength: 80 }],
  isDemo: { type: Boolean, default: false, index: true },
  experience: [experienceSchema],
  certificates: [certificateSchema]
}, { timestamps: true });

const profileImageSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  data: { type: Buffer, required: true },
  contentType: { type: String, required: true },
  mimeType: { type: String },
  filename: { type: String, default: 'profile-picture' },
  size: { type: Number, required: true }
}, { timestamps: true });

profileImageSchema.pre('validate', function (next) {
  if (this.userId && !this.user) this.user = this.userId;
  if (this.user && !this.userId) this.userId = this.user;
  if (this.contentType && !this.mimeType) this.mimeType = this.contentType;
  if (this.mimeType && !this.contentType) this.contentType = this.mimeType;
  next();
});

const skillSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, trim: true, maxlength: 60 },
  category: { type: String, default: 'Other', maxlength: 80 },
  type: { type: String, enum: ['teach', 'learn'], required: true }
}, { timestamps: true });

const conversationSchema = new Schema({
  participants: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
  lastMessage: { type: Schema.Types.ObjectId, ref: 'Message' },
  lastMessageAt: { type: Date, default: Date.now }
}, { timestamps: true });
conversationSchema.index({ participants: 1 });

// Helper to get or create a deterministic one-to-one conversation
conversationSchema.statics.getOrCreateForUsers = async function (userA, userB) {
  const sortedIds = [String(userA), String(userB)].sort();
  let conversation = await this.findOne({
    participants: { $all: sortedIds, $size: 2 }
  });
  if (!conversation) {
    try {
      conversation = await this.create({
        participants: sortedIds,
        lastMessageAt: new Date()
      });
    } catch {
      // In case of race conditions, re-query
      conversation = await this.findOne({
        participants: { $all: sortedIds, $size: 2 }
      });
    }
  }
  return conversation;
};

const messageSchema = new Schema({
  conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', index: true },
  sender: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  receiver: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  content: { type: String, required: true, maxlength: 2000 },
  text: { type: String, maxlength: 2000 },
  status: { type: String, enum: ['sent', 'delivered', 'read'], default: 'sent', index: true },
  deliveredAt: { type: Date },
  readAt: { type: Date }
}, { timestamps: true });

messageSchema.pre('validate', function (next) {
  if (this.content && !this.text) this.text = this.content;
  if (this.text && !this.content) this.content = this.text;
  next();
});

messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });

const meetingSchema = new Schema({
  requester: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  proposedAt: { type: Date, required: true },
  note: { type: String, default: '', maxlength: 500 },
  status: { type: String, enum: ['pending', 'accepted', 'rejected', 'completed'], default: 'pending' },
  roomName: { type: String, default: null }
}, { timestamps: true });

const reviewSchema = new Schema({
  reviewer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reviewedUser: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  meeting: { type: Schema.Types.ObjectId, ref: 'Meeting' },
  rating: { type: Number, min: 1, max: 5, required: true },
  comment: { type: String, maxlength: 600, default: '' }
}, { timestamps: true });

const notificationSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  actor: { type: Schema.Types.ObjectId, ref: 'User' },
  type: { type: String, enum: ['message', 'session', 'session_update', 'review'], required: true },
  title: { type: String, required: true, maxlength: 100 },
  body: { type: String, default: '', maxlength: 240 },
  link: { type: String, default: 'messages' },
  entityId: { type: Schema.Types.ObjectId },
  readAt: Date
}, { timestamps: true });

export const User = model('User', userSchema);
export const UserSkill = model('UserSkill', skillSchema);
export const Conversation = model('Conversation', conversationSchema);
export const Message = model('Message', messageSchema);
export const Meeting = model('Meeting', meetingSchema);
export const Review = model('Review', reviewSchema);
export const Notification = model('Notification', notificationSchema);
export const ProfileImage = model('ProfileImage', profileImageSchema);
export const CertificateFile = model('CertificateFile', certificateFileSchema);
