import nodemailer from 'nodemailer'
import { ENV } from './env'

export async function sendNotificationMail(to: string, subject: string, text: string): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: ENV.NOTIFY_SMTP_HOST,
    port: ENV.NOTIFY_SMTP_PORT,
    secure: ENV.NOTIFY_SMTP_PORT === 465,
    auth: {
      user: ENV.NOTIFY_SMTP_USER,
      pass: ENV.NOTIFY_SMTP_PASS
    }
  })

  await transporter.sendMail({
    from: ENV.NOTIFY_SMTP_USER,
    to,
    subject,
    text
  })
}
