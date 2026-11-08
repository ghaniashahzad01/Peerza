import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Award,
  Briefcase,
  CalendarDays,
  Camera,
  Check,
  CheckCheck,
  Clock3,
  ExternalLink,
  FileText,
  MapPin,
  MessageCircle,
  Pencil,
  Plus,
  Send,
  ShieldCheck,
  Star,
  Trash2,
  Upload,
  UserRound,
  Video,
  X
} from 'lucide-react';
import api from './api';
import { socket } from './realtime.js';
import JitsiMeeting from './JitsiMeeting.jsx';
import { getAvatarUrl, getInitials } from './avatarHelper.js';

const titles = {
  matches: ['Your kind of people', 'Mutual matches, found through the skills you share.'],
  messages: ['Good conversations start here', 'Keep your skill swaps moving, one thoughtful message at a time.'],
  sessions: ['Make room to learn', 'Manage your upcoming sessions and meeting requests.'],
  profile: ['Your learning profile', 'What other learners see when discovering you on Peerza.'],
  'profile-edit': ['Edit your profile', 'Update your photo, personal details, skills, experience, and certificates.']
};

const initials = (user) => getInitials(user?.name);
const userId = (user) => user?._id || user?.id || user;

function Avatar({ user, onClick, style, className = '' }) {
  const [failed, setFailed] = useState(false);
  const src = !failed ? getAvatarUrl(user?.avatar) : null;
  return (
    <span
      className={`work-avatar ${className}`}
      onClick={onClick}
      style={{ ...style, cursor: onClick ? 'pointer' : undefined }}
    >
      {src ? (
        <img src={src} alt="" onError={() => setFailed(true)} />
      ) : (
        getInitials(user?.name)
      )}
    </span>
  );
}

function Empty({ icon: Icon, title, body, action, onAction }) {
  return (
    <div className="work-empty">
      <span>
        <Icon size={22} />
      </span>
      <h3>{title}</h3>
      <p>{body}</p>
      {action && (
        <button onClick={onAction}>
          {action}
          <ArrowRight size={15} />
        </button>
      )}
    </div>
  );
}

