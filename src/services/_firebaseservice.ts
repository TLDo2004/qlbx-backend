import admin from 'firebase-admin';
import { config as dotenvConfig } from 'dotenv';
// import { Resend } from 'resend';
dotenvConfig();

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

// Function to send welcome email with login credentials using Resend
async function sendWelcomeEmail(email: string, name: string, domainType: 'admin' | 'agent' = 'admin'): Promise<void> {
  try {
    // const resend = new Resend(process.env.RESEND_API_KEY);
    console.log(`Welcome email would be sent to: ${email} for ${name}`);
    return;

    /* Commented out email functionality
    // Create custom reset URL with only email based on domain type
    let domain: string;
    if (domainType === 'agent') {
      domain = process.env.AGENT_DOMAIN || 'http://localhost:3000';
    } else {
      domain = process.env.ADMIN_DOMAIN || 'http://localhost:3000';
    }
    const resetUrl = `${domain}/reset-password?email=${encodeURIComponent(email)}`;

    const { data, error } = await resend.emails.send({
      from: 'EPS Admin <admin@excelplannings.com>', // You can change this to your domain
      to: [email],
      subject: 'Welcome to EPS System - Login Credentials',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #2563eb; text-align: center; margin-bottom: 20px;">EPS System</h1>
          
          <h2 style="color: #333;">Hello ${name}!</h2>
          <p style="color: #666; margin-bottom: 20px;">
            Your account has been created. Email: <strong>${email}</strong>
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
              Login & Set Password
            </a>
          </div>
          
          <p style="color: #666; font-size: 12px; text-align: center;">
            Link: <code style="background-color: #f3f4f6; padding: 2px 4px; border-radius: 3px;">${resetUrl}</code>
          </p>
          
          <p style="color: #666; font-size: 12px; text-align: center; margin-top: 20px;">
            Best regards,<br><strong>EPS Team</strong>
          </p>
        </div>
      `
    });

    if (error) {
      console.error('Resend API error:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }

    console.log(`Welcome email sent successfully to: ${email}, ID: ${data?.id}`);
    console.log(`Reset URL: ${resetUrl}`);
    */
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

export {
  listAllFirebaseUsers,
  isEmailInFirebase,
  isUidInFirebase,
  createUser,
  sendPasswordResetEmail,
  generateRandomPassword,
  sendWelcomeEmail
};
export default firebaseAdmin;