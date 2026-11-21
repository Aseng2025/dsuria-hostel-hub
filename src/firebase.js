import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

// Firebase Web config is public by design. Protect data with Firestore Rules.
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
export const storage = getStorage(app)
export const provider = new GoogleAuthProvider()
provider.setCustomParameters({ prompt: 'select_account' })
export const SUPER_ADMIN_EMAIL = 'mhybsi91@gmail.com'
