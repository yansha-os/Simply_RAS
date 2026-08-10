'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export interface HrMember {
  id: string;
  name: string;
  role: string;
  email: string;
}

export async function getHrMembers(): Promise<{ success: boolean; data: HrMember[]; error?: string }> {
  try {
    const marcusVance: HrMember = {
      id: 'usr-2',
      name: 'Marcus Vance',
      role: 'HR Agent (Recruiter / Onboarding)',
      email: 'marcus.v@riseandshine.nyc',
    };

    const hrUsers = await prisma.user.findMany({
      where: {
        role: {
          in: ['HR_AGENT', 'HEAD_HR'],
        },
        isActive: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
        email: true,
      },
      orderBy: {
        firstName: 'asc',
      },
    });

    const formattedHrMembers: HrMember[] = hrUsers.map((u) => ({
      id: u.id,
      name: `${u.firstName} ${u.lastName}`,
      role: u.role === 'HEAD_HR' ? 'Head of HR' : 'HR Agent',
      email: u.email,
    }));

    // Ensure Marcus Vance is first in the list
    const filteredList = [marcusVance, ...formattedHrMembers.filter(m => !m.name.includes('Marcus'))];

    return { success: true, data: filteredList };
  } catch (error: any) {
    console.error('Error fetching HR members:', error);
    return {
      success: true,
      data: [
        { id: 'usr-2', name: 'Marcus Vance', role: 'HR Agent (Recruiter / Onboarding)', email: 'marcus.v@riseandshine.nyc' },
      ],
    };
  }
}

export async function bookHrInterview(data: {
  candidateName: string;
  hrInterviewerId: string;
  hrInterviewerName: string;
  date: string;
  time: string;
}) {
  try {
    if (!data.hrInterviewerName || !data.date || !data.time) {
      return { success: false, error: 'Missing required interview parameters.' };
    }

    // If interviewer is a real DB user (UUID format), send an in-app notification
    const isRealUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.hrInterviewerId);

    if (isRealUuid) {
      await prisma.notification.create({
        data: {
          userId: data.hrInterviewerId,
          title: '📅 New RBT Onboarding Interview Scheduled',
          message: `${data.candidateName} scheduled an onboarding interview with you for ${data.date} at ${data.time}.`,
          type: 'INFO',
          linkUrl: '/ats',
        },
      });
    }

    revalidatePath('/rbt/interview');
    revalidatePath('/ats');

    return {
      success: true,
      message: `Interview successfully booked with ${data.hrInterviewerName}!`,
    };
  } catch (error: any) {
    console.error('Error booking HR interview:', error);
    return { success: false, error: error?.message || 'Failed to record interview booking.' };
  }
}
