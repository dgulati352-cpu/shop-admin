const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const defaultSlides = [
  { title: "Super Fast Delivery!", desc: "Get all your grocery essentials delivered in 10 minutes.", bg: "linear-gradient(135deg, #10b981, #059669)", order: 1 },
  { title: "Special Deal: 10% OFF", desc: "Use coupon SAVE10 to save on fruits & veg today.", bg: "linear-gradient(135deg, #f59e0b, #d97706)", order: 2 },
  { title: "Organic & Fresh", desc: "Straight from the local farm to your doorstep.", bg: "linear-gradient(135deg, #3b82f6, #2563eb)", order: 3 }
];

async function seed() {
  const batch = db.batch();
  for (const slide of defaultSlides) {
    const docRef = db.collection('banners').doc();
    batch.set(docRef, slide);
  }
  await batch.commit();
  console.log("Seeded default banners.");
}

seed();
