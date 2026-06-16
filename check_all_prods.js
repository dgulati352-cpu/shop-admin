const https = require('https');

https.get('https://firestore.googleapis.com/v1/projects/shop-e1ee5/databases/(default)/documents/products', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      if (json.documents) {
        console.log(`Total products found: ${json.documents.length}`);
        json.documents.forEach(doc => {
          const fields = doc.fields;
          const name = fields.name ? fields.name.stringValue : 'No Name';
          const category = fields.category ? fields.category.stringValue : 'No Category';
          const hasSizes = fields.hasSizes ? fields.hasSizes.booleanValue : false;
          console.log(`[${category}] ${name} - hasSizes: ${hasSizes}`);
        });
      }
    } catch(e) {
      console.error(e);
    }
  });
});
