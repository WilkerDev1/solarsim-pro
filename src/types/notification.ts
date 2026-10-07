export type NotificationAction = 'CREATE' | 'UPDATE' | 'SNAPSHOT' | 'CONFLICT' | 'RESTORE';

export interface TeamNotification {
  id: string;
  projectId?: string;
  projectCode?: string;
  clientName?: string;
  authorName: string;
  action: NotificationAction;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}
