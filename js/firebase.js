import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export const firebaseConfig = {
    apiKey: "AIzaSyAbCHPEPTaRhvz2qY1DyBxc71vEXtGhfLc",
    authDomain: "barbearia-agendamento-1ff8c.firebaseapp.com",
    projectId: "barbearia-agendamento-1ff8c",
    storageBucket: "barbearia-agendamento-1ff8c.firebasestorage.app",
    messagingSenderId: "414041810589",
    appId: "1:414041810589:web:51c4f718a6228699415674",
    measurementId: "G-KQSZGH2EPL"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export const horariosFicha = [
    "08h20", "09h00", "09h40", "10h30", "11h20", "12h00", "13h00",
    "13h40", "14h20", "15h00", "15h40", "16h30", "17h40", "18h20",
    "19h20", "20h00", "21h00", "21h40", "22h30", "23h00"
];