export default function Workspace({
  page,
  auth,
  people,
  notify,
  setPage,
  onAuth,
  onUserUpdated,
  startWith,
  onNotificationRead,
  onlineUsers = [],
  onOpenProfile
}) {
  const [matches, setMatches] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [skills, setSkills] = useState([]);
  const [reviewedMeetings, setReviewedMeetings] = useState([]);
  const [profile, setProfile] = useState(auth || {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Professional Experience State
  const [newExperience, setNewExperience] = useState({
    title: '',
    organization: '',
    duration: '',
    description: ''
  });
  const [savingExp, setSavingExp] = useState(false);
  const [expError, setExpError] = useState('');

  // Certificates State
  const certFileInputRef = useRef(null);
  const [newCert, setNewCert] = useState({ title: '', issuer: '', skill: '' });
  const [certFile, setCertFile] = useState(null);
  const [savingCert, setSavingCert] = useState(false);
  const [certError, setCertError] = useState('');

  // Reviews State
  const [myReviews, setMyReviews] = useState([]);

  // Chat State
  const [thread, setThread] = useState(null);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [typingName, setTypingName] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [messagePage, setMessagePage] = useState(1);
  const typingTimer = useRef(null);
  const messagesEndRef = useRef(null);

  // Forms and Modals
  const [newSkill, setNewSkill] = useState({ name: '', category: 'Design', type: 'teach' });
  const [editingSkill, setEditingSkill] = useState(null);
  const [reviewMeeting, setReviewMeeting] = useState(null);
  const [meetingTarget, setMeetingTarget] = useState(null);
  const [reviewRating, setReviewRating] = useState(5);

  // Jitsi Video Calling State
  const [activeCall, setActiveCall] = useState(null);
  const [callStarting, setCallStarting] = useState(false);

  // Photo Upload State
  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [avatarSuccess, setAvatarSuccess] = useState('');

  // Keep local profile state in sync with auth
  useEffect(() => {
    if (auth) {
      setProfile((prev) => ({ ...prev, ...auth }));
    }
  }, [auth]);

  // Clean up object URL when component unmounts or preview changes
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function handleFileSelected(e) {
    setAvatarError('');
    setAvatarSuccess('');
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!allowed.includes((file.type || '').toLowerCase())) {
      setAvatarError('Only JPG, PNG, and WEBP image files are allowed.');
      e.target.value = '';
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setAvatarError('File exceeds 2 MB limit. Please choose a smaller photo.');
      e.target.value = '';
      return;
    }

    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function handleCancelSelection() {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl('');
    setAvatarError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleUploadAvatar() {
    if (!selectedFile) return;
    setUploadingAvatar(true);
    setAvatarError('');
    setAvatarSuccess('');

    try {
      const formData = new FormData();
      formData.append('avatar', selectedFile);

      const { data } = await api.post('/profile/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setProfile(data.user);
      onUserUpdated(data.user);
      handleCancelSelection();
      setAvatarSuccess('Profile picture updated successfully!');
      notify('Profile picture saved to Peerza.');
    } catch (err) {
      setAvatarError(err.response?.data?.message || 'Could not upload photo. Please try again.');
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleRemoveAvatar() {
    if (selectedFile) {
      handleCancelSelection();
      return;
    }
    if (!profile.avatar) return;

    setUploadingAvatar(true);
    setAvatarError('');
    setAvatarSuccess('');

    try {
      const { data } = await api.delete('/profile/avatar');
      setProfile(data.user);
      onUserUpdated(data.user);
      handleCancelSelection();
      setAvatarSuccess('Profile picture removed.');
      notify('Profile picture removed.');
    } catch (err) {
      setAvatarError(err.response?.data?.message || 'Could not remove photo.');
    } finally {
      setUploadingAvatar(false);
    }
  }

  // Professional Experience Handlers
  async function handleAddExperience(e) {
    e.preventDefault();
    setExpError('');
    if (!newExperience.title.trim() || !newExperience.organization.trim() || !newExperience.duration.trim()) {
      setExpError('Job title, organization, and duration are required.');
      return;
    }
    setSavingExp(true);
    try {
      const { data } = await api.post('/profile/experience', newExperience);
      setProfile((prev) => ({ ...prev, ...data.user }));
      onUserUpdated?.(data.user);
      localStorage.setItem('peerza_user', JSON.stringify(data.user));
      setNewExperience({ title: '', organization: '', duration: '', description: '' });
      notify('Professional experience added.');
    } catch (err) {
      setExpError(err.response?.data?.message || 'Could not add experience.');
    } finally {
      setSavingExp(false);
    }
  }

  async function handleDeleteExperience(id) {
    try {
      const { data } = await api.delete(`/profile/experience/${id}`);
      setProfile((prev) => ({ ...prev, ...data.user }));
      onUserUpdated?.(data.user);
      localStorage.setItem('peerza_user', JSON.stringify(data.user));
      notify('Experience removed.');
    } catch (err) {
      notify(err.response?.data?.message || 'Could not remove experience.');
    }
  }

  // Certificate Handlers
  function handleCertFileSelected(e) {
    setCertError('');
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowed.includes((file.type || '').toLowerCase())) {
      setCertError('Only PDF, JPG, and PNG files are allowed.');
      e.target.value = '';
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      setCertError('File exceeds 4 MB limit.');
      e.target.value = '';
      return;
    }

    setCertFile(file);
  }

  async function handleAddCertificate(e) {
    e.preventDefault();
    setCertError('');
    if (!newCert.title.trim()) {
      setCertError('Certificate title is required.');
      return;
    }
    if (!certFile) {
      setCertError('Please select a certificate document (PDF, JPG, or PNG up to 4 MB).');
      return;
    }

    setSavingCert(true);
    try {
      const formData = new FormData();
      formData.append('title', newCert.title.trim());
      if (newCert.issuer.trim()) formData.append('issuer', newCert.issuer.trim());
      if (newCert.skill.trim()) formData.append('skill', newCert.skill.trim());
      formData.append('certificate', certFile);

      const { data } = await api.post('/profile/certificates', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setProfile((prev) => ({ ...prev, ...data.user }));
      onUserUpdated?.(data.user);
      localStorage.setItem('peerza_user', JSON.stringify(data.user));
      setNewCert({ title: '', issuer: '', skill: '' });
      setCertFile(null);
      if (certFileInputRef.current) certFileInputRef.current.value = '';
      notify('Certificate uploaded successfully.');
    } catch (err) {
      setCertError(err.response?.data?.message || 'Could not upload certificate.');
    } finally {
      setSavingCert(false);
    }
  }

  async function handleDeleteCertificate(id) {
    try {
      const { data } = await api.delete(`/profile/certificates/${id}`);
      setProfile((prev) => ({ ...prev, ...data.user }));
      onUserUpdated?.(data.user);
      localStorage.setItem('peerza_user', JSON.stringify(data.user));
      notify('Certificate removed.');
    } catch (err) {
      notify(err.response?.data?.message || 'Could not remove certificate.');
    }
  }

  const refresh = async () => {
    setBusy(true);
    setError('');
    try {
      if (page === 'matches') {
        const { data } = await api.get('/matches');
        setMatches(data);
      }
      if (page === 'messages') {
        const { data } = await api.get('/conversations');
        setConversations(data);
      }
      if (page === 'sessions') {
        const [{ data }, { data: reviewed }] = await Promise.all([
          api.get('/meetings'),
          api.get('/reviews/mine')
        ]);
        setMeetings(data);
        setReviewedMeetings(reviewed.map((r) => String(r.meeting)));
      }
      if (page === 'profile' || page === 'profile-edit') {
        const [{ data: me }, { data: mySkills }, userRes] = await Promise.all([
          api.get('/auth/me'),
          api.get('/user-skills'),
          auth?.id ? api.get(`/users/${auth.id}`).catch(() => ({ data: {} })) : Promise.resolve({ data: {} })
        ]);
        const fullUser = { ...me.user, ...(userRes?.data || {}) };
        setProfile(fullUser);
        setSkills(mySkills);
        if (userRes?.data?.reviews) {
          setMyReviews(userRes.data.reviews);
        }
      }
    } catch (e) {
      setError(e.response?.data?.message || 'Could not load this page. Check your connection and sign in again.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!auth) {
      setError('Sign in to use this part of Peerza.');
      return;
    }
    refresh();
    if (page === 'messages' && startWith) {
      openThread(startWith);
    }
  }, [page, auth?.id, startWith?.id || startWith?._id]);

  // Socket.IO Chat & Presence Listeners
  useEffect(() => {
    if (!auth) return;

    const activeId = thread ? String(userId(thread)) : '';

    const joinActiveConversation = () => {
      if (activeId) {
        socket.emit('join_conversation', { userId: activeId, conversationId: activeConversationId });
        socket.emit('chat:join', { userId: activeId });
      }
    };

    if (socket.connected) joinActiveConversation();
    socket.on('connect', joinActiveConversation);

    // Incoming new message handler
    const onNewMessage = (payload) => {
      const msg = payload.message || payload;
      const convId = payload.conversationId || msg.conversation;

      const senderId = String(userId(msg.sender));
      const receiverId = String(userId(msg.receiver));

      if (senderId !== String(auth.id) && receiverId !== String(auth.id)) return;

      const otherId = senderId === String(auth.id) ? receiverId : senderId;
      const other = senderId === String(auth.id) ? msg.receiver : msg.sender;
      const isCurrentThread = Boolean(activeId) && activeId === otherId;

      if (isCurrentThread) {
        setMessages((current) => {
          if (current.some((m) => m._id === msg._id)) return current;
          return [...current, msg];
        });

        // Acknowledge delivery & read if current user is receiver
        if (receiverId === String(auth.id)) {
          socket.emit('message_delivered_ack', { messageId: msg._id, conversationId: convId });
          socket.emit('mark_messages_read', { conversationId: convId, senderId: otherId });
          api.patch(`/conversations/${otherId}/read`).catch(() => {});
          onNotificationRead?.(otherId);
        }
      }

      // Update conversation list
      setConversations((items) => {
        const prev = items.find((item) => String(userId(item.user)) === otherId);
        const next = {
          conversationId: convId || prev?.conversationId,
          user: other,
          latestMessage: msg,
          unreadCount: isCurrentThread
            ? 0
            : (prev?.unreadCount || 0) + (receiverId === String(auth.id) ? 1 : 0),
          lastMessageAt: msg.createdAt
        };
        return [next, ...items.filter((item) => String(userId(item.user)) !== otherId)];
      });
    };

    // Message delivery receipt
    const onMessageDelivered = ({ messageId }) => {
      setMessages((items) =>
        items.map((m) =>
          m._id === messageId ? { ...m, status: m.status === 'read' ? 'read' : 'delivered' } : m
        )
      );
    };

    // Messages read receipt
    const onMessagesRead = ({ readerId, conversationId }) => {
      if (!activeId || String(readerId) === activeId) {
        setMessages((items) =>
          items.map((m) =>
            String(userId(m.sender)) === String(auth.id)
              ? { ...m, status: 'read', readAt: m.readAt || new Date().toISOString() }
              : m
          )
        );
      }
    };

    // Typing indicators
    const onTyping = ({ userId: sender, name, active }) => {
      if (String(sender) === activeId) {
        setTypingName(active ? name || 'Partner' : '');
      }
    };
    const onStoppedTyping = ({ userId: sender }) => {
      if (String(sender) === activeId) {
        setTypingName('');
      }
    };

    // Meetings updates
    const onMeeting = () => {
      if (page === 'sessions') refresh();
    };

    socket.on('new_message', onNewMessage);
    socket.on('message:new', onNewMessage);
    socket.on('message_delivered', onMessageDelivered);
    socket.on('messages_read', onMessagesRead);
    socket.on('message:read', onMessagesRead);
    socket.on('user_typing', onTyping);
    socket.on('user_stopped_typing', onStoppedTyping);
    socket.on('chat:typing', onTyping);
    socket.on('meeting:new', onMeeting);
    socket.on('meeting:update', onMeeting);

    return () => {
      socket.emit('leave_conversation');
      socket.emit('chat:leave');
      socket.off('connect', joinActiveConversation);
      socket.off('new_message', onNewMessage);
      socket.off('message:new', onNewMessage);
      socket.off('message_delivered', onMessageDelivered);
      socket.off('messages_read', onMessagesRead);
      socket.off('message:read', onMessagesRead);
      socket.off('user_typing', onTyping);
      socket.off('user_stopped_typing', onStoppedTyping);
      socket.off('chat:typing', onTyping);
      socket.off('meeting:new', onMeeting);
      socket.off('meeting:update', onMeeting);
      clearTimeout(typingTimer.current);
    };
  }, [auth?.id, thread?.id || thread?._id, activeConversationId, page]);

  // Open a conversation thread
  async function openThread(user) {
    const otherId = userId(user);
    if (!otherId) return;

    if (thread && String(userId(thread)) !== String(otherId)) {
      socket.emit('leave_conversation');
      socket.emit('chat:leave');
    }

    setThread(user);
    setTypingName('');
    setMessagePage(1);

    try {
      const { data } = await api.get(`/conversations/${otherId}?paginated=true&limit=30&page=1`);
      const loadedMessages = data.messages || (Array.isArray(data) ? data : []);
      setMessages(loadedMessages);
      setActiveConversationId(data.conversationId || null);
      setHasMore(Boolean(data.hasMore));

      // Tell server we joined this conversation
      socket.emit('join_conversation', {
        userId: otherId,
        conversationId: data.conversationId
      });
      socket.emit('chat:join', { userId: otherId });

      // Mark unread as read
      socket.emit('mark_messages_read', {
        conversationId: data.conversationId,
        senderId: otherId
      });
      await api.patch(`/conversations/${otherId}/read`);

      // Update unread count in conversations state
      setConversations((items) =>
        items.map((item) =>
          String(userId(item.user)) === String(otherId) ? { ...item, unreadCount: 0 } : item
        )
      );
      await onNotificationRead?.(otherId);
    } catch (e) {
      notify(e.response?.data?.message || 'Could not load conversation.');
    }
  }

  // Load older messages for pagination
  async function loadOlderMessages() {
    if (!thread || loadingOlder || !hasMore) return;
    const otherId = userId(thread);
    const nextPage = messagePage + 1;
    setLoadingOlder(true);

    try {
      const { data } = await api.get(`/conversations/${otherId}?paginated=true&limit=30&page=${nextPage}`);
      const older = data.messages || [];
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m._id));
        const filtered = older.filter((m) => !existingIds.has(m._id));
        return [...filtered, ...prev];
      });
      setMessagePage(nextPage);
      setHasMore(Boolean(data.hasMore));
    } catch (e) {
      notify('Could not load older messages.');
    } finally {
      setLoadingOlder(false);
    }
  }

  // Typing state
  function emitTyping(active) {
    if (!thread || !socket.connected) return;
    const otherId = userId(thread);
    if (active) {
      socket.emit('typing_start', { receiverId: otherId, conversationId: activeConversationId });
      socket.emit('chat:typing', { userId: otherId, active: true });
    } else {
      socket.emit('typing_stop', { receiverId: otherId, conversationId: activeConversationId });
      socket.emit('chat:typing', { userId: otherId, active: false });
    }
  }

  function handleComposeChange() {
    emitTyping(true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => emitTyping(false), 1200);
  }

  // Send message with Socket.IO first, REST fallback
  async function sendMessage(e) {
    e.preventDefault();
    const formNode = e.currentTarget;
    const form = new FormData(formNode);
    const text = form.get('text')?.trim();
    if (!text || !thread) return;

    emitTyping(false);
    clearTimeout(typingTimer.current);
    formNode.reset();

    const otherId = userId(thread);

    // Try sending over Socket.IO if connected
    if (socket.connected) {
      socket.emit(
        'send_message',
        { receiverId: otherId, conversationId: activeConversationId, content: text, text },
        (response) => {
          if (response?.ok && response.message) {
            const data = response.message;
            setMessages((items) => (items.some((m) => m._id === data._id) ? items : [...items, data]));
            setConversations((items) => [
              { user: thread, latestMessage: data, unreadCount: 0, lastMessageAt: data.createdAt },
              ...items.filter((item) => String(userId(item.user)) !== String(otherId))
            ]);
          } else {
            // Socket emission returned failure, fallback to REST
            sendViaRest(otherId, text);
          }
        }
      );
    } else {
      await sendViaRest(otherId, text);
    }
  }

  async function sendViaRest(otherId, text) {
    try {
      const { data } = await api.post('/messages', { receiver: otherId, text });
      setMessages((items) => (items.some((m) => m._id === data._id) ? items : [...items, data]));
      setConversations((items) => [
        { user: thread, latestMessage: data, unreadCount: 0, lastMessageAt: data.createdAt },
        ...items.filter((item) => String(userId(item.user)) !== String(otherId))
      ]);
    } catch (e) {
      notify(e.response?.data?.message || 'Message could not be sent.');
    }
  }

  // Jitsi Video Meeting Trigger
  async function startVideoCall(meeting) {
    if (!meeting?._id) return;
    setCallStarting(true);
    try {
      const { data } = await api.get(`/meetings/${meeting._id}/join`);
      setActiveCall(data);
    } catch (e) {
      notify(e.response?.data?.message || 'Could not join video meeting.');
    } finally {
      setCallStarting(false);
    }
  }

  // Meeting Status
  async function status(meeting, next) {
    try {
      const { data } = await api.patch(`/meetings/${meeting._id}/status`, { status: next });
      notify(`Session ${next}.`);
      await refresh();
      if (next === 'accepted') {
        notify('Meeting accepted! You can now join the video call.');
      }
    } catch (e) {
      notify(e.response?.data?.message || 'Could not update session.');
    }
  }

  async function requestSession(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await api.post('/meetings', {
        recipient: userId(meetingTarget),
        proposedAt: form.get('proposedAt'),
        note: form.get('note')
      });
      setMeetingTarget(null);
      notify('Your meeting request has been sent.');
      if (page === 'sessions') await refresh();
    } catch (e) {
      notify(e.response?.data?.message || 'Could not send the meeting request.');
    }
  }

  async function submitReview(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const other =
      String(userId(reviewMeeting.requester)) === String(auth.id)
        ? reviewMeeting.recipient
        : reviewMeeting.requester;
    try {
      await api.post('/reviews', {
        reviewedUser: userId(other),
        meeting: reviewMeeting._id,
        rating: reviewRating,
        comment: form.get('comment')
      });
      setReviewedMeetings((v) => [...v, String(reviewMeeting._id)]);
      setReviewMeeting(null);
      notify('Thank you for sharing your feedback.');
      refresh();
    } catch (e) {
      notify(e.response?.data?.message || 'Review could not be submitted.');
    }
  }

  async function saveProfile(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const next = {
      name: form.get('name'),
      bio: form.get('bio'),
      location: form.get('location')
    };
    try {
      const { data } = await api.put('/users/profile', next);
      setProfile(data.user);
      localStorage.setItem('peerza_user', JSON.stringify(data.user));
      onUserUpdated(data.user);
      notify('Your profile is saved.');
    } catch (e) {
      notify(e.response?.data?.message || 'Profile could not be saved.');
    }
  }

  async function addSkill(e) {
    e.preventDefault();
    if (!newSkill.name.trim()) return;
    try {
      const { data } = await api.post('/user-skills', newSkill);
      setSkills((v) => [...v, data]);
      setNewSkill((v) => ({ ...v, name: '' }));
    } catch (e) {
      notify(e.response?.data?.message || 'Could not add skill.');
    }
  }

  async function removeSkill(id) {
    try {
      await api.delete(`/user-skills/${id}`);
      setSkills((v) => v.filter((s) => s._id !== id));
    } catch (e) {
      notify(e.response?.data?.message || 'Could not remove skill.');
    }
  }

  async function updateSkill(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      const { data } = await api.put(`/user-skills/${editingSkill._id}`, {
        name: form.get('name'),
        type: form.get('type'),
        category: form.get('category')
      });
      setSkills((v) => v.map((s) => (s._id === data._id ? data : s)));
      setEditingSkill(null);
    } catch (e) {
      notify(e.response?.data?.message || 'Could not update skill.');
    }
  }

  const [title, subtitle] = titles[page] || titles.profile;

  // Helper to find accepted meeting with thread partner for quick video call
  const acceptedMeetingForThread = thread
    ? meetings.find(
        (m) =>
          m.status === 'accepted' &&
          (String(userId(m.requester)) === String(userId(thread)) ||
            String(userId(m.recipient)) === String(userId(thread)))
      )
    : null;

  return (
    <div className="content-wrap workspace-page">
      <div className="section-kicker">
        <span /> YOUR PEERZA SPACE
      </div>
      <div className="workspace-title-row">
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {page === 'sessions' && (
          <button className="work-action" onClick={() => setPage('discover')}>
            <Plus size={16} /> Find a learning partner
          </button>
        )}
      </div>

      {!auth ? (
        <Empty
          icon={UserRound}
          title="Your learning space is waiting"
          body={error}
          action="Sign in or create an account"
          onAction={onAuth}
        />
      ) : busy ? (
        <div className="work-loading">
          <span /> Gathering your Peerza space…
        </div>
      ) : error ? (
        <div className="work-error">
          {error}
          <button onClick={refresh}>Try again</button>
        </div>
      ) : (
        <>
          {/* MATCHES TAB */}
          {page === 'matches' && (
            <div className="work-grid">
              {matches.length ? (
                matches.map((m) => (
                  <article className="work-card" key={m.userId}>
                    <div
                      className="work-card-head"
                      onClick={() => onOpenProfile?.(m.user)}
                      style={{ cursor: 'pointer' }}
                      title="View public profile"
                    >
                      <Avatar user={m.user} />
                      <div>
                        <h3 className="profile-link-name">{m.user.name}</h3>
                        <small>{m.user.location || 'Peerza learner'}</small>
                      </div>
                      <span className="mutual-tag">
                        <ArrowLeftRight size={13} /> Mutual
                      </span>
                    </div>
                    <p className="work-bio">You can help each other grow through these complementary skills.</p>
                    <div className="work-skill-row">
                      <span>They can teach you</span>
                      <div>
                        {m.teachForMe.map((x) => (
                          <i key={x}>{x}</i>
                        ))}
                      </div>
                    </div>
                    <div className="work-skill-row coral">
                      <span>You can teach them</span>
                      <div>
                        {m.learnFromMe.map((x) => (
                          <i key={x}>{x}</i>
                        ))}
                      </div>
                    </div>
                    <div className="work-card-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => onOpenProfile?.(m.user)}
                        title="View full profile"
                      >
                        <UserRound size={14} /> View profile
                      </button>
                      <button onClick={() => openThread(m.user)}>
                        <MessageCircle size={15} /> Message
                      </button>
                      <button onClick={() => setMeetingTarget(m.user)}>
                        <CalendarDays size={15} /> Request a session
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <Empty
                  icon={ArrowLeftRight}
                  title="Your mutual matches will show up here"
                  body="Add at least one skill you can teach and one you want to learn. Peerza will look for people whose skills complement yours."
                  action="Add your skills"
                  onAction={() => setPage('profile')}
                />
              )}
            </div>
          )}

          {/* MESSAGES TAB */}
          {page === 'messages' && (
            <div className="messenger">
              <div className="conversation-list">
                <div className="conversation-list-head">
                  <b>Conversations</b>
                  <span>{conversations.length}</span>
                </div>
                {conversations.map((c) => {
                  const partnerId = String(userId(c.user));
                  const isOnline = onlineUsers.includes(partnerId);
                  const isSelected = String(userId(thread)) === partnerId;

                  return (
                    <button
                      className={`conversation-row ${isSelected ? 'chosen' : ''}`}
                      key={partnerId}
                      onClick={() => openThread(c.user)}
                    >
                      <div className="avatar-wrap" style={{ position: 'relative' }}>
                        <Avatar user={c.user} />
                        <i
                          className={`presence-dot ${isOnline ? 'online' : ''}`}
                          style={{
                            position: 'absolute',
                            bottom: -2,
                            right: -2,
                            border: '2px solid white'
                          }}
                        />
                      </div>
                      <span>
                        <b>{c.user.name}</b>
                        <small>{c.latestMessage?.content || c.latestMessage?.text || 'No messages yet'}</small>
                      </span>
                      {c.unreadCount > 0 && (
                        <i className="conversation-unread">
                          {c.unreadCount > 9 ? '9+' : c.unreadCount}
                        </i>
                      )}
                    </button>
                  );
                })}
                {!conversations.length && (
                  <div className="conversation-empty">
                    Your conversations will appear here after you message a learner.
                  </div>
                )}
              </div>

              <div className="thread-panel">
                {thread ? (
                  <>
                    <div className="thread-head">
                      <div
                        className="thread-user-info"
                        onClick={() => onOpenProfile?.(thread)}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
                        title="Click to view profile"
                      >
                        <Avatar user={thread} />
                        <span>
                          <b className="profile-link-name">{thread.name}</b>
                          <small>
                            <i className={`presence-dot ${onlineUsers.includes(String(userId(thread))) ? 'online' : ''}`} />
                            {onlineUsers.includes(String(userId(thread))) ? 'Online now' : 'Offline'}
                          </small>
                        </span>
                      </div>

                      {/* Video Call button if an accepted session exists */}
                      {acceptedMeetingForThread && (
                        <button
                          className="thread-call-btn"
                          onClick={() => startVideoCall(acceptedMeetingForThread)}
                          title="Start one-to-one video call"
                        >
                          <Video size={14} /> Join Call
                        </button>
                      )}

                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => onOpenProfile?.(thread)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 9px', fontSize: '11px', height: '28px' }}
                        title="View profile"
                      >
                        <UserRound size={13} /> View profile
                      </button>

                      <span className="rest-note">
                        Live updates <i className="live-indicator" />
                      </span>
                    </div>

                    <div className="thread-messages">
                      {hasMore && (
                        <button
                          className="load-more-btn"
                          onClick={loadOlderMessages}
                          disabled={loadingOlder}
                        >
                          {loadingOlder ? 'Loading older messages…' : 'Load older messages'}
                        </button>
                      )}

                      {messages.map((m) => {
                        const isMine = String(userId(m.sender)) === String(auth.id);
                        const statusState = m.status || (m.readAt ? 'read' : 'delivered');

                        return (
                          <div
                            key={m._id || `${m.createdAt}-${Math.random()}`}
                            className={`message-bubble ${isMine ? 'mine' : ''}`}
                          >
                            <p>{m.content || m.text}</p>
                            <div className="msg-status-wrap">
                              <small>
                                {new Date(m.createdAt).toLocaleTimeString(undefined, {
                                  hour: 'numeric',
                                  minute: '2-digit'
                                })}
                              </small>
                              {isMine && (
                                <span className={`msg-status ${statusState}`} title={statusState}>
                                  {statusState === 'read' ? (
                                    <>
                                      <CheckCheck size={12} /> Seen
                                    </>
                                  ) : statusState === 'delivered' ? (
                                    <>
                                      <CheckCheck size={12} /> Delivered
                                    </>
                                  ) : (
                                    <>
                                      <Check size={12} /> Sent
                                    </>
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {typingName && (
                        <div className="typing-indicator">
                          <i />
                          <i />
                          <i /> {typingName.split(' ')[0]} is typing…
                        </div>
                      )}

                      {!messages.length && (
                        <div className="thread-empty">
                          Say hello and start planning your skill swap.
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>

                    <form className="message-compose" onSubmit={sendMessage}>
                      <input
                        name="text"
                        onChange={handleComposeChange}
                        onBlur={() => emitTyping(false)}
                        placeholder={`Write to ${thread.name.split(' ')[0]}…`}
                        maxLength="2000"
                        autoComplete="off"
                        required
                      />
                      <button aria-label="Send message">
                        <Send size={17} />
                      </button>
                    </form>
                  </>
                ) : (
                  <div className="thread-placeholder">
                    <MessageCircle size={25} />
                    <b>Pick a conversation</b>
                    <span>Your messages stay organized right here.</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SESSIONS TAB */}
          {page === 'sessions' && (
            <div className="session-list">
              {meetings.length ? (
                meetings.map((m) => {
                  const outgoing = String(userId(m.requester)) === String(auth.id);
                  const other = outgoing ? m.recipient : m.requester;
                  const isAccepted = m.status === 'accepted';

                  return (
                    <article className="session-card" key={m._id}>
                      <Avatar
                        user={other}
                        onClick={() => onOpenProfile?.(other)}
                        title="Click to view profile"
                      />
                      <div className="session-main">
                        <div className="session-topline">
                          <h3
                            onClick={() => onOpenProfile?.(other)}
                            style={{ cursor: 'pointer' }}
                            className="profile-link-name"
                            title="Click to view profile"
                          >
                            Skill swap with {other.name}
                          </h3>
                          <span className={`status-pill status-${m.status}`}>{m.status}</span>
                        </div>
                        <p>
                          <CalendarDays size={14} />
                          {new Date(m.proposedAt).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short'
                          })}
                        </p>
                        {m.note && <small className="session-note">“{m.note}”</small>}
                        <div className="session-bottom">
                          <span>
                            <Clock3 size={13} />
                            {outgoing ? 'You requested this session' : 'Session request received'}
                          </span>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => onOpenProfile?.(other)}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', fontSize: '11px', height: '30px' }}
                              title="View full profile"
                            >
                              <UserRound size={13} /> View profile
                            </button>
                            {m.status === 'pending' && !outgoing && (
                              <>
                                <button onClick={() => status(m, 'accepted')}>Accept</button>
                                <button className="reject" onClick={() => status(m, 'rejected')}>
                                  Decline
                                </button>
                              </>
                            )}

                            {/* JOIN JITSI VIDEO MEETING BUTTON */}
                            {isAccepted && (
                              <button
                                className="join-call-btn"
                                onClick={() => startVideoCall(m)}
                                disabled={callStarting}
                              >
                                <Video size={14} /> Join Video Call
                              </button>
                            )}

                            {isAccepted && (
                              <button onClick={() => status(m, 'completed')}>Mark completed</button>
                            )}

                            {m.status === 'completed' &&
                              !reviewedMeetings.includes(String(m._id)) && (
                                <button onClick={() => setReviewMeeting(m)}>
                                  <Star size={14} /> Leave a review
                                </button>
                              )}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })
              ) : (
                <Empty
                  icon={CalendarDays}
                  title="No sessions on your calendar yet"
                  body="When you find a mutual match, suggest a time to meet and learn together."
                  action="Discover learners"
                  onAction={() => setPage('discover')}
                />
              )}
            </div>
          )}

          {/* VIEW PROFILE PAGE */}
          {page === 'profile' && (() => {
            const hasCert = Boolean(profile.certificates && profile.certificates.length);
            const hasExp = Boolean(profile.experience && profile.experience.length);
            const avatarSrc = getAvatarUrl(profile.avatar);

            return (
              <div className="profile-view-wrap">
                <div className="profile-view-card">
                  <div className="profile-view-head">
                    <div className="profile-view-avatar-wrap">
                      {avatarSrc ? (
                        <img
                          src={avatarSrc}
                          alt={profile.name || 'User'}
                          className="profile-view-avatar-img"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            const sibling = e.currentTarget.parentElement?.querySelector('.profile-view-avatar-initials');
                            if (sibling) sibling.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <span
                        className="profile-view-avatar-initials"
                        style={{ display: avatarSrc ? 'none' : 'flex' }}
                      >
                        {getInitials(profile.name)}
                      </span>
                    </div>

                    <div className="profile-view-meta">
                      <div className="profile-view-top-row">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                          <h2>{profile.name || 'Peerza Learner'}</h2>

                          {hasCert ? (
                            <span className="evidence-badge cert-badge" title="Verified certificate uploaded">
                              <Award size={13} /> Certificate Provided
                            </span>
                          ) : hasExp ? (
                            <span className="evidence-badge exp-badge" title="Verified professional experience listed">
                              <Briefcase size={13} /> Experience Provided
                            </span>
                          ) : (
                            <span className="evidence-badge pending-badge" title="No certificate or experience yet">
                              <Clock3 size={13} /> Evidence Pending
                            </span>
                          )}

                          {profile.reviewCount > 0 ? (
                            <span className="profile-rating-pill" title={`${profile.rating} average rating`}>
                              <Star size={13} fill="currentColor" /> {profile.rating} ({profile.reviewCount} {profile.reviewCount === 1 ? 'review' : 'reviews'})
                            </span>
                          ) : (
                            <span className="profile-rating-pill muted">No reviews yet</span>
                          )}
                        </div>

                        <button
                          type="button"
                          className="work-action edit-profile-btn"
                          onClick={() => setPage('profile-edit')}
                        >
                          <Pencil size={14} /> Edit Profile
                        </button>
                      </div>

                      <p className="profile-view-location">
                        <MapPin size={13} /> {profile.location || 'Location not added'}
                      </p>
                      <p className="profile-view-bio">
                        {profile.bio || 'Ready to share skills and learn something new.'}
                      </p>
                    </div>
                  </div>

                  {/* Skills Grid */}
                  <div className="profile-view-skills-grid">
                    <div className="profile-view-skill-box">
                      <span className="skill-label teach-label">
                        <span className="skill-arrow">↗</span> SKILLS I CAN TEACH
                      </span>
                      <div className="skill-list">
                        {skills.filter((s) => s.type === 'teach').length ? (
                          skills
                            .filter((s) => s.type === 'teach')
                            .map((s) => (
                              <span className="skill" key={s._id}>
                                {s.name} <small style={{ opacity: 0.7, marginLeft: 4 }}>({s.category})</small>
                              </span>
                            ))
                        ) : (
                          <span className="no-skills-msg">No teaching skills added yet.</span>
                        )}
                      </div>
                    </div>

                    <div className="profile-view-skill-box">
                      <span className="skill-label learn-label">
                        <span className="skill-arrow">↙</span> SKILLS I WANT TO LEARN
                      </span>
                      <div className="skill-list">
                        {skills.filter((s) => s.type === 'learn').length ? (
                          skills
                            .filter((s) => s.type === 'learn')
                            .map((s) => (
                              <span className="skill skill-coral" key={s._id}>
                                {s.name} <small style={{ opacity: 0.7, marginLeft: 4 }}>({s.category})</small>
                              </span>
                            ))
                        ) : (
                          <span className="no-skills-msg">No learning interests added yet.</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Professional Experience Section */}
                  <div className="profile-view-section">
                    <h3>
                      <Briefcase size={16} /> Professional Experience
                    </h3>
                    {profile.experience && profile.experience.length ? (
                      <div className="exp-list">
                        {profile.experience.map((exp, idx) => (
                          <div className="exp-item-card" key={exp._id || idx}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <b className="exp-title">{exp.title}</b>
                                <span className="exp-org">at {exp.organization}</span>
                                <span className="exp-duration-pill">{exp.duration}</span>
                              </div>
                              {exp.description && (
                                <p className="exp-desc">
                                  {exp.description}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="empty-section-note">
                        No professional experience listed yet. Add your work background in Edit Profile to earn an Experience Provided badge.
                      </p>
                    )}
                  </div>

                  {/* Certificates & Credentials Section */}
                  <div className="profile-view-section">
                    <h3>
                      <Award size={16} /> Certificates & Credentials
                    </h3>
                    {profile.certificates && profile.certificates.length ? (
                      <div className="cert-list">
                        {profile.certificates.map((c, idx) => (
                          <div className="cert-item-card" key={c._id || idx}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <FileText size={22} color="#2e6945" />
                              <div>
                                <b className="cert-title">{c.title}</b>
                                <div className="cert-meta">
                                  {c.issuer && <span>Issued by {c.issuer}</span>}
                                  {c.skill && <span>• Skill: {c.skill}</span>}
                                </div>
                              </div>
                            </div>
                            <a
                              href={`/api/profile/certificates/${c.fileRef || c._id}/file`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="cert-view-btn"
                              title="View certificate document in new tab"
                            >
                              <ExternalLink size={12} /> View Document
                            </a>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="empty-section-note">
                        No certificates uploaded yet. Upload a certificate (PDF, JPG, PNG) in Edit Profile to earn a Certificate Provided badge.
                      </p>
                    )}
                  </div>

                  {/* Ratings & Reviews Section */}
                  <div className="profile-view-section">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <h3 style={{ margin: 0 }}>
                        <Star size={16} /> Ratings & Reviews ({myReviews.length})
                      </h3>
                      {profile.rating && (
                        <span className="profile-rating-pill">
                          <Star size={13} fill="currentColor" /> {profile.rating} average
                        </span>
                      )}
                    </div>

                    {myReviews.length ? (
                      <div className="reviews-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {myReviews.map((r) => (
                          <div className="review-item-card" key={r._id}>
                            <div className="review-item-head">
                              <div
                                className="review-item-author"
                                onClick={() => r.reviewer && onOpenProfile?.(r.reviewer)}
                                title="View reviewer profile"
                              >
                                <Avatar user={r.reviewer} />
                                <b className="profile-link-name">{r.reviewer?.name || 'Peerza Learner'}</b>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div className="review-item-stars">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <Star
                                      key={star}
                                      size={13}
                                      fill={star <= r.rating ? 'currentColor' : 'none'}
                                      color={star <= r.rating ? '#e6a117' : '#ccd6cb'}
                                    />
                                  ))}
                                </div>
                                <small className="review-item-date">
                                  {new Date(r.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                                </small>
                              </div>
                            </div>
                            {r.comment && <p className="review-item-comment">“{r.comment}”</p>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="empty-section-note">
                        No reviews yet. Complete learning sessions with other peers to earn ratings and reviews.
                      </p>
                    )}
                  </div>

                  <div className="profile-view-footer">
                    <small>Want to update your photo, details, skills, experience, or certificates?</small>
                    <button
                      type="button"
                      className="secondary-button"
                      style={{ display: 'inline-flex', width: 'auto', padding: '0 15px', height: '34px' }}
                      onClick={() => setPage('profile-edit')}
                    >
                      <Pencil size={13} /> Edit Profile & Credentials
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* EDIT PROFILE PAGE */}
          {page === 'profile-edit' && (() => {
            const hasCert = Boolean(profile.certificates && profile.certificates.length);
            const hasExp = Boolean(profile.experience && profile.experience.length);
            const evidenceComplete = hasCert || hasExp;
            const avatarSrc = getAvatarUrl(profile.avatar);

            return (
              <div className="profile-edit-layout">
                <div className="profile-edit-header-row">
                  <button
                    type="button"
                    className="back-view-btn"
                    onClick={() => setPage('profile')}
                  >
                    <ArrowLeft size={14} /> View Public Profile
                  </button>
                </div>

                {/* Evidence Status Banner */}
                {evidenceComplete ? (
                  <div className="evidence-status-banner complete">
                    <ShieldCheck size={22} color="#2e6945" />
                    <div>
                      <b>Skill Evidence Complete</b> — You have provided verified credentials ({hasCert ? 'Certificate' : 'Professional Experience'}). Your profile displays an honest evidence badge on Discover and public profiles.
                    </div>
                  </div>
                ) : (
                  <div className="evidence-status-banner pending">
                    <Clock3 size={22} color="#b8860b" />
                    <div>
                      <b>Skill Evidence Recommended</b> — Add at least one professional experience entry OR upload a certificate below to earn a verified evidence badge for learners.
                    </div>
                  </div>
                )}

                <div className="profile-work-grid">
                  <div className="profile-left-column">
                    {/* Photo Upload Card */}
                    <div className="profile-edit-card photo-card">
                      <h2>Profile picture</h2>
                      <p>Upload a photo of yourself (JPG, PNG, or WEBP up to 2 MB).</p>

                      <div className="photo-upload-section">
                        <div className="photo-preview-avatar">
                          {previewUrl ? (
                            <img src={previewUrl} alt="Preview" />
                          ) : avatarSrc ? (
                            <img
                              src={avatarSrc}
                              alt={profile.name || 'User'}
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                const sibling = e.currentTarget.parentElement?.querySelector('.photo-preview-initials');
                                if (sibling) sibling.style.display = 'flex';
                              }}
                            />
                          ) : null}
                          <span
                            className="photo-preview-initials"
                            style={{ display: !previewUrl && !avatarSrc ? 'flex' : 'none' }}
                          >
                            {getInitials(profile.name)}
                          </span>
                        </div>

                        <div className="photo-controls">
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/jpg"
                            style={{ display: 'none' }}
                            onChange={handleFileSelected}
                          />

                          <div className="photo-button-row">
                            <button
                              type="button"
                              className="work-action photo-choose-btn"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={uploadingAvatar}
                            >
                              <Camera size={14} /> Choose Photo
                            </button>

                            {selectedFile && (
                              <button
                                type="button"
                                className="work-action photo-save-btn"
                                onClick={handleUploadAvatar}
                                disabled={uploadingAvatar}
                              >
                                {uploadingAvatar ? (
                                  <>Uploading…</>
                                ) : (
                                  <>
                                    <Upload size={14} /> Save Photo
                                  </>
                                )}
                              </button>
                            )}

                            {(profile.avatar || selectedFile) && (
                              <button
                                type="button"
                                className="remove-photo-btn"
                                onClick={handleRemoveAvatar}
                                disabled={uploadingAvatar}
                              >
                                <Trash2 size={13} /> {selectedFile ? 'Cancel' : 'Remove Photo'}
                              </button>
                            )}
                          </div>

                          {selectedFile && (
                            <span className="photo-selected-note">
                              Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)
                            </span>
                          )}

                          {avatarError && <div className="photo-error">{avatarError}</div>}
                          {avatarSuccess && <div className="photo-success">{avatarSuccess}</div>}
                        </div>
                      </div>
                    </div>

                    {/* Personal Details Form */}
                    <form className="profile-edit-card" onSubmit={saveProfile}>
                      <h2>About you</h2>
                      <p>Update your personal information shown to learners.</p>
                      <label>
                        Your name
                        <input name="name" defaultValue={profile.name || ''} required maxLength="80" />
                      </label>
                      <label>
                        Short introduction
                        <textarea
                          name="bio"
                          rows="4"
                          maxLength="500"
                          defaultValue={profile.bio || ''}
                          placeholder="What do you enjoy teaching? What are you curious about?"
                        />
                      </label>
                      <label>
                        Location
                        <input
                          name="location"
                          defaultValue={profile.location || ''}
                          maxLength="100"
                          placeholder="City, country"
                        />
                      </label>
                      <button className="work-action">
                        Save details <Check size={15} />
                      </button>
                    </form>
                  </div>

                  {/* Right Column: Skills, Experience, and Certificates */}
                  <div className="profile-right-column" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Skills Management Card */}
                    <div className="skills-edit-card">
                      <h2>Your skills</h2>
                      <p>List skills you can share and skills you hope to learn.</p>
                      <form className="add-skill-form" onSubmit={addSkill}>
                        <input
                          value={newSkill.name}
                          onChange={(e) => setNewSkill((v) => ({ ...v, name: e.target.value }))}
                          placeholder="Add a skill…"
                          maxLength="60"
                          required
                        />
                        <select
                          value={newSkill.type}
                          onChange={(e) => setNewSkill((v) => ({ ...v, type: e.target.value }))}
                        >
                          <option value="teach">I can teach</option>
                          <option value="learn">I want to learn</option>
                        </select>
                        <select
                          value={newSkill.category}
                          onChange={(e) => setNewSkill((v) => ({ ...v, category: e.target.value }))}
                        >
                          <option>Design</option>
                          <option>Technology</option>
                          <option>Art</option>
                          <option>Business</option>
                          <option>Other</option>
                        </select>
                        <button aria-label="Add skill">
                          <Plus size={17} />
                        </button>
                      </form>

                      {editingSkill && (
                        <form className="edit-skill-form" onSubmit={updateSkill}>
                          <input name="name" defaultValue={editingSkill.name} required maxLength="60" />
                          <select name="type" defaultValue={editingSkill.type}>
                            <option value="teach">I can teach</option>
                            <option value="learn">I want to learn</option>
                          </select>
                          <select name="category" defaultValue={editingSkill.category}>
                            <option>Design</option>
                            <option>Technology</option>
                            <option>Art</option>
                            <option>Business</option>
                            <option>Other</option>
                          </select>
                          <button className="work-action">Save</button>
                          <button type="button" className="edit-cancel" onClick={() => setEditingSkill(null)}>
                            Cancel
                          </button>
                        </form>
                      )}

                      {['teach', 'learn'].map((type) => (
                        <div className="skill-edit-group" key={type}>
                          <h3>{type === 'teach' ? 'I can teach' : 'I want to learn'}</h3>
                          <div>
                            {skills
                              .filter((s) => s.type === type)
                              .map((s) => (
                                <span className="editable-skill" key={s._id}>
                                  {s.name}
                                  <small>{s.category}</small>
                                  <button onClick={() => setEditingSkill(s)} aria-label={`Edit ${s.name}`}>
                                    <Pencil size={12} />
                                  </button>
                                  <button onClick={() => removeSkill(s._id)} aria-label={`Remove ${s.name}`}>
                                    <X size={13} />
                                  </button>
                                </span>
                              ))}
                          </div>
                          {!skills.some((s) => s.type === type) && (
                            <small className="no-skills">No skills added yet.</small>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Professional Experience Manager Card */}
                    <div className="profile-edit-card experience-card">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <Briefcase size={18} color="#2e6945" />
                        <h2 style={{ margin: 0 }}>Professional experience</h2>
                      </div>
                      <p>Share your relevant work history to establish credibility with other learners.</p>

                      <form className="add-experience-form" onSubmit={handleAddExperience} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div className="form-two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <label>
                            Job Title *
                            <input
                              value={newExperience.title}
                              onChange={(e) => setNewExperience({ ...newExperience, title: e.target.value })}
                              placeholder="e.g. Frontend Developer"
                              required
                              maxLength="100"
                            />
                          </label>
                          <label>
                            Company / Organization *
                            <input
                              value={newExperience.organization}
                              onChange={(e) => setNewExperience({ ...newExperience, organization: e.target.value })}
                              placeholder="e.g. Acme Corp or Freelance"
                              required
                              maxLength="100"
                            />
                          </label>
                        </div>

                        <label>
                          Duration *
                          <input
                            value={newExperience.duration}
                            onChange={(e) => setNewExperience({ ...newExperience, duration: e.target.value })}
                            placeholder="e.g. 2021 – Present or 3 years"
                            required
                            maxLength="60"
                          />
                        </label>

                        <label>
                          Description (optional)
                          <textarea
                            value={newExperience.description}
                            onChange={(e) => setNewExperience({ ...newExperience, description: e.target.value })}
                            placeholder="Key responsibilities, skills used, or achievements…"
                            rows="2"
                            maxLength="500"
                          />
                        </label>

                        {expError && <div className="photo-error">{expError}</div>}

                        <button type="submit" className="work-action" disabled={savingExp} style={{ alignSelf: 'flex-start' }}>
                          {savingExp ? 'Adding…' : <><Plus size={14} /> Add Experience</>}
                        </button>
                      </form>

                      <div className="item-manage-list" style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {profile.experience && profile.experience.length ? (
                          profile.experience.map((exp) => (
                            <div className="item-manage-row" key={exp._id}>
                              <div>
                                <b className="exp-title">{exp.title}</b>
                                <div className="exp-org">
                                  {exp.organization} • <i>{exp.duration}</i>
                                </div>
                                {exp.description && (
                                  <p className="exp-desc">{exp.description}</p>
                                )}
                              </div>
                              <button
                                type="button"
                                className="item-delete-btn"
                                onClick={() => handleDeleteExperience(exp._id)}
                                aria-label="Delete experience"
                                title="Remove experience"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ))
                        ) : (
                          <small className="no-skills">No experience entries added yet.</small>
                        )}
                      </div>
                    </div>

                    {/* Certificates & Credentials Manager Card */}
                    <div className="profile-edit-card certificates-card">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <Award size={18} color="#2e6945" />
                        <h2 style={{ margin: 0 }}>Certificates & credentials</h2>
                      </div>
                      <p>Upload certificate files (PDF, JPG, or PNG up to 4 MB) stored directly in Peerza.</p>

                      <form className="add-cert-form" onSubmit={handleAddCertificate} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <label>
                          Certificate Title *
                          <input
                            value={newCert.title}
                            onChange={(e) => setNewCert({ ...newCert, title: e.target.value })}
                            placeholder="e.g. AWS Certified Solutions Architect"
                            required
                            maxLength="100"
                          />
                        </label>

                        <div className="form-two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <label>
                            Issuing Organization
                            <input
                              value={newCert.issuer}
                              onChange={(e) => setNewCert({ ...newCert, issuer: e.target.value })}
                              placeholder="e.g. Amazon Web Services, Meta"
                              maxLength="100"
                            />
                          </label>
                          <label>
                            Associated Skill
                            <input
                              value={newCert.skill}
                              onChange={(e) => setNewCert({ ...newCert, skill: e.target.value })}
                              placeholder="e.g. Cloud Architecture"
                              maxLength="60"
                            />
                          </label>
                        </div>

                        <div>
                          <input
                            ref={certFileInputRef}
                            type="file"
                            accept="application/pdf,image/jpeg,image/png,image/jpg"
                            style={{ display: 'none' }}
                            onChange={handleCertFileSelected}
                          />
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => certFileInputRef.current?.click()}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '34px', padding: '0 12px' }}
                            >
                              <Upload size={14} /> {certFile ? 'Change File' : 'Select Document (PDF/JPG/PNG)'}
                            </button>
                            {certFile && (
                              <span className="photo-selected-note">
                                {certFile.name} ({(certFile.size / 1024).toFixed(0)} KB)
                              </span>
                            )}
                          </div>
                        </div>

                        {certError && <div className="photo-error">{certError}</div>}

                        <button type="submit" className="work-action" disabled={savingCert} style={{ alignSelf: 'flex-start', marginTop: '4px' }}>
                          {savingCert ? 'Uploading…' : <><Plus size={14} /> Upload Certificate</>}
                        </button>
                      </form>

                      <div className="item-manage-list" style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {profile.certificates && profile.certificates.length ? (
                          profile.certificates.map((c) => (
                            <div className="item-manage-row" key={c._id}>
                              <div>
                                <b className="cert-title">{c.title}</b>
                                <div className="cert-meta">
                                  {c.issuer && <span>{c.issuer}</span>}
                                  {c.skill && <span> • {c.skill}</span>}
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <a
                                  href={`/api/profile/certificates/${c.fileRef || c._id}/file`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="cert-view-btn"
                                  title="View document in new tab"
                                >
                                  <ExternalLink size={12} /> View
                                </a>
                                <button
                                  type="button"
                                  className="item-delete-btn"
                                  onClick={() => handleDeleteCertificate(c._id)}
                                  aria-label="Delete certificate"
                                  title="Remove certificate"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <small className="no-skills">No certificates uploaded yet.</small>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {/* Review Modal */}
      {reviewMeeting && (
        <div className="modal-backdrop">
          <form className="form-modal" onSubmit={submitReview}>
            <button type="button" className="modal-close" onClick={() => setReviewMeeting(null)}>
              <X size={19} />
            </button>
            <div className="section-kicker">
              <span /> KEEP THE GOODNESS GOING
            </div>
            <h2>How was your skill swap?</h2>
            <p>
              Your review helps{' '}
              {String(userId(reviewMeeting.requester)) === String(auth.id)
                ? reviewMeeting.recipient.name
                : reviewMeeting.requester.name}{' '}
              and other learners find a good fit.
            </p>
            <div className="rating-picks">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  type="button"
                  key={n}
                  className={n <= reviewRating ? 'rated' : ''}
                  onClick={() => setReviewRating(n)}
                >
                  <Star size={24} fill="currentColor" />
                </button>
              ))}
            </div>
            <label>
              Your note
              <textarea
                name="comment"
                rows="4"
                maxLength="600"
                placeholder="What did you enjoy or learn?"
              />
            </label>
            <button className="primary-button full-button">
              Share your review <ArrowRight size={16} />
            </button>
          </form>
        </div>
      )}

      {/* Request Session Modal */}
      {meetingTarget && (
        <div className="modal-backdrop">
          <form className="form-modal" onSubmit={requestSession}>
            <button type="button" className="modal-close" onClick={() => setMeetingTarget(null)}>
              <X size={19} />
            </button>
            <div className="section-kicker">
              <span /> YOUR FIRST HELLO
            </div>
            <h2>Set up a skill swap.</h2>
            <p>
              Suggest a time to meet {meetingTarget.name.split(' ')[0]} and learn from each other.
            </p>
            <label>
              When works for you?
              <input
                type="datetime-local"
                name="proposedAt"
                min={new Date(Date.now() + 3600000).toISOString().slice(0, 16)}
                required
              />
            </label>
            <label>
              A little context
              <textarea
                name="note"
                rows="3"
                maxLength="500"
                placeholder="What would you love to learn or share?"
              />
            </label>
            <button className="primary-button full-button">
              Send meeting request <ArrowRight size={16} />
            </button>
          </form>
        </div>
      )}

      {/* JITSI FULLSCREEN VIDEO CALL OVERLAY */}
      {activeCall && (
        <JitsiMeeting
          roomName={activeCall.roomName}
          domain={activeCall.domain || import.meta.env.VITE_JITSI_DOMAIN || 'meet.jit.si'}
          displayName={auth.name}
          email={auth.email}
          partner={activeCall.partner}
          note={activeCall.note}
          onLeave={() => {
            setActiveCall(null);
            notify('Video call ended.');
            refresh();
          }}
        />
      )}
    </div>
  );
}
