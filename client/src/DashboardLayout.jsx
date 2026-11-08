import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeftRight,
  ArrowRight,
  Award,
  Bell,
  Bookmark,
  Briefcase,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Compass,
  ExternalLink,
  GraduationCap,
  Heart,
  LayoutGrid,
  LogOut,
  Menu,
  MessageCircle,
  Pencil,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  UserRound,
  X
} from 'lucide-react';
import api from './api';
import Workspace from './Workspace.jsx';
import { socket } from './realtime.js';
import { useAuth } from './AuthContext';
import { getAvatarUrl, getInitials } from './avatarHelper.js';

const categories = ['All people', 'Design', 'Technology', 'Art', 'Business'];
const iconFor = {
  'All people': Compass,
  Design: Sparkles,
  Technology: LayoutGrid,
  Art: GraduationCap,
  Business: ArrowLeftRight
};

function Avatar({ person, size = 'md', online = false }) {
  const [imgError, setImgError] = useState(false);
  const avatarUrl = !imgError ? getAvatarUrl(person?.avatar) : null;
  const initialsText = getInitials(person?.name || person?.avatar || '');

  useEffect(() => {
    setImgError(false);
  }, [person?.avatar]);

  return (
    <span className={`avatar avatar-${person?.color || 'mint'} avatar-${size}`}>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={person?.name || 'User'}
          onError={() => setImgError(true)}
        />
      ) : (
        <span>{initialsText}</span>
      )}
      <i className={online ? 'online' : ''} />
    </span>
  );
}

function TopUserAvatar({ user, className }) {
  const [imgError, setImgError] = useState(false);
  const avatarUrl = !imgError ? getAvatarUrl(user?.avatar) : null;
  const initial = (user?.name || '').trim().slice(0, 1).toUpperCase() || 'P';

  useEffect(() => {
    setImgError(false);
  }, [user?.avatar]);

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={user?.name || 'User'}
        className={className}
        onError={() => setImgError(true)}
      />
    );
  }
  return <span>{initial}</span>;
}

function Skill({ children, tone = 'green' }) {
  return <span className={`skill skill-${tone}`}>{children}</span>;
}

