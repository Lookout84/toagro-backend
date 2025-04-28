import nodemailer from 'nodemailer';
import { config } from '../config/env';
import { logger } from './logger';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{
    filename: string;
    path?: string;       // Для файлів на диску
    content?: string;  
    contentType?: string;
  }>;
}

const transporter = nodemailer.createTransport({
  host: config.smtpHost,
  port: config.smtpPort,
  secure: config.smtpPort === 465,
  auth: {
    user: config.smtpUser,
    pass: config.smtpPass,
  },
});

export const sendEmail = async (options: EmailOptions): Promise<boolean> => {
  try {
    const mailOptions = {
      from: `ToAgro <${config.smtpUser}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
    };

    await transporter.sendMail(mailOptions);
    logger.info(`Email sent to ${options.to}`);
    return true;
  } catch (error) {
    logger.error(`Email sending failed: ${error}`);
    return false;
  }
};

export const sendVerificationEmail = async (
  email: string,
  token: string
): Promise<boolean> => {
  const verifyUrl = `http://${config.host}:${config.port}/api/auth/verify/${token}`;
  
  return sendEmail({
    to: email,
    subject: 'Підтвердіть свою електронну адресу',
    html: `
      <h1>Підтвердження реєстрації</h1>
      <p>Дякуємо за реєстрацію в ToAgro!</p>
      <p>Щоб підтвердити вашу електронну адресу, перейдіть за посиланням нижче:</p>
      <a href="${verifyUrl}">Підтвердити електронну адресу</a>
      <p>Якщо ви не реєструвалися на нашому сайті, проігноруйте цей лист.</p>
    `,
  });
};

export const sendPasswordResetEmail = async (
  email: string,
  token: string
): Promise<boolean> => {
  const resetUrl = `http://${config.host}:${config.port}/api/auth/reset-password/${token}`;
  
  return sendEmail({
    to: email,
    subject: 'Скидання паролю',
    html: `
      <h1>Скидання паролю</h1>
      <p>Ви отримали цей лист, тому що надіслали запит на скидання паролю.</p>
      <p>Щоб скинути пароль, перейдіть за посиланням нижче:</p>
      <a href="${resetUrl}">Скинути пароль</a>
      <p>Якщо ви не надсилали запит на скидання паролю, проігноруйте цей лист.</p>
    `,
  });
};