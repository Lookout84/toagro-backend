import dotenv from 'dotenv';
import sgMail from '@sendgrid/mail';
import { logger } from './logger';
import { env } from '../config/env';

dotenv.config();

// Ініціалізація SendGrid
sgMail.setApiKey(env.SMTP_PASSWORD);

interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Відправка email через SendGrid
 */
export const sendEmail = async ({ to, subject, text, html }: EmailOptions) => {
  try {
    const msg = {
      to,
      from: env.EMAIL_FROM,
      subject,
      text,
      html,
    };

    const result = await sgMail.send(msg);
    logger.info(`Email sent to ${to}`, { messageId: result[0].headers['x-message-id'] });
    return true;
  } catch (error) {
    logger.error('Failed to send email', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      to,
      subject
    });
    throw new Error('Failed to send email');
  }
};

/**
 * Відправка email для підтвердження пошти
 */
export const sendVerificationEmail = async (email: string, token: string) => {
  const verificationUrl = `${env.CLIENT_URL}/verify-email?token=${token}`;
  
  const subject = 'Підтвердіть вашу електронну адресу';
  const text = `Перейдіть за посиланням для підтвердження: ${verificationUrl}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2d3748;">Ласкаво просимо до AgroMarket!</h2>
      <p style="font-size: 16px; color: #4a5568;">
        Будь ласка, натисніть кнопку нижче для підтвердження вашої електронної адреси:
      </p>
      <a href="${verificationUrl}" 
         style="display: inline-block; padding: 12px 24px; 
                background-color: #48bb78; color: white; 
                text-decoration: none; border-radius: 4px;
                font-weight: 500; margin: 20px 0;">
        Підтвердити Email
      </a>
      <p style="font-size: 14px; color: #718096;">
        Якщо ви не реєструвались на нашому сайті, проігноруйте це повідомлення.
      </p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject,
    text,
    html
  });
};

// ... (існуючий код)

// Загальні стилі для всіх листів
const baseStyles = {
    fontFamily: 'Arial, sans-serif',
    maxWidth: '600px',
    margin: '0 auto',
    colorPrimary: '#2d3748',
    colorSecondary: '#4a5568',
    buttonBg: '#48bb78',
    buttonText: 'white',
  };
  
  /**
   * Відправка листа для скидання паролю
   */
  export const sendPasswordResetEmail = async (email: string, token: string) => {
    const resetUrl = `${env.CLIENT_URL}/reset-password?token=${token}`;
    
    const subject = 'Скидання пароля';
    const text = `Перейдіть за посиланням для скидання пароля: ${resetUrl}`;
    const html = `
      <div style="${Object.entries(baseStyles).map(([k,v]) => `${k}:${v}`).join(';')}">
        <h2 style="color: ${baseStyles.colorPrimary};">Скидання пароля</h2>
        <p style="font-size: 16px; color: ${baseStyles.colorSecondary};">
          Натисніть кнопку нижче, щоб встановити новий пароль:
        </p>
        <a href="${resetUrl}" 
           style="display: inline-block; padding: 12px 24px; 
                  background-color: ${baseStyles.buttonBg}; 
                  color: ${baseStyles.buttonText}; 
                  text-decoration: none; border-radius: 4px;
                  font-weight: 500; margin: 20px 0;">
          Скинути пароль
        </a>
        <p style="font-size: 14px; color: #718096;">
          Посилання дійсне протягом 1 години.
        </p>
      </div>
    `;
  
    return sendEmail({ to: email, subject, text, html });
  };
  
  /**
   * Сповіщення про нове повідомлення
   */
  export const sendNewMessageNotification = async (
    email: string,
    senderName: string,
    messagePreview: string,
    listingTitle: string
  ) => {
    const subject = `Нове повідомлення щодо "${listingTitle}"`;
    const text = `Від: ${senderName}\nПовідомлення: ${messagePreview}`;
    const html = `
      <div style="${Object.entries(baseStyles).map(([k,v]) => `${k}:${v}`).join(';')}">
        <h2 style="color: ${baseStyles.colorPrimary};">Нове повідомлення</h2>
        <p style="color: ${baseStyles.colorSecondary};">
          <strong>Від:</strong> ${senderName}<br>
          <strong>Оголошення:</strong> ${listingTitle}
        </p>
        <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          ${messagePreview}
        </div>
        <a href="${env.CLIENT_URL}/messages" 
           style="display: inline-block; padding: 12px 24px; 
                  background-color: ${baseStyles.buttonBg}; 
                  color: ${baseStyles.buttonText}; 
                  text-decoration: none; border-radius: 4px;">
          Перейти до чату
        </a>
      </div>
    `;
  
    return sendEmail({ to: email, subject, text, html });
  };
  
  /**
   * Сповіщення про статус транзакції
   */
  export const sendTransactionStatusUpdate = async (
    email: string,
    transactionId: string,
    status: string,
    listingTitle: string
  ) => {
    const subject = `Статус вашої транзакції: ${status}`;
    const text = `Транзакція #${transactionId} ("${listingTitle}") - новий статус: ${status}`;
    const statusColor = status === 'Успішно' ? '#48bb78' : '#f56565';
  
    const html = `
      <div style="${Object.entries(baseStyles).map(([k,v]) => `${k}:${v}`).join(';')}">
        <h2 style="color: ${statusColor};">Статус транзакції оновлено</h2>
        <p style="color: ${baseStyles.colorSecondary};">
          <strong>Оголошення:</strong> ${listingTitle}<br>
          <strong>ID транзакції:</strong> ${transactionId}
        </p>
        <div style="margin: 20px 0; padding: 16px; 
             background: #f7fafc; border-left: 4px solid ${statusColor};">
          <h3 style="margin: 0; color: ${statusColor};">${status}</h3>
        </div>
        <a href="${env.CLIENT_URL}/transactions/${transactionId}" 
           style="display: inline-block; padding: 12px 24px; 
                  background-color: ${baseStyles.buttonBg}; 
                  color: ${baseStyles.buttonText}; 
                  text-decoration: none; border-radius: 4px;">
          Деталі транзакції
        </a>
      </div>
    `;
  
    return sendEmail({ to: email, subject, text, html });
  };
  
  /**
   * Рекламна розсилка
   */
  export const sendNewsletter = async (
    emails: string[],
    subject: string,
    content: string
  ) => {
    const html = `
      <div style="${Object.entries(baseStyles).map(([k,v]) => `${k}:${v}`).join(';')}">
        ${content}
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
          <p style="font-size: 12px; color: #718096;">
            Ви отримали цей лист, тому що підписані на розсилку AgroMarket.
            <br>
            <a href="${env.CLIENT_URL}/unsubscribe" style="color: #718096;">
              Відписатися
            </a>
          </p>
        </div>
      </div>
    `;
  
    return Promise.all(
      emails.map(email => 
        sendEmail({ to: email, subject, text: content, html })
      )
      .then(() => true)
      .catch(() => false);
  };