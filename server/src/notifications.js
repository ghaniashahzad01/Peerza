import { Notification } from './models.js';

export async function notifyUser(io, input) {
  const notification = await Notification.create(input);
  await notification.populate('actor', 'name avatar');
  io?.to(`user:${String(input.user)}`).emit('notification:new', notification);
  return notification;
}
