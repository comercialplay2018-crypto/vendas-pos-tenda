
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyA-1DpjgFpC_y1e35iWbnaZBrYAPEUx8_M",
  authDomain: "base-de-produtos-503a5.firebaseapp.com",
  databaseURL: "https://base-de-produtos-503a5-default-rtdb.firebaseio.com",
  projectId: "base-de-produtos-503a5",
  storageBucket: "base-de-produtos-503a5.firebasestorage.app",
  messagingSenderId: "554284755002",
  appId: "1:554284755002:web:b4a7adec503ac807c36d03",
  measurementId: "G-CFRWLZJCX6"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);