function SavedPeople({ people, saved, onUnsave, onOpen, loading }) {
  const list = people.filter((person) => saved.includes(person.id));
  return (
    <div className="content-wrap workspace-page saved-page">
      <div className="section-kicker">
        <span /> KEEP THE GOOD CONNECTIONS CLOSE
      </div>
      <div className="workspace-title-row">
        <div>
          <h1>Your saved people</h1>
          <p>A short list of learners you’d like to come back to.</p>
        </div>
        <span className="saved-count">{list.length} saved</span>
      </div>
      {loading ? (
        <div className="work-loading">
          <span /> Gathering your saved people…
        </div>
      ) : list.length ? (
        <div className="saved-people-grid">
          {list.map((person) => (
            <article className="saved-person-card" key={person.id}>
              <div
                className="saved-person-main cursor-pointer"
                onClick={() => onOpen(person)}
                role="button"
                tabIndex={0}
                title={`View ${person.name}'s profile`}
              >
                <Avatar person={person} size="lg" online={person.online} />
                <div className="saved-person-copy">
                  <h3>{person.name}</h3>
                  <small>
                    {person.location} · {person.online ? 'Online now' : person.role}
                  </small>
                  <div className="skill-list">
                    {person.teach.slice(0, 3).map((skill) => (
                      <Skill key={skill}>{skill}</Skill>
                    ))}
                    {person.learn.slice(0, 2).map((skill) => (
                      <Skill key={`learn-${skill}`} tone="coral">
                        {skill}
                      </Skill>
                    ))}
                  </div>
                </div>
              </div>
              <div className="saved-person-actions">
                <button onClick={() => onOpen(person)}>
                  View profile <ArrowRight size={14} />
                </button>
                <button
                  className="unsave-button"
                  aria-label={`Remove ${person.name} from saved people`}
                  onClick={() => onUnsave(person.id)}
                >
                  <Bookmark size={16} fill="currentColor" />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="work-empty">
          <span>
            <Bookmark size={22} />
          </span>
          <h3>Your people-to-revisit list starts here</h3>
          <p>Save a learner from Discover and their profile will stay close for your next skill swap.</p>
          <button onClick={() => onOpen(null)}>
            Explore learners <ArrowRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function DashboardLayout() {
  const { auth, logout, onUserUpdated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const searchInput = useRef(null);
  const [active, setActive] = useState('All people');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('Best match');
  const [saved, setSaved] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('peerza_saved') || '[]');
    } catch {
      return [];
    }
  });

  const [selected, setSelected] = useState(null);
  const [selectedReviews, setSelectedReviews] = useState([]);
  const [toast, setToast] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [apiPeople, setApiPeople] = useState([]);
  const [directoryLoaded, setDirectoryLoaded] = useState(false);
  const [directoryError, setDirectoryError] = useState('');
  const [directoryRevision, setDirectoryRevision] = useState(0);
  const [matchedIds, setMatchedIds] = useState({});
  const [startWith, setStartWith] = useState(null);
  const [showRequest, setShowRequest] = useState(false);
  const [meetingSent, setMeetingSent] = useState(false);

  // Notifications & Presence
  const [notifications, setNotifications] = useState([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const avatarMenuRef = useRef(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [savedDirectory, setSavedDirectory] = useState([]);
  const [savedLoading, setSavedLoading] = useState(false);

  const [showDemoAccounts, setShowDemoAccounts] = useState(false);

  // Close avatar dropdown menu on outside click
  useEffect(() => {
    if (!avatarMenuOpen) return;
    const handleOutside = (e) => {
      if (avatarMenuRef.current && !avatarMenuRef.current.contains(e.target)) {
        setAvatarMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [avatarMenuOpen]);

  // Open any user's public profile from anywhere in the app
  const openUserProfile = async (target) => {
    if (!target) return;
    const targetId = typeof target === 'string' ? target : target.id || target._id;
    if (!targetId) return;

    if (auth?.id && String(targetId) === String(auth.id)) {
      navigate('/profile');
      setSelected(null);
      return;
    }

    try {
      const { data } = await api.get(`/users/${targetId}`);
      const teach = data.skills?.filter((s) => s.type === 'teach') || [];
      const learn = data.skills?.filter((s) => s.type === 'learn') || [];
      setSelected({
        id: data._id || data.id,
        name: data.name,
        role: data.categories?.[0] || 'Peerza learner',
        bio: data.bio || 'Ready to share skills and learn something new.',
        location: data.location || 'Location not added',
        rating: data.rating ? Number(data.rating).toFixed(1) : null,
        reviews: data.reviewCount || 0,
        match: matchedIds[data._id || data.id] || 0,
        avatar: data.avatar || '',
        color: ['rose', 'blue', 'lilac', 'mint', 'peach', 'sage'][(data.name || '').length % 6],
        teach: teach.map((s) => s.name),
        learn: learn.map((s) => s.name),
        category: data.categories?.[0] || 'All people',
        categories: data.categories || [],
        availability: onlineUsers.includes(data._id || data.id) ? 'Online now' : 'Open to a skill swap',
        online: onlineUsers.includes(data._id || data.id),
        timezone: 'Send a message to find a time',
        experience: data.experience || [],
        certificates: data.certificates || [],
        evidenceComplete: data.evidenceComplete
      });
      setSelectedReviews(data.reviews || []);
      setMeetingSent(false);
    } catch (err) {
      notify('Could not load learner profile.');
    }
  };

  // Map route to page identifier
  const currentPath = location.pathname;
  const page =
    currentPath === '/matches'
      ? 'matches'
      : currentPath === '/messages'
      ? 'messages'
      : currentPath === '/sessions'
      ? 'sessions'
      : currentPath === '/saved' || currentPath === '/saved-people'
      ? 'saved'
      : currentPath === '/profile/edit'
      ? 'profile-edit'
      : currentPath === '/profile'
      ? 'profile'
      : 'discover';

  // Support direct URL routing to other profiles (/profile/:id or /users/:id)
  useEffect(() => {
    const match = location.pathname.match(/^\/(?:profile|users)\/([^/]+)/);
    if (match && match[1] && match[1] !== 'edit') {
      const targetId = match[1];
      if (auth?.id && String(targetId) === String(auth.id)) {
        return;
      }
      openUserProfile(targetId);
    }
  }, [location.pathname, auth?.id]);

  // Load directory users for discover
  useEffect(() => {
    if (!auth?.id) return;
    let alive = true;
    setDirectoryLoaded(false);
    setDirectoryError('');

    const timer = setTimeout(() => {
      api
        .get('/users', {
          params: {
            exclude: auth.id,
            search: query || undefined,
            category: active === 'All people' || active === 'All People' ? undefined : active,
            includeDemo: showDemoAccounts ? 'true' : 'false'
          }
        })
        .then(({ data }) => {
          if (alive) setApiPeople(data || []);
        })
        .catch((error) => {
          if (alive) {
            setApiPeople([]);
            setDirectoryError(
              error.response?.data?.message || 'Could not connect to the Peerza API.'
            );
          }
        })
        .finally(() => {
          if (alive) setDirectoryLoaded(true);
        });
    }, 220);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [auth?.id, query, active, directoryRevision, showDemoAccounts]);

  // Load mutual matches
  useEffect(() => {
    if (auth?.id) {
      api
        .get('/matches')
        .then(({ data }) => setMatchedIds(Object.fromEntries(data.map((m) => [m.userId, m.score]))))
        .catch(() => setMatchedIds({}));
    } else {
      setMatchedIds({});
    }
  }, [auth?.id]);

  // Keyboard shortcut Ctrl+K
  useEffect(() => {
    const onShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInput.current?.focus();
      }
      if (event.key === 'Escape') setNotificationsOpen(false);
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, []);

  // Saved people directory
  useEffect(() => {
    if (page !== 'saved') return;
    let alive = true;
    setSavedLoading(true);
    api
      .get('/users', { params: { exclude: auth?.id } })
      .then(({ data }) => {
        if (!alive) return;
        setSavedDirectory(
          (data || []).map((p) => {
            const teach = p.skills?.filter((s) => s.type === 'teach') || [];
            const learn = p.skills?.filter((s) => s.type === 'learn') || [];
            return {
              id: p._id,
              name: p.name,
              role: p.categories?.[0] || 'Peerza learner',
              bio: p.bio || 'Ready to share skills and learn something new.',
              location: p.location || 'Location not added',
              rating: p.rating ? Number(p.rating).toFixed(1) : null,
              reviews: p.reviewCount || 0,
              match: matchedIds[p._id] || 0,
              avatar: p.avatar || p.name.split(' ').map((x) => x[0]).slice(0, 2).join(''),
              color: ['rose', 'blue', 'lilac', 'mint', 'peach', 'sage'][p.name.length % 6],
              teach: teach.map((s) => s.name),
              learn: learn.map((s) => s.name),
              category: p.categories?.[0] || 'All people',
              availability: 'Open to a skill swap',
              online: onlineUsers.includes(p._id)
            };
          })
        );
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setSavedLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [page, auth?.id, saved.length, onlineUsers.length]);

  // Socket.IO presence and notification listeners
  useEffect(() => {
    if (!auth?.id) return;

    api
      .get('/notifications')
      .then(({ data }) => {
        setNotifications(data.items || []);
        setUnreadNotifications(data.unreadCount || 0);
      })
      .catch(() => {});

    const onSocketConnect = () =>
      api
        .get('/notifications')
        .then(({ data }) => {
          setNotifications(data.items || []);
          setUnreadNotifications(data.unreadCount || 0);
        })
        .catch(() => {});

    const onPresenceList = (ids) => setOnlineUsers(ids || []);
    const onPresence = ({ userId: uid, online }) =>
      setOnlineUsers((current) =>
        online ? [...new Set([...current, uid])] : current.filter((id) => id !== uid)
      );
    const onUserOnline = ({ userId: uid }) =>
      setOnlineUsers((current) => [...new Set([...current, uid])]);
    const onUserOffline = ({ userId: uid }) =>
      setOnlineUsers((current) => current.filter((id) => id !== uid));
    const onNotification = (notification) => {
      setNotifications((items) =>
        [notification, ...items.filter((item) => item._id !== notification._id)].slice(0, 30)
      );
      setUnreadNotifications((count) => count + 1);
      notify(notification.title || 'You have a new Peerza update.');
    };

    socket.on('connect', onSocketConnect);
    socket.on('presence:list', onPresenceList);
    socket.on('presence:update', onPresence);
    socket.on('user_online', onUserOnline);
    socket.on('user_offline', onUserOffline);
    socket.on('notification:new', onNotification);

    return () => {
      socket.off('connect', onSocketConnect);
      socket.off('presence:list', onPresenceList);
      socket.off('presence:update', onPresence);
      socket.off('user_online', onUserOnline);
      socket.off('user_offline', onUserOffline);
      socket.off('notification:new', onNotification);
    };
  }, [auth?.id]);

  useEffect(() => {
    localStorage.setItem('peerza_saved', JSON.stringify(saved));
  }, [saved]);

  useEffect(() => {
    if (selected?.id) {
      api
        .get(`/users/${selected.id}/reviews`)
        .then(({ data }) => setSelectedReviews(data || []))
        .catch(() => setSelectedReviews([]));
    } else {
      setSelectedReviews([]);
    }
  }, [selected?.id]);

  const directory = apiPeople.map((p) => {
    const teach = p.skills?.filter((s) => s.type === 'teach') || [];
    const learn = p.skills?.filter((s) => s.type === 'learn') || [];
    return {
      id: p._id,
      name: p.name,
      role: p.categories?.[0] || 'Peerza learner',
      bio: p.bio || 'A curious learner, ready to share skills and learn something new.',
      location: p.location || 'Location not added',
      rating: p.rating ? Number(p.rating).toFixed(1) : null,
      reviews: p.reviewCount || 0,
      match: matchedIds[p._id] || 0,
      avatar: p.avatar || '',
      color: ['rose', 'blue', 'lilac', 'mint', 'peach', 'sage'][p.name.length % 6],
      teach: teach.map((s) => s.name),
      learn: learn.map((s) => s.name),
      category: p.categories?.[0] || 'All people',
      categories: p.categories || [],
      availability: onlineUsers.includes(p._id) ? 'Online now' : 'Open to a skill swap',
      online: onlineUsers.includes(p._id),
      timezone: 'Send a message to find a time',
      experience: p.experience || [],
      certificates: p.certificates || [],
      evidenceComplete: Boolean(p.evidenceComplete)
    };
  });

  const filtered = useMemo(() => {
    let list = directory.filter((p) => {
      const matchesCategory =
        active === 'All people' ||
        active === 'All People' ||
        (p.categories && p.categories.some((c) => c.toLowerCase() === active.toLowerCase())) ||
        (p.category && p.category.toLowerCase() === active.toLowerCase()) ||
        p.teach.some((t) => t.toLowerCase().includes(active.toLowerCase()));

      const matchesQuery =
        !query ||
        [p.name, p.role, ...p.teach, ...p.learn]
          .join(' ')
          .toLowerCase()
          .includes(query.toLowerCase());

      return matchesCategory && matchesQuery;
    });
    if (sort === 'Top rated') list = [...list].sort((a, b) => Number(b.rating) - Number(a.rating));
    return list;
  }, [active, query, sort, directory]);

  const pageLabel = {
    discover: 'Discover',
    saved: 'Saved people',
    matches: 'My matches',
    messages: 'Messages',
    sessions: 'Sessions',
    profile: 'My profile',
    'profile-edit': 'Edit profile'
  }[page] || 'Discover';

  function notify(message) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2800);
  }

  function handleSignOut() {
    logout();
    navigate('/login', { replace: true });
  }

  async function requestMeeting(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await api.post('/meetings', {
        recipient: selected.id,
        proposedAt: form.get('proposedAt'),
        note: form.get('note')
      });
      setMeetingSent(true);
    } catch (error) {
      notify(error.response?.data?.message || 'Could not request session.');
    }
  }

  async function openNotification(item) {
    setNotificationsOpen(false);
    if (!item.readAt) {
      try {
        await api.patch(`/notifications/${item._id}/read`);
      } catch {}
      setNotifications((list) =>
        list.map((entry) =>
          entry._id === item._id ? { ...entry, readAt: new Date().toISOString() } : entry
        )
      );
      setUnreadNotifications((count) => Math.max(0, count - 1));
    }
    if (item.type === 'message' && item.actor) setStartWith(item.actor);
    const targetRoute = item.link ? `/${item.link}` : '/messages';
    navigate(targetRoute);
  }

  async function markAllNotificationsRead() {
    try {
      await api.patch('/notifications/read-all');
      setNotifications((list) =>
        list.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() }))
      );
      setUnreadNotifications(0);
    } catch {
      notify('Could not update notifications.');
    }
  }

  async function markConversationNotificationsRead(actorId) {
    try {
      await api.patch(`/notifications/messages/${actorId}/read`);
      setNotifications((items) =>
        items.map((item) =>
          item.type === 'message' && String(item.actor?._id) === String(actorId)
            ? { ...item, readAt: item.readAt || new Date().toISOString() }
            : item
        )
      );
      const { data } = await api.get('/notifications');
      setUnreadNotifications(data.unreadCount || 0);
    } catch {}
  }

  return (
    <div className="app-shell">
      {/* AUTHENTICATED SIDEBAR */}
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <a className="brand" href="/discover" onClick={(e) => { e.preventDefault(); navigate('/discover'); }}>
          <span className="brand-mark">
            <ArrowLeftRight size={19} />
          </span>
          peerza<span className="brand-dot">.</span>
        </a>

        <div className="workspace">
          <div className="workspace-icon">{auth?.name?.slice(0, 1) || 'P'}</div>
          <div>
            <b>{auth?.name || 'Personal space'}</b>
            <small>Your learning journey</small>
          </div>
          <ChevronDown size={15} />
        </div>

        <div className="side-label">YOUR SPACE</div>
        <nav className="nav-list">
          <button
            className={`nav-item ${page === 'discover' ? 'active' : ''}`}
            onClick={() => navigate('/discover')}
          >
            <Compass size={18} /> Discover
          </button>
          <button
            className={`nav-item ${page === 'matches' ? 'active' : ''}`}
            onClick={() => navigate('/matches')}
          >
            <Heart size={18} /> My matches
          </button>
          <button
            className={`nav-item ${page === 'messages' ? 'active' : ''}`}
            onClick={() => navigate('/messages')}
          >
            <MessageCircle size={18} /> Messages
          </button>
          <button
            className={`nav-item ${page === 'sessions' ? 'active' : ''}`}
            onClick={() => navigate('/sessions')}
          >
            <CalendarDays size={18} /> Sessions
          </button>
          <button
            className={`nav-item ${page === 'saved' ? 'active' : ''}`}
            onClick={() => navigate('/saved-people')}
          >
            <Bookmark size={18} /> Saved people
          </button>
        </nav>

        <div className="side-label category-label">EXPLORE BY</div>
        <nav className="nav-list categories-nav">
          {categories.map((cat) => {
            const Icon = iconFor[cat];
            return (
              <button
                key={cat}
                className={`nav-item ${page === 'discover' && active === cat ? 'active' : ''}`}
                onClick={() => {
                  navigate('/discover');
                  setActive(cat);
                }}
              >
                <Icon size={17} />
                {cat}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="exchange-card">
            <span className="exchange-orb">
              <Sparkles size={17} />
            </span>
            <strong>
              A little give,
              <br />a lot to gain.
            </strong>
            <p>Every person you teach helps someone else grow.</p>
            <span className="exchange-heart">✳</span>
          </div>

          <button
            className={`nav-item ${page === 'profile' || page === 'profile-edit' ? 'active' : ''}`}
            onClick={() => navigate('/profile')}
          >
            <Settings2 size={18} /> My profile
          </button>

          <button className="profile-mini" onClick={handleSignOut} title="Click to Sign Out">
            <span className="mini-avatar">
              <TopUserAvatar user={auth} />
            </span>
            <span>
              <b>{auth?.name}</b>
              <small style={{ color: '#c06b52', display: 'flex', alignItems: 'center', gap: 3 }}>
                <LogOut size={11} /> Sign out
              </small>
            </span>
            <ChevronRight size={16} />
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <button className="scrim" onClick={() => setMobileOpen(false)} aria-label="Close menu" />
      )}

      {/* AUTHENTICATED TOPBAR & MAIN CONTENT */}
      <main className="main-area" id="top">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileOpen(!mobileOpen)}>
            <Menu size={21} />
          </button>
          <div className="breadcrumb">
            Community <ChevronRight size={15} /> <b>{pageLabel}</b>
          </div>
          <div className="top-actions">
            <span className="community-status">
              <i />{' '}
              {onlineUsers.filter((id) => String(id) !== String(auth?.id)).length
                ? `${onlineUsers.filter((id) => String(id) !== String(auth?.id)).length} learner${
                    onlineUsers.filter((id) => String(id) !== String(auth?.id)).length === 1 ? '' : 's'
                  } online`
                : 'Your community is growing'}
            </span>
            <div className="notification-anchor">
              <button
                className={`icon-button notification-btn ${notificationsOpen ? 'is-open' : ''}`}
                aria-label={
                  unreadNotifications ? `Notifications (${unreadNotifications} unread)` : 'Notifications'
                }
                aria-expanded={notificationsOpen}
                onClick={() => setNotificationsOpen((open) => !open)}
              >
                <Bell size={18} />
                {Boolean(unreadNotifications) && Number(unreadNotifications) !== 0 && (
                  <span className="notification-count" aria-hidden="true">
                    {typeof unreadNotifications === 'number'
                      ? unreadNotifications > 99
                        ? '99+'
                        : unreadNotifications > 9
                        ? '9+'
                        : unreadNotifications
                      : unreadNotifications}
                  </span>
                )}
              </button>
              {notificationsOpen && (
                <section className="notification-popover">
                  <div className="notification-popover-head">
                    <div>
                      <b>Your updates</b>
                      <small>
                        {unreadNotifications ? `${unreadNotifications} unread` : 'All caught up'}
                      </small>
                    </div>
                    <button onClick={markAllNotificationsRead} disabled={!unreadNotifications}>
                      <Check size={14} /> Mark all read
                    </button>
                  </div>
                  <div className="notification-list">
                    {notifications.length ? (
                      notifications.map((item) => (
                        <button
                          key={item._id}
                          className={`notification-item ${item.readAt ? '' : 'unread'}`}
                          onClick={() => openNotification(item)}
                        >
                          <span className={`notification-kind kind-${item.type}`}>
                            {item.type === 'message' ? (
                              <MessageCircle size={16} />
                            ) : item.type === 'review' ? (
                              <Star size={16} />
                            ) : (
                              <CalendarDays size={16} />
                            )}
                          </span>
                          <span className="notification-copy">
                            <b>{item.title}</b>
                            <small>{item.body}</small>
                            <time>
                              {new Date(item.createdAt).toLocaleString(undefined, {
                                dateStyle: 'medium',
                                timeStyle: 'short'
                              })}
                            </time>
                          </span>
                          {!item.readAt && <i />}
                        </button>
                      ))
                    ) : (
                      <div className="notifications-empty">
                        <Bell size={20} />
                        <b>A little quiet in here</b>
                        <span>Messages and session updates will show up here.</span>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>
            <span className="top-divider" />
            <div className="avatar-anchor" ref={avatarMenuRef}>
              <button
                className={`top-avatar ${avatarMenuOpen ? 'is-active' : ''}`}
                onClick={() => setAvatarMenuOpen((open) => !open)}
                aria-label="Account menu"
                aria-expanded={avatarMenuOpen}
                title={`Account menu for ${auth?.name || 'user'}`}
              >
                <TopUserAvatar user={auth} />
              </button>
              {avatarMenuOpen && (
                <div className="avatar-dropdown">
                  <div className="avatar-dropdown-user">
                    <b>{auth?.name}</b>
                    <small>{auth?.email}</small>
                  </div>
                  <div className="avatar-dropdown-divider" />
                  <button
                    className="avatar-dropdown-item"
                    onClick={() => {
                      setAvatarMenuOpen(false);
                      navigate('/profile');
                    }}
                  >
                    <UserRound size={15} /> My Profile
                  </button>
                  <button
                    className="avatar-dropdown-item"
                    onClick={() => {
                      setAvatarMenuOpen(false);
                      navigate('/profile/edit');
                    }}
                  >
                    <Pencil size={15} /> Edit Profile
                  </button>
                  <div className="avatar-dropdown-divider" />
                  <button
                    className="avatar-dropdown-item signout"
                    onClick={() => {
                      setAvatarMenuOpen(false);
                      handleSignOut();
                    }}
                  >
                    <LogOut size={15} /> Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* PAGE CONTENT */}
        {page === 'discover' ? (
          <div className="content-wrap">
            <section className="welcome-row">
              <div>
                <div className="eyebrow">
                  <span className="eyebrow-spark">✳</span> THE GOOD KIND OF GROWING
                </div>
                <h1>
                  Find your people.
                  <br />
                  <span>Trade what you know.</span>
                </h1>
                <p className="intro">
                  A little of what you know can unlock a lot of what you don't.
                  <br className="desktop-only" /> Meet someone who makes learning feel like a
                  two-way street.
                </p>
              </div>
              <div className="welcome-art" aria-hidden="true">
                <div className="art-ring ring-one" />
                <div className="art-ring ring-two" />
                <div className="art-card card-left">
                  <span>you teach</span>
                  <b>Figma</b>
                </div>
                <div className="art-card card-right">
                  <span>you learn</span>
                  <b>React</b>
                </div>
                <div className="art-center">
                  <ArrowLeftRight size={25} />
                </div>
                <span className="art-star star-a">✳</span>
                <span className="art-star star-b">✴</span>
              </div>
            </section>

            <section className="stats-row">
              <div className="stat">
                <span className="stat-icon stat-leaf">
                  <GraduationCap size={18} />
                </span>
                <span>
                  <b>{apiPeople.length}</b>
                  <small>learners to meet</small>
                </span>
              </div>
              <span className="stat-divider" />
              <div className="stat">
                <span className="stat-icon stat-sun">
                  <ArrowLeftRight size={17} />
                </span>
                <span>
                  <b>{Object.keys(matchedIds).length}</b>
                  <small>mutual matches</small>
                </span>
              </div>
              <span className="stat-divider" />
              <div className="stat">
                <span className="stat-icon stat-pink">
                  <Heart size={16} />
                </span>
                <span>
                  <b>
                    {directory.reduce((n, p) => n + p.teach.length + p.learn.length, 0)}
                  </b>
                  <small>skills shared</small>
                </span>
              </div>
              <div className="stats-note">
                <span className="tiny-avatars">
                  <i>↗</i>
                  <i>↙</i>
                  <i>✳</i>
                  <i>+</i>
                </span>{' '}
                Your community at a glance
              </div>
            </section>

            <section className="discovery-section">
              <div className="section-head">
                <div>
                  <div className="section-kicker">
                    <span /> YOUR NEXT GOOD CONVERSATION
                  </div>
                  <h2>
                    People worth knowing <span className="heading-spark">✳</span>
                  </h2>
                  <p>Thoughtful matches, made by the skills you share.</p>
                </div>
                <button
                  className="view-all"
                  onClick={() => {
                    setActive('All people');
                    setQuery('');
                  }}
                >
                  View all people <ArrowRight size={16} />
                </button>
              </div>

              <div className="toolbar">
                <div className="filter-tabs">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      className={`filter-tab ${active === cat ? 'selected' : ''}`}
                      onClick={() => setActive(cat)}
                    >
                      {cat}
                      {cat === 'All people' && (
                        <span>{apiPeople.length.toString().padStart(2, '0')}</span>
                      )}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`demo-filter-pill ${showDemoAccounts ? 'is-active' : ''}`}
                    onClick={() => setShowDemoAccounts((v) => !v)}
                    title="Toggle display of sample/demo demonstration accounts"
                  >
                    {showDemoAccounts ? '✓ Demo accounts shown' : '+ Include demo accounts'}
                  </button>
                </div>
                <div className="toolbar-tools">
                  <label className="search-box">
                    <Search size={16} />
                    <input
                      ref={searchInput}
                      aria-label="Search people or skills"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Try a skill or name..."
                    />
                    <kbd>Ctrl K</kbd>
                  </label>
                  <label className="sort-select">
                    <span>Sort:</span>
                    <select value={sort} onChange={(e) => setSort(e.target.value)}>
                      <option>Best match</option>
                      <option>Top rated</option>
                    </select>
                    <ChevronDown size={14} />
                  </label>
                </div>
              </div>

              <div className="people-grid">
                {directoryLoaded &&
                  filtered.map((person, index) => (
                    <article className="person-card" key={person.id} style={{ '--i': index }}>
                      <div className="card-top">
                        <span className="match-badge">
                          <Sparkles size={12} />
                          {person.match
                            ? `Mutual · ${person.match} skill${person.match > 1 ? 's' : ''}`
                            : 'Peerza learner'}
                        </span>
                        {person.evidenceComplete && (
                          <span className="evidence-badge-mini" title="Teaching skill evidence provided">
                            <Check size={10} /> {person.certificates?.length ? 'Certificate' : 'Experience'}
                          </span>
                        )}
                        <button
                          className={`save-button ${saved.includes(person.id) ? 'is-saved' : ''}`}
                          aria-label={saved.includes(person.id) ? 'Remove saved person' : 'Save person'}
                          onClick={() =>
                            setSaved((prev) =>
                              prev.includes(person.id)
                                ? prev.filter((x) => x !== person.id)
                                : [...prev, person.id]
                            )
                          }
                        >
                          <Bookmark
                            size={17}
                            fill={saved.includes(person.id) ? 'currentColor' : 'none'}
                          />
                        </button>
                      </div>
                      <div
                        className="person-heading cursor-pointer"
                        onClick={() => openUserProfile(person)}
                        role="button"
                        tabIndex={0}
                        title={`View ${person.name}'s profile`}
                      >
                        <Avatar person={person} size="lg" online={person.online} />
                        <div className="person-name-wrap">
                          <h3>{person.name}</h3>
                          <div className="person-role">{person.role}</div>
                        </div>
                      </div>
                      <div className="person-meta">
                        <span>
                          {person.rating ? (
                            <>
                              <Star size={13} fill="currentColor" /> {person.rating}{' '}
                              <i>({person.reviews})</i>
                            </>
                          ) : (
                            'New learner'
                          )}
                        </span>
                        <span className="meta-sep">·</span>
                        <span>{person.location}</span>
                      </div>
                      <p className="person-bio">{person.bio}</p>
                      <div className="skill-block">
                        <div className="skill-label teach-label">
                          <span className="skill-arrow">↗</span> CAN TEACH
                        </div>
                        <div className="skill-list">
                          {person.teach.map((s) => (
                            <Skill key={s}>{s}</Skill>
                          ))}
                        </div>
                      </div>
                      <div className="skill-block learn-block">
                        <div className="skill-label learn-label">
                          <span className="skill-arrow">↙</span> HOPING TO LEARN
                        </div>
                        <div className="skill-list">
                          {person.learn.map((s) => (
                            <Skill key={s} tone="coral">
                              {s}
                            </Skill>
                          ))}
                        </div>
                      </div>
                      <div className="card-footer">
                        <span className="availability">
                          <i className={person.online ? 'is-online' : ''} /> {person.availability}
                        </span>
                        <button
                          className="connect-button"
                          onClick={() => openUserProfile(person)}
                        >
                          View profile <ArrowRight size={15} />
                        </button>
                      </div>
                    </article>
                  ))}
              </div>

              {directoryLoaded && !filtered.length && (
                <div className="empty-state">
                  <span>✳</span>
                  <h3>
                    {directoryError
                      ? 'Unable to load learners'
                      : apiPeople.length
                      ? 'No learners found for this search'
                      : 'You’re among the first learners here'}
                  </h3>
                  <p>
                    {directoryError ||
                      (apiPeople.length
                        ? 'Try another search or explore a different category.'
                        : 'Build your profile and add skills. Other learners will appear here when they join.')}
                  </p>
                  {directoryError ? (
                    <button onClick={() => setDirectoryRevision((v) => v + 1)}>Try again</button>
                  ) : apiPeople.length ? (
                    <button
                      onClick={() => {
                        setQuery('');
                        setActive('All people');
                      }}
                    >
                      Show everyone
                    </button>
                  ) : (
                    <button onClick={() => navigate('/profile')}>Add your skills</button>
                  )}
                </div>
              )}

              {!directoryLoaded && (
                <div className="empty-state">
                  <span>✳</span>
                  <h3>Finding your people…</h3>
                  <p>Loading Peerza learners.</p>
                </div>
              )}

              <div className="browse-note">
                <div className="browse-note-icon">
                  <Sparkles size={17} />
                </div>
                <span>
                  <b>Your kind of people are out there.</b>
                  <small>Build a profile with the skills you can share and want to learn.</small>
                </span>
                <button onClick={() => navigate('/profile')}>
                  Edit your profile <ArrowRight size={15} />
                </button>
              </div>
            </section>
            <footer className="footer">
              <span>
                Made for the beautifully curious <span className="footer-star">✳</span>
              </span>
              <span>
                Peerza © 2025 <i /> Learn together, grow together.
              </span>
            </footer>
          </div>
        ) : page === 'saved' ? (
          <SavedPeople
            people={savedDirectory}
            saved={saved}
            loading={savedLoading}
            onUnsave={(id) => setSaved((items) => items.filter((item) => item !== id))}
            onOpen={(person) => {
              if (!person) {
                navigate('/discover');
                return;
              }
              setSelected(person);
              setMeetingSent(false);
            }}
          />
        ) : (
          <Workspace
            page={page}
            auth={auth}
            people={directory}
            notify={notify}
            setPage={(p) => {
              if (p === 'saved') navigate('/saved-people');
              else if (p === 'profile-edit' || p === 'profile/edit') navigate('/profile/edit');
              else if (p === 'profile') navigate('/profile');
              else navigate(`/${p}`);
            }}
            onAuth={() => navigate('/login')}
            onUserUpdated={onUserUpdated}
            startWith={startWith}
            onNotificationRead={markConversationNotificationsRead}
            onlineUsers={onlineUsers}
            onOpenProfile={openUserProfile}
          />
        )}
      </main>

      {/* Selected Person Profile Modal */}
      {selected && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => e.target === e.currentTarget && setSelected(null)}
        >
          <section className="profile-modal">
            <button className="modal-close" onClick={() => setSelected(null)} aria-label="Close">
              <X size={19} />
            </button>
            {meetingSent ? (
              <div className="success-view">
                <div className="success-icon">
                  <Check size={27} />
                </div>
                <div className="section-kicker">A GOOD THING IS STARTING</div>
                <h2>Request sent!</h2>
                <p>
                  Your session idea is on its way to {selected.name.split(' ')[0]}. You’ll hear back
                  when they accept.
                </p>
                <button className="primary-button" onClick={() => setSelected(null)}>
                  Back to discovering <ArrowRight size={16} />
                </button>
              </div>
            ) : (
              <>
                <div className="modal-profile-head">
                  <Avatar person={selected} size="xl" online={selected.online} />
                  <div>
                    <span className="match-badge">
                      <Sparkles size={12} />
                      {selected.match ? `Mutual · ${selected.match} skills` : 'Peerza learner'}
                    </span>
                    <h2>{selected.name}</h2>
                    <p>{selected.role}</p>
                  </div>
                </div>
                <div className="modal-rating">
                  {selected.rating && (
                    <>
                      <Star size={15} fill="currentColor" />
                      {selected.rating} <span>·</span> {selected.reviews} thoughtful reviews{' '}
                      <span>·</span>
                    </>
                  )}
                  {selected.location}
                </div>

                {/* Evidence badges */}
                <div className="modal-evidence-row">
                  {selected.certificates?.length > 0 && (
                    <span className="evidence-badge cert-badge">
                      <Check size={12} /> Certificate Provided ({selected.certificates.length})
                    </span>
                  )}
                  {selected.experience?.length > 0 && (
                    <span className="evidence-badge exp-badge">
                      <Briefcase size={12} /> Experience Provided ({selected.experience.length})
                    </span>
                  )}
                  {!selected.certificates?.length && !selected.experience?.length && (
                    <span className="evidence-badge pending-badge">
                      Evidence Pending
                    </span>
                  )}
                </div>

                <p className="modal-bio">{selected.bio}</p>
                <div className="swap-panel">
                  <div>
                    <span className="skill-label teach-label">THEY CAN TEACH</span>
                    <div className="skill-list">
                      {selected.teach.map((s) => (
                        <Skill key={s}>{s}</Skill>
                      ))}
                    </div>
                  </div>
                  <ArrowLeftRight size={19} />
                  <div>
                    <span className="skill-label learn-label">THEY WANT TO LEARN</span>
                    <div className="skill-list">
                      {selected.learn.map((s) => (
                        <Skill key={s} tone="coral">
                          {s}
                        </Skill>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Professional Experience Section */}
                {selected.experience && selected.experience.length > 0 && (
                  <div className="modal-profile-section">
                    <h4><Briefcase size={14} /> Professional Experience</h4>
                    <div className="modal-exp-list">
                      {selected.experience.map((exp, idx) => (
                        <div className="modal-exp-card" key={exp._id || idx}>
                          <div className="modal-exp-head">
                            <b>{exp.title}</b>
                            <span>{exp.duration}</span>
                          </div>
                          <small className="modal-exp-org">{exp.organization}</small>
                          {exp.description && <p className="modal-exp-desc">{exp.description}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Certificates Section */}
                {selected.certificates && selected.certificates.length > 0 && (
                  <div className="modal-profile-section">
                    <h4><Award size={14} /> Certificates & Credentials</h4>
                    <div className="modal-cert-list">
                      {selected.certificates.map((cert, idx) => {
                        const certUrl = getAvatarUrl(cert.fileUrl);
                        return (
                          <div className="modal-cert-card" key={cert._id || idx}>
                            <div className="modal-cert-meta">
                              <b>{cert.title}</b>
                              <small>{cert.issuer || 'Credential'}{cert.skill ? ` · For ${cert.skill}` : ''}</small>
                            </div>
                            {certUrl && (
                              <a
                                href={certUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="modal-cert-view-btn"
                              >
                                View <ExternalLink size={12} />
                              </a>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="modal-availability">
                  <CalendarDays size={16} />
                  {selected.availability} <span>·</span> {selected.timezone}
                </div>
                <button
                  className="primary-button full-button"
                  onClick={() => setShowRequest(true)}
                >
                  Request a session <ArrowRight size={16} />
                </button>
                <button
                  className="secondary-button full-button"
                  onClick={() => {
                    setStartWith(selected);
                    navigate('/messages');
                    setSelected(null);
                  }}
                >
                  <MessageCircle size={16} /> Send a message
                </button>
                <button
                  className="secondary-button full-button"
                  onClick={() => {
                    setSaved((p) =>
                      p.includes(selected.id) ? p.filter((x) => x !== selected.id) : [...p, selected.id]
                    );
                    notify('Added to your people to revisit.');
                  }}
                >
                  <Heart size={16} /> Save for later
                </button>
                <div className="profile-reviews">
                  <div className="modal-reviews-head">
                    <h3>Reviews from learners</h3>
                    {selected.rating && (
                      <span className="modal-avg-rating">
                        <Star size={13} fill="currentColor" /> {selected.rating}/5 ({selected.reviews} review{selected.reviews === 1 ? '' : 's'})
                      </span>
                    )}
                  </div>
                  {selectedReviews.length ? (
                    selectedReviews.map((r) => (
                      <div className="profile-review" key={r._id}>
                        <div className="review-header-row">
                          <div
                            className="review-author cursor-pointer"
                            onClick={() => {
                              if (r.reviewer?._id) openUserProfile(r.reviewer._id);
                            }}
                            title={`View ${r.reviewer?.name || 'Reviewer'}'s profile`}
                          >
                            <Avatar person={{ name: r.reviewer?.name || 'Learner', avatar: r.reviewer?.avatar }} size="sm" />
                            <b>{r.reviewer?.name || 'Peerza learner'}</b>
                          </div>
                          <span className="review-stars">
                            <Star size={12} fill="currentColor" /> {r.rating}/5
                          </span>
                        </div>
                        {r.comment && <p className="review-body">{r.comment}</p>}
                        <small className="review-timestamp">
                          {new Date(r.createdAt || Date.now()).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </small>
                      </div>
                    ))
                  ) : (
                    <p className="no-reviews">No reviews yet. Be the first to learn together.</p>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {/* Meeting Request Form Modal */}
      {showRequest && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => e.target === e.currentTarget && setShowRequest(false)}
        >
          <section className="form-modal">
            <button className="modal-close" onClick={() => setShowRequest(false)}>
              <X size={19} />
            </button>
            <div className="section-kicker">
              <span /> YOUR FIRST HELLO
            </div>
            <h2>Make a little time to learn.</h2>
            <p>Suggest a time to meet {selected?.name.split(' ')[0]} for a skill swap.</p>
            <form onSubmit={requestMeeting}>
              <label>
                When works for you?
                <input
                  type="datetime-local"
                  name="proposedAt"
                  required
                  min={new Date(Date.now() + 3600000).toISOString().slice(0, 16)}
                />
              </label>
              <label>
                A little context{' '}
                <textarea
                  name="note"
                  placeholder="What would you love to learn or share?"
                  rows="3"
                />
              </label>
              <button className="primary-button full-button">
                Send meeting request <ArrowRight size={16} />
              </button>
            </form>
          </section>
        </div>
      )}

      {toast && (
        <div className="toast">
          <span>✳</span>
          {toast}
          <button onClick={() => setToast('')}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
