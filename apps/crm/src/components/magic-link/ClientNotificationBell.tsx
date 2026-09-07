'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Bell,
  Check,
  CheckCheck,
  Info,
  AlertTriangle,
  CheckCircle2,
  MessageCircle,
  FileText,
  Calendar,
} from 'lucide-react';
import {
  getClientNotifications,
  markClientNotificationAsRead,
  markAllClientNotificationsAsRead,
} from '@/app/actions/clientNotificationActions';

type ClientNotificationItem = {
  id: string;
  title: string;
  message: string;
  type: string;
  createdAt: Date | string;
  isRead: boolean;
  linkUrl?: string | null;
};

type ClientNotificationBellProps = {
  token?: string;
  clientId?: string;
  onNavigate?: (linkUrl: string) => void;
};

function formatTimeAgo(dateInput: Date | string): string {
  const date = new Date(dateInput);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getNotificationIcon(type: string) {
  const upper = type.toUpperCase();
  if (upper.includes('MESSAGE') || upper.includes('CHAT')) {
    return <MessageCircle className="w-4 h-4 text-orange-600" />;
  }
  if (upper.includes('DOC') || upper.includes('FILE')) {
    return <FileText className="w-4 h-4 text-amber-600" />;
  }
  if (upper.includes('SCHEDULE') || upper.includes('APPT')) {
    return <Calendar className="w-4 h-4 text-blue-600" />;
  }
  if (upper.includes('ALERT') || upper.includes('APPROVED')) {
    return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
  }
  if (upper.includes('WARNING') || upper.includes('REJECT')) {
    return <AlertTriangle className="w-4 h-4 text-amber-600" />;
  }
  return <Info className="w-4 h-4 text-orange-600" />;
}

export function ClientNotificationBell({
  token,
  clientId,
  onNavigate,
}: ClientNotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<ClientNotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const accessRef = useMemo(() => ({ token, clientId }), [token, clientId]);

  useEffect(() => {
    let active = true;

    const load = () => {
      void getClientNotifications(accessRef).then((res) => {
        if (active && res.success && res.notifications) {
          setNotifications(
            res.notifications.map((n) => ({
              id: n.id,
              title: n.title,
              message: n.message,
              type: n.type,
              createdAt: n.createdAt,
              isRead: n.isRead,
              linkUrl: n.linkUrl,
            }))
          );
          setUnreadCount(res.unreadCount);
        }
      });
    };

    load();
    const interval = window.setInterval(load, 20000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [accessRef]);

  // Dismiss on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkRead = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    void markClientNotificationAsRead(accessRef, id).then((res) => {
      if (res?.success) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    });
  };

  const handleMarkAllRead = () => {
    void markAllClientNotificationsAsRead(accessRef).then((res) => {
      if (res?.success) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        setUnreadCount(0);
      }
    });
  };

  const handleNotificationClick = (item: ClientNotificationItem) => {
    if (!item.isRead) {
      void markClientNotificationAsRead(accessRef, item.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
    setIsOpen(false);

    if (item.linkUrl) {
      if (onNavigate) {
        onNavigate(item.linkUrl);
      } else if (item.linkUrl.startsWith('#')) {
        const el = document.querySelector(item.linkUrl);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      } else {
        window.location.assign(item.linkUrl);
      }
    }
  };

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`Notifications (${unreadCount} unread)`}
        className={`relative p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center ${
          unreadCount > 0
            ? 'bg-orange-50/80 border-orange-300 text-orange-600 hover:bg-orange-100/80 shadow-xs'
            : 'bg-white/90 border-[#E2D5B7] text-slate-600 hover:text-slate-900 hover:border-orange-400'
        }`}
      >
        <Bell className="w-4 h-4 sm:w-5 sm:h-5 transition-transform group-hover:scale-110" />

        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] px-1 items-center justify-center rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-[10px] font-bold text-white font-mono shadow-sm animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white border-2 border-[#E2D5B7] rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Header */}
          <div className="px-4 py-3 bg-[#F9F5EC] border-b border-[#E2D5B7] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-heading text-sm font-bold text-slate-900">
                Notifications
              </span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-orange-100 border border-orange-300 text-[10px] font-bold text-orange-700 font-mono">
                  {unreadCount} new
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-[11px] font-mono font-bold text-orange-600 hover:text-orange-800 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          {/* Notification List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-[#E2D5B7]/50">
            {notifications.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-10 h-10 rounded-full bg-orange-50 border border-orange-200 text-orange-500 flex items-center justify-center mx-auto mb-2.5">
                  <Bell className="w-5 h-5 opacity-60" />
                </div>
                <p className="text-xs font-bold text-slate-800">All caught up!</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  You have no notifications right now.
                </p>
              </div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleNotificationClick(item)}
                  className={`p-3.5 transition-colors cursor-pointer flex items-start gap-3 hover:bg-[#FFF5ED] text-left group ${
                    !item.isRead ? 'bg-orange-50/30' : 'bg-white'
                  }`}
                >
                  <div className="w-7 h-7 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-110 transition-transform">
                    {getNotificationIcon(item.type)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <p
                        className={`text-xs truncate ${
                          !item.isRead
                            ? 'font-bold text-slate-900'
                            : 'font-semibold text-slate-700'
                        }`}
                      >
                        {item.title}
                      </p>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">
                        {formatTimeAgo(item.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                      {item.message}
                    </p>
                  </div>

                  {!item.isRead && (
                    <button
                      type="button"
                      onClick={(e) => handleMarkRead(item.id, e)}
                      className="p-1 text-slate-400 hover:text-orange-600 rounded-md hover:bg-orange-100/60 transition shrink-0 cursor-pointer"
                      title="Mark as read"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
