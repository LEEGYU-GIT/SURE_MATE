import { Notification } from 'electron'

/** Windows 알림(소리 없음). 알림 글은 사용자에게만 보이고 로그에는 남기지 않는다 */
export function notify(message: string): void {
  if (Notification.isSupported()) new Notification({ title: 'Sure-Mate', body: message, silent: true }).show()
}
