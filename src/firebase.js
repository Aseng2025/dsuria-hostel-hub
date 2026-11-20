import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

// Nilai ini awam (bukan rahsia). Keselamatan data dijaga oleh firestore.rules.
const firebaseConfig = {
  apiKey: 'AIzaSyBAJoqW56q2oLxHtVYAIy6iDHFz1sq90F0',
  authDomain: 'dsuria-hostel-hub.firebaseapp.com',
  projectId: 'dsuria-hostel-hub',
  storageBucket: 'dsuria-hostel-hub.firebasestorage.app',
  messagingSenderId: '454879529257',
  appId: '1:454879529257:web:262303673115fd98484f38',
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export const provider = new GoogleAuthProvider()
export const SUPER_ADMIN_EMAIL = 'mhybsi91@gmail.com'
