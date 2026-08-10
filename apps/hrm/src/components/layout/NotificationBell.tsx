'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, CheckCheck, ExternalLink, Info, AlertTriangle, ShieldAlert } from 'lucide-react';
import { getNotifications, markNotificationAsRead, markAllNotificationsAsRead } from '@/app/actions/notifications';
import { useHrmRole } from '@/lib/useHrmRole';
import { useTheme } from './ThemeContext';
import Link from 'next/link';

export default function NotificationBell({ userId }: { userId?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { role } = useHrmRole();
  const { colorMode } = useTheme();
  const isLightMode = (role === 'RBT' || role === 'APPLICANT') && colorMode === 'light';

  // Demo Role-Based Notifications
  const roleNotifications: Record<string, any[]> = {
    APPLICANT: [
      { id: 'n-app-1', title: 'Welcome to Rise & Shine ABA!', message: 'Your application has been received. Complete your 6 onboarding tasks below.', type: 'INFO', createdAt: new Date().toISOString(), isRead: false },
      { id: 'n-app-2', title: 'Action Required: 40-Hr Certificate', message: 'Upload your 40-Hour BACB Training Certificate to upgrade your pay tier.', type: 'WARNING', createdAt: new Date().toISOString(), isRead: false },
    ],
    RBT: [
      { id: 'n-rbt-1', title: 'New Client Assignment Available', message: 'A 15 hr/week case in Park Slope, Brooklyn is ready for assignment.', type: 'INFO', linkUrl: '/rbt/job-board', createdAt: new Date().toISOString(), isRead: false },
      { id: 'n-rbt-2', title: 'SOAP Note Reminder', message: 'Please submit your SOAP notes for yesterday\'s completed direct session.', type: 'WARNING', linkUrl: '/session-emr', createdAt: new Date().toISOString(), isRead: false },
    ],
    HR_AGENT: [
      { id: 'n-hr-1', title: 'New Applicant Submitted', message: 'azm karim submitted an RBT job application on the career portal.', type: 'INFO', linkUrl: '/ats', createdAt: new Date().toISOString(), isRead: false },
      { id: 'n-hr-2', title: 'Background Check Pending', message: 'NYS DOH background clearance result pending for applicant Sarah Jenkins.', type: 'WARNING', linkUrl: '/ats', createdAt: new Date().toISOString(), isRead: false },
    ],
    HEAD_HR: [
      { id: 'n-[#F97316]-1', title: 'Staffing Dispatch Required', message: 'Case Coordinator requested 2 RBTs for high-priority Medicaid client in Queens.', type: 'ALERT', linkUrl: '/clients', createdAt: new Date().toISOString(), isRead: false },
    ],
    FINANCE: [
      { id: 'n-fin-1', title: 'Bi-Weekly Payroll Ready', message: 'Review 42 RBT billable session timesheets before Friday disbursement.', type: 'INFO', linkUrl: '/payroll', createdAt: new Date().toISOString(), isRead: false },
    ]
  };

  const loadNotifications = () => {
    // Strictly load role-segregated notifications for demo persona switching
    const roleItems = roleNotifications[role] || [];
    setNotifications(roleItems);
    setUnreadCount(roleItems.filter(n => !n.isRead).length);
  };

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 15000); // Poll every 15s
    return () => clearInterval(interval);
  }, [userId, role]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkRead = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    markNotificationAsRead(id).then(res => {
      if (res?.success) {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    });
  };

  const handleMarkAllRead = () => {
    markAllNotificationsAsRead(userId).then(res => {
      if (res?.success) {
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
        setUnreadCount(0);
      }
    });
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        suppressHydrationWarning
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2.5 rounded-2xl transition-all cursor-pointer shadow-sm hover:scale-105 ${
          isLightMode 
            ? 'bg-[#FFFDF8] hover:bg-[#FFEBD6] border-2 border-[#E2D5B7] text-slate-800 shadow-orange-500/5' 
            : 'bg-zinc-900/80 hover:bg-zinc-800 border border-white/10 text-zinc-400 hover:text-white'
        }`}
        title="Notifications"
      >
        <Bell className={`w-5 h-5 ${isLightMode ? 'text-[#F97316]' : 'text-zinc-400'}`} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#F97316] text-[10px] font-bold text-white shadow-lg animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className={`absolute right-0 mt-3 w-80 sm:w-96 rounded-3xl shadow-2xl z-50 overflow-hidden animate-slide-up ${
          isLightMode
            ? 'bg-[#FFFDF9] border-2 border-[#E2D5B7] text-slate-900'
            : 'bg-zinc-950/95 backdrop-blur-xl border border-white/10 text-white'
        }`}>
          <div className={`p-4 border-b flex items-center justify-between ${
            isLightMode ? 'bg-[#FFEEDD] border-orange-100' : 'bg-zinc-900/50 border-white/5'
          }`}>
            <div className="flex items-center gap-2">
              <h3 className={`font-black text-sm ${isLightMode ? 'text-slate-900' : 'text-white'}`}>Notifications</h3>
              {unreadCount > 0 && (
                <span className="bg-orange-100 text-[#F97316] border border-orange-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[11px] font-bold text-[#F97316] hover:text-orange-600 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" /> Mark all read
              </button>
            )}
          </div>

          <div className={`max-h-96 overflow-y-auto divide-y custom-scrollbar ${
            isLightMode ? 'divide-orange-100' : 'divide-white/5'
          }`}>
            {notifications.length === 0 ? (
              <div className={`p-8 text-center text-xs font-semibold ${isLightMode ? 'text-slate-600' : 'text-zinc-500'}`}>
                No notifications right now.
              </div>
            ) : (
              notifications.map(item => (
                <div
                  key={item.id}
                  className={`p-4 transition-colors flex items-start gap-3 ${
                    item.isRead 
                      ? (isLightMode ? 'bg-slate-50/50 opacity-75' : 'bg-zinc-950/40 opacity-75') 
                      : (isLightMode ? 'bg-orange-50/40 hover:bg-orange-50' : 'bg-zinc-900/40 hover:bg-zinc-900')
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {item.type === 'ALERT' ? (
                      <ShieldAlert className="w-4 h-4 text-red-500" />
                    ) : item.type === 'WARNING' ? (
                      <AlertTriangle className="w-4 h-4 text-[#F97316]" />
                    ) : (
                      <Info className="w-4 h-4 text-blue-600" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className={`text-xs font-bold truncate ${isLightMode ? 'text-slate-900' : 'text-white'}`}>{item.title}</h4>
                      {!item.isRead && (
                        <button
                          onClick={(e) => handleMarkRead(item.id, e)}
                          className={`cursor-pointer shrink-0 ${isLightMode ? 'text-slate-400 hover:text-slate-800' : 'text-zinc-500 hover:text-white'}`}
                          title="Mark read"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <p className={`text-xs mt-1 line-clamp-2 ${isLightMode ? 'text-slate-600 font-medium' : 'text-zinc-400'}`}>{item.message}</p>

                    <div className="flex items-center justify-between mt-2 pt-1">
                      <span className={`text-[10px] ${isLightMode ? 'text-slate-500 font-semibold' : 'text-zinc-500'}`}>
                        {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>

                      {item.linkUrl && (
                        <Link
                          href={item.linkUrl}
                          onClick={() => setIsOpen(false)}
                          className="text-[11px] font-bold text-[#F97316] hover:text-orange-600 inline-flex items-center gap-1"
                        >
                          View <ExternalLink className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
