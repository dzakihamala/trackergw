// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAtZ61xs3d6aV24wS9fjkUUiclDc4pDWF0",
  authDomain: "tracker-guwa.firebaseapp.com",
  projectId: "tracker-guwa",
  storageBucket: "tracker-guwa.firebasestorage.app",
  messagingSenderId: "155501041924",
  appId: "1:155501041924:web:cf5fe186d1ab25982c1851"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);