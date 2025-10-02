import admin from 'firebase-admin';
import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

// Import nodemailer for Gmail SMTP
let nodemailer: any;
try {
  nodemailer = require('nodemailer');
} catch (error) {
  console.warn('Nodemailer package not found. Email functionality will be disabled.');
}

const firebaseAdmin = admin.initializeApp({
  credential: admin.credential.cert({
    type: process.env.FIREBASE_TYPE,
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY,
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI,
    token_uri: process.env.FIREBASE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
    client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
    universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN,
  } as admin.ServiceAccount),
});

function listAllFirebaseUsers(): Promise<any[]> {
  return new Promise((resolve, reject) => {
    let allUsers: any[] = [];

    function listUsersRecursively(pageToken?: string) {
      firebaseAdmin
        .auth()
        .listUsers(1000, pageToken)
        .then((listUsersResult) => {
          const users = listUsersResult.users;
          allUsers = allUsers.concat(users);

          if (listUsersResult.pageToken) {
            listUsersRecursively(listUsersResult.pageToken);
          } else {
            resolve(allUsers);
          }
        })
        .catch((error) => {
          reject(error);
        });
    }
    listUsersRecursively();
  });
}

async function isEmailInFirebase(email: string): Promise<boolean> {
  try {
    const firebaseUser = await firebaseAdmin.auth().getUserByEmail(email);
    if (firebaseUser?.uid) {
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

async function isUidInFirebase(uid: string): Promise<boolean> {
  try {
    const userRecord = await firebaseAdmin.auth().getUser(uid);
    if (userRecord) {
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

interface CreateUserData {
  email: string;
  password?: string;
}

// Function to generate random password
function generateRandomPassword(length: number = 12): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let password = '';

  // Ensure at least one character from each category
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';

  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];

  // Fill the rest with random characters
  for (let i = 3; i < length; i++) {
    password += charset[Math.floor(Math.random() * charset.length)];
  }

  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

async function createUser(userData: CreateUserData): Promise<{ uid: string; email: string; password: string }> {
  try {
    // Check if email already exists
    const emailExists = await isEmailInFirebase(userData.email);
    if (emailExists) {
      throw new Error('Email already exists in the system');
    }

    // Generate random password if not provided
    const password = userData.password || generateRandomPassword();

    // Create new user in Firebase Auth
    const userRecord = await firebaseAdmin.auth().createUser({
      email: userData.email,
      password: password,
    });

    return {
      uid: userRecord.uid,
      email: userRecord.email || userData.email,
      password: password
    };
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
}

// Function to send welcome email with reset password link using Gmail SMTP
async function sendWelcomeEmail(email: string, name: string): Promise<void> {
  try {
    if (!nodemailer) {
      console.warn('Nodemailer not available. Skipping email send.');
      return;
    }

    if (!process.env.GMAIL_SMTP_API_KEY) {
      console.warn('GMAIL_SMTP_API_KEY not configured. Skipping email send.');
      return;
    }

    // Create Gmail SMTP transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'bus.station.uit@gmail.com',
        pass: process.env.GMAIL_SMTP_API_KEY
      }
    });

    // Generate password reset link from Firebase
    const resetLink = await firebaseAdmin.auth().generatePasswordResetLink(email);

    await transporter.sendMail({
      from: 'bus.station.uit@gmail.com',
      to: email,
      subject: 'Chào mừng đến với hệ thống Quản lý bến xe - Đặt lại mật khẩu',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; text-align: center;">
          <h1 style="color: #F97A00; text-align: center;">🚌 Quản lý bến xe</h1>
          
          <h2 style="text-align: center;">Xin chào ${name}!</h2>
          <p style="text-align: center;">Tài khoản của bạn đã được tạo thành công.</p>
          <p style="text-align: center;"><strong>Email:</strong> <span style="color: #F97A00;">${email}</span></p>
          
          <div style="text-align: center; margin: 20px 0;">
            <a href="${resetLink}" style="background-color: #F97A00; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; transition: background-color 0.2s;">
              Đặt lại mật khẩu
            </a>
          </div>
          
          <p style="color: #666; font-size: 14px; text-align: center;">
            <strong>Lưu ý:</strong> Link sẽ hết hạn sau 1 giờ.
          </p>
          
          <p style="text-align: center; margin-top: 20px;">
            Trân trọng,<br><strong style="color: #386641;">Đội ngũ Quản lý bến xe</strong>
          </p>
        </div>
      `,
      text: `Xin chào ${name}!\n\nTài khoản của bạn đã được tạo thành công.\nEmail: ${email}\n\nĐặt lại mật khẩu: ${resetLink}\n\nLink sẽ hết hạn sau 1 giờ.\n\nTrân trọng,\nĐội ngũ Quản lý bến xe`
    });
  } catch (error) {
    console.error('Error sending welcome email:', error);
    throw error;
  }
}

async function sendPasswordResetEmail(email: string): Promise<void> {
  try {
    await firebaseAdmin.auth().generatePasswordResetLink(email);
    console.log(`Password reset email sent to: ${email}`);
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw error;
  }
}

// Function to create user and send welcome email with reset password link
async function createUserAndSendWelcomeEmail(
  userData: CreateUserData,
  fullName: string
): Promise<{ uid: string; email: string; password: string; resetLink?: string }> {
  try {
    // Create user in Firebase
    const userResult = await createUser(userData);

    // Generate reset link for response
    const resetLink = await firebaseAdmin.auth().generatePasswordResetLink(userResult.email);

    // Send welcome email with reset password link
    await sendWelcomeEmail(userResult.email, fullName);

    return {
      ...userResult,
      resetLink: resetLink
    };
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
}

export {
  listAllFirebaseUsers,
  isEmailInFirebase,
  isUidInFirebase,
  createUser,
  sendPasswordResetEmail,
  generateRandomPassword,
  sendWelcomeEmail,
  createUserAndSendWelcomeEmail
};
export default firebaseAdmin;