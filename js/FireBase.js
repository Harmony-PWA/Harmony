 import { initializeApp } from "https://www.gstatic.com/firebasejs/9.3.0/firebase-app.js";
 import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.3.0/firebase-analytics.js";

 const firebaseConfig = {
     apiKey: "AIzaSyB4guYnmOnCKVcGvmz8WnLlA7PxGlShl70",
     authDomain: "harmony-5601d.firebaseapp.com",
     projectId: "harmony-5601d",
     storageBucket: "harmony-5601d.appspot.com",
     messagingSenderId: "503836104173",
     appId: "1:503836104173:web:2c35a1bad1ae33181b83e4",
     measurementId: "G-WN0VLLW185"
 };
 const app = initializeApp(firebaseConfig);
 const analytics = getAnalytics(app);